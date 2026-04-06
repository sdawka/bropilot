defmodule Bropilot.Api.Handlers.Domain do
  @moduledoc """
  Handlers for Act 2 (Domain Modeling) endpoints.
  Manages an Act2.Worker process via the process registry.
  """

  import Bropilot.Api.Router, only: [json: 3]

  alias Bropilot.Pipeline.Act2.Worker

  @worker_name Bropilot.Api.DomainWorker

  def status(conn) do
    case Process.whereis(@worker_name) do
      nil ->
        json(conn, 200, %{ok: true, data: %{started: false, step: nil}})

      pid ->
        state = :sys.get_state(pid)
        json(conn, 200, %{ok: true, data: %{started: true, step: to_string(state.step)}})
    end
  end

  def start(conn) do
    project_path = File.cwd!()
    recipe_dir = Path.join([project_path, ".bropilot", "recipe"])
    map_dir = Path.join([project_path, ".bropilot", "map"])

    cond do
      not File.dir?(recipe_dir) ->
        json(conn, 400, %{ok: false, error: "no .bropilot directory found — run `mix bro.init` first"})

      # Gate check: Problem Space must be filled before Act 2
      match?({:error, _}, Bropilot.Spaces.validate_gate(map_dir, :problem)) ->
        {:error, {:unfilled_slots, slots}} = Bropilot.Spaces.validate_gate(map_dir, :problem)
        slot_names = Enum.map(slots, &to_string/1) |> Enum.join(", ")
        json(conn, 400, %{ok: false, error: "Problem Space incomplete — unfilled slots: #{slot_names}. Complete Act 1 first."})

      true ->
        # Stop any existing worker
        case Process.whereis(@worker_name) do
          nil -> :ok
          pid -> GenServer.stop(pid, :normal)
        end

        requested_mode = conn.body_params["mode"]

        {extraction_mode, llm_opts} =
          case requested_mode do
            "mock" ->
              {:mock, []}

            "malformed" ->
              {:malformed, []}

            "llm" ->
              {:llm, [provider: Bropilot.LLM.provider()]}

            _ ->
              case Bropilot.LLM.provider() do
                :mock -> {:mock, []}
                provider -> {:llm, [provider: provider]}
              end
          end

        {:ok, pid} =
          Worker.start(
            project_path: project_path,
            recipe: recipe_dir,
            extraction_mode: extraction_mode,
            llm_opts: llm_opts
          )

        Process.register(pid, @worker_name)

        case Worker.run_step3(pid) do
          {:ok, prompt} ->
            json(conn, 200, %{ok: true, data: %{prompt: prompt, step: "step3"}})

          {:error, reason} ->
            json(conn, 500, %{ok: false, error: inspect(reason)})
        end
    end
  end

  def input(conn) do
    case Process.whereis(@worker_name) do
      nil ->
        json(conn, 400, %{ok: false, error: "domain worker not started — call POST /api/domain/start first"})

      pid ->
        text = conn.body_params["text"] || ""

        if String.trim(text) == "" do
          json(conn, 400, %{ok: false, error: "text must not be empty"})
        else
          case Worker.submit_input(pid, text) do
            :ok ->
              json(conn, 200, %{ok: true, data: %{status: "input_received"}})

            {:error, reason} ->
              json(conn, 500, %{ok: false, error: inspect(reason)})
          end
        end
    end
  end

  def extract(conn) do
    case Process.whereis(@worker_name) do
      nil ->
        json(conn, 400, %{ok: false, error: "domain worker not started — call POST /api/domain/start first"})

      pid ->
        case Worker.extract(pid) do
          {:ok, data} ->
            state = :sys.get_state(pid)

            response =
              case state.step do
                :step3_done ->
                  %{extracted: data, status: "step3_done", next: "step4"}

                :complete ->
                  %{extracted: data, status: "complete"}

                other ->
                  %{extracted: data, status: to_string(other)}
              end

            # If step3 is done, auto-start step4
            if state.step == :step3_done do
              case Worker.run_step4(pid) do
                {:ok, prompt} ->
                  json(conn, 200, %{
                    ok: true,
                    data: Map.put(response, :step4_prompt, prompt)
                  })

                {:error, reason} ->
                  json(conn, 200, %{
                    ok: true,
                    data: Map.put(response, :step4_error, inspect(reason))
                  })
              end
            else
              json(conn, 200, %{ok: true, data: response})
            end

          {:error, reason} ->
            json(conn, 400, %{ok: false, error: inspect(reason)})
        end
    end
  end
end

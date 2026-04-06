defmodule Bropilot.Api.Handlers.Vibe do
  @moduledoc """
  Handlers for Act 1 (Vibe Collection) endpoints.
  Manages an Act1.Worker process via the process registry.
  """

  import Bropilot.Api.Router, only: [json: 3]

  alias Bropilot.Pipeline.Act1.Worker

  @worker_name Bropilot.Api.VibeWorker

  def start(conn) do
    project_path = File.cwd!()
    recipe_dir = Path.join([project_path, ".bropilot", "recipe"])

    unless File.dir?(recipe_dir) do
      json(conn, 400, %{ok: false, error: "no .bropilot directory found — run `mix bro.init` first"})
    else
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

          "llm" ->
            {:llm, [provider: Bropilot.LLM.provider()]}

          _ ->
            # Default: use LLM if configured, mock otherwise
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

      case Worker.run_step1(pid) do
        {:ok, prompt} ->
          json(conn, 200, %{ok: true, data: %{prompt: prompt, step: "step1"}})

        {:error, reason} ->
          json(conn, 500, %{ok: false, error: inspect(reason)})
      end
    end
  end

  def input(conn) do
    case Process.whereis(@worker_name) do
      nil ->
        json(conn, 400, %{ok: false, error: "vibe worker not started — call POST /api/vibe/start first"})

      pid ->
        text = conn.body_params["text"] || ""

        case Worker.submit_input(pid, text) do
          :ok ->
            # Check if we need to get the next question (step2)
            state = :sys.get_state(pid)

            if state.step == :step2 do
              case Worker.next_question(pid) do
                {:ok, :no_more_questions} ->
                  json(conn, 200, %{ok: true, data: %{status: "no_more_questions"}})

                {:ok, question} ->
                  json(conn, 200, %{ok: true, data: %{next_question: question}})
              end
            else
              json(conn, 200, %{ok: true, data: %{status: "input_received"}})
            end

          {:error, reason} ->
            json(conn, 500, %{ok: false, error: inspect(reason)})
        end
    end
  end

  def extract(conn) do
    case Process.whereis(@worker_name) do
      nil ->
        json(conn, 400, %{ok: false, error: "vibe worker not started — call POST /api/vibe/start first"})

      pid ->
        case Worker.extract(pid) do
          {:ok, data} ->
            state = :sys.get_state(pid)

            response =
              case state.step do
                :step1_done ->
                  %{extracted: data, status: "step1_done", next: "step2"}

                :complete ->
                  %{extracted: data, status: "complete"}

                other ->
                  %{extracted: data, status: to_string(other)}
              end

            # If step1 is done, auto-start step2
            if state.step == :step1_done do
              case Worker.run_step2(pid) do
                {:ok, first_question} ->
                  json(conn, 200, %{
                    ok: true,
                    data: Map.put(response, :first_question, first_question)
                  })

                {:error, reason} ->
                  json(conn, 200, %{
                    ok: true,
                    data: Map.put(response, :step2_error, inspect(reason))
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

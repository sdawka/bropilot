defmodule Bropilot.Api.Handlers.Explore do
  @moduledoc """
  Handlers for the unified Exploration phase endpoints.
  Replaces the previous Vibe (Act 1) and Domain (Act 2) handlers.
  Manages a single Bropilot.Pipeline.Exploration.Worker process.
  """

  import Bropilot.Api.Router, only: [json: 3]

  alias Bropilot.Pipeline.Exploration.Worker
  alias Bropilot.Pipeline.Engine

  @worker_name Bropilot.Api.ExplorationWorker
  @engine_name Bropilot.Api.PipelineEngine

  # POST /api/explore/start
  def start(conn) do
    project_path = File.cwd!()
    recipe_dir = Path.join([project_path, ".bropilot", "recipe"])

    if not File.dir?(recipe_dir) do
      json(conn, 400, %{ok: false, error: "no .bropilot directory found — run `mix bro.init` first"})
    else
      case Process.whereis(@worker_name) do
        nil -> :ok
        pid -> GenServer.stop(pid, :normal)
      end

      requested_mode = conn.body_params["mode"]

      {mode, llm_opts} =
        case requested_mode do
          "mock" -> {:mock, []}
          "llm" -> {:llm, [provider: Bropilot.LLM.provider()]}
          _ ->
            case Bropilot.LLM.provider() do
              :mock -> {:mock, []}
              provider -> {:llm, [provider: provider]}
            end
        end

      case GenServer.start(Worker, [project_path: project_path, mode: mode, llm_opts: llm_opts]) do
        {:ok, pid} ->
          Process.register(pid, @worker_name)
          json(conn, 200, %{ok: true, data: %{started: true}})

        {:error, reason} ->
          json(conn, 500, %{ok: false, error: inspect(reason)})
      end
    end
  end

  # POST /api/explore/message
  def message(conn) do
    with_worker(conn, fn pid ->
      text = conn.body_params["text"] || ""

      case Worker.submit_message(pid, text) do
        :ok ->
          messages = safe_messages(pid)
          json(conn, 200, %{ok: true, data: %{message_count: length(messages)}})

        {:ok, _result} ->
          messages = safe_messages(pid)
          json(conn, 200, %{ok: true, data: %{message_count: length(messages)}})

        {:error, reason} ->
          json(conn, 500, %{ok: false, error: inspect(reason)})
      end
    end)
  end

  # POST /api/explore/buffer
  def buffer(conn) do
    with_worker(conn, fn pid ->
      text = conn.body_params["text"] || ""

      case Worker.append_buffer(pid, text) do
        :ok ->
          buf = Worker.get_buffer(pid)
          json(conn, 200, %{ok: true, data: %{buffer_size: byte_size(buf)}})

        {:error, reason} ->
          json(conn, 500, %{ok: false, error: inspect(reason)})
      end
    end)
  end

  # POST /api/explore/extract
  def extract(conn) do
    with_worker(conn, fn pid ->
      case Worker.extract(pid) do
        {:ok, result} ->
          written = extract_written_slots(result)
          json(conn, 200, %{ok: true, data: %{written_slots: written}})

        {:error, reason} ->
          json(conn, 400, %{ok: false, error: inspect(reason)})
      end
    end)
  end

  # GET /api/explore/readiness
  def readiness(conn) do
    with_worker(conn, fn pid ->
      readiness = Worker.readiness(pid)
      json(conn, 200, %{ok: true, data: normalize_readiness(readiness)})
    end)
  end

  # GET /api/explore/lenses
  def lenses(conn) do
    # Recipe lens registry is being added by another agent in parallel.
    # Return [] until that lands.
    json(conn, 200, %{ok: true, data: %{lenses: []}})
  end

  # POST /api/explore/auto
  def auto(conn) do
    with_worker(conn, fn pid ->
      enabled = !!conn.body_params["enabled"]

      case Worker.set_auto_extract(pid, enabled) do
        :ok ->
          json(conn, 200, %{ok: true, data: %{auto_extract: enabled}})

        {:error, reason} ->
          json(conn, 500, %{ok: false, error: inspect(reason)})
      end
    end)
  end

  # POST /api/explore/commit
  def commit(conn) do
    case Process.whereis(@engine_name) do
      nil ->
        json(conn, 400, %{ok: false, error: "pipeline not started — call POST /api/init first"})

      _pid ->
        case Engine.commit(@engine_name) do
          {:ok, step} ->
            step_data =
              case step do
                %{id: id, name: name, space: space} -> %{id: id, name: name, space: space}
                _ -> nil
              end

            json(conn, 200, %{ok: true, data: %{phase: "work", first_step: step_data}})

          {:error, {:unfilled_slots, %{problem: p, solution: s}}} ->
            json(conn, 422, %{
              ok: false,
              error: "unfilled_slots",
              data: %{
                problem: Enum.map(p, &to_string/1),
                solution: Enum.map(s, &to_string/1)
              }
            })

          {:error, reason} ->
            json(conn, 500, %{ok: false, error: inspect(reason)})
        end
    end
  end

  # -- Helpers --

  defp with_worker(conn, fun) do
    case Process.whereis(@worker_name) do
      nil ->
        json(conn, 400, %{ok: false, error: "exploration not started — call POST /api/explore/start first"})

      pid ->
        fun.(pid)
    end
  end

  defp safe_messages(pid) do
    try do
      Worker.messages(pid)
    catch
      _, _ -> []
    end
  end

  defp extract_written_slots(result) when is_map(result) do
    cond do
      Map.has_key?(result, :written_slots) -> result.written_slots
      Map.has_key?(result, "written_slots") -> result["written_slots"]
      true -> Map.keys(result)
    end
  end

  defp extract_written_slots(result) when is_list(result), do: result
  defp extract_written_slots(_), do: []

  defp normalize_readiness(r) when is_map(r), do: r
  defp normalize_readiness(other), do: %{value: inspect(other)}
end

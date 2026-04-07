defmodule Bropilot.Api.Handlers.Work do
  @moduledoc """
  Handlers for Act 3 (snapshot, plan, tasks, build) and version endpoints.
  """

  import Bropilot.Api.Router, only: [json: 3]

  alias Bropilot.Pipeline.Act3.{Snapshot, Diff, TaskGenerator, Executor}

  def snapshot(conn) do
    with :ok <- ensure_work_phase(),
         {:ok, map_dir} <- get_map_dir(),
         {:ok, version} <- Snapshot.create_snapshot(map_dir) do
      json(conn, 200, %{
        ok: true,
        data: %{version: version, version_id: Snapshot.format_version(version)}
      })
    else
      {:error, :not_in_work_phase} ->
        json(conn, 422, %{ok: false, error: "not_in_work_phase — call POST /api/explore/commit first"})

      {:error, msg} ->
        json(conn, 400, %{ok: false, error: to_string(msg)})
    end
  end

  def plan(conn) do
    with {:ok, map_dir} <- get_map_dir() do
      version = latest_or_param(conn, map_dir)
      {:ok, changes} = Diff.generate_change_plan(map_dir, version)
      summary = Diff.summarize(changes)

      json(conn, 200, %{
        ok: true,
        data: %{
          version: version,
          changes: length(changes),
          summary: %{
            added: summary.added,
            modified: summary.modified,
            removed: summary.removed,
            by_space: summary.by_space
          }
        }
      })
    else
      {:error, msg} -> json(conn, 400, %{ok: false, error: to_string(msg)})
    end
  end

  def tasks(conn) do
    with {:ok, map_dir} <- get_map_dir() do
      version = latest_or_param(conn, map_dir)
      {:ok, changes} = Diff.generate_change_plan(map_dir, version)
      tasks = TaskGenerator.generate_tasks(changes)
      :ok = TaskGenerator.write_tasks(tasks, map_dir, version)

      task_summaries =
        Enum.map(tasks, fn task ->
          %{
            id: task.id,
            title: task.title,
            priority: task.priority,
            status: task.status
          }
        end)

      json(conn, 200, %{
        ok: true,
        data: %{version: version, tasks: task_summaries, count: length(tasks)}
      })
    else
      {:error, msg} -> json(conn, 400, %{ok: false, error: to_string(msg)})
    end
  end

  def build(conn) do
    with :ok <- ensure_work_phase(),
         {:ok, map_dir} <- get_map_dir() do
      project_path = File.cwd!()

      # Determine execution mode from request body or default to :llm
      execution_mode =
        case conn.body_params do
          %{"mode" => "prompt_only"} -> :prompt_only
          %{"mode" => "pi"} -> :pi
          %{"mode" => "mock"} -> :mock
          _ -> :llm
        end

      opts = [map_dir: map_dir, execution_mode: execution_mode]

      case Executor.run(project_path, opts) do
        {:ok, result} ->
          json(conn, 200, %{
            ok: true,
            data: %{
              version: result.version,
              tasks_count: length(result.tasks),
              summary: result.summary,
              files_written: Map.get(result, :files_written, [])
            }
          })

        {:error, reason} ->
          json(conn, 400, %{ok: false, error: to_string(reason)})
      end
    else
      {:error, :not_in_work_phase} ->
        json(conn, 422, %{ok: false, error: "not_in_work_phase — call POST /api/explore/commit first"})

      {:error, msg} ->
        json(conn, 400, %{ok: false, error: to_string(msg)})
    end
  end

  def list_versions(conn) do
    with {:ok, map_dir} <- get_map_dir() do
      versions = Snapshot.list_versions(map_dir)

      version_data =
        Enum.map(versions, fn v ->
          %{number: v, id: Snapshot.format_version(v)}
        end)

      json(conn, 200, %{ok: true, data: %{versions: version_data}})
    else
      {:error, msg} -> json(conn, 400, %{ok: false, error: msg})
    end
  end

  def get_version(conn, v_str) do
    with {:ok, map_dir} <- get_map_dir(),
         {:ok, version} <- parse_version(v_str) do
      snapshot_data =
        case Snapshot.read_snapshot(map_dir, version) do
          {:ok, data} -> data
          _ -> nil
        end

      changes_path =
        Path.join(Snapshot.version_dir(map_dir, version), "changes.yaml")

      changes_data =
        case Bropilot.Yaml.decode_file(changes_path) do
          {:ok, data} -> data
          _ -> nil
        end

      tasks_data =
        case TaskGenerator.read_tasks(map_dir, version) do
          {:ok, tasks} ->
            Enum.map(tasks, fn t ->
              %{
                id: t.id,
                title: t.title,
                description: t.description,
                priority: t.priority,
                status: t.status,
                related_specs: t.related_specs
              }
            end)

          _ ->
            nil
        end

      json(conn, 200, %{
        ok: true,
        data: %{
          version: version,
          version_id: Snapshot.format_version(version),
          snapshot: snapshot_data,
          changes: changes_data,
          tasks: tasks_data
        }
      })
    else
      {:error, msg} -> json(conn, 400, %{ok: false, error: msg})
    end
  end

  # -- Private --

  defp ensure_work_phase do
    case Process.whereis(Bropilot.Api.PipelineEngine) do
      nil ->
        # No engine registered (e.g. tests). Allow the operation.
        :ok

      _pid ->
        case Bropilot.Pipeline.Engine.current_phase(Bropilot.Api.PipelineEngine) do
          :work -> :ok
          :complete -> :ok
          _ -> {:error, :not_in_work_phase}
        end
    end
  end

  defp get_map_dir do
    bropilot_dir = Path.join(File.cwd!(), ".bropilot")

    if File.dir?(bropilot_dir) do
      {:ok, Path.join(bropilot_dir, "map")}
    else
      {:error, "no .bropilot directory found — run `mix bro.init` first"}
    end
  end

  defp latest_or_param(conn, map_dir) do
    case conn.body_params do
      %{"version" => v} when is_integer(v) -> v
      _ -> Snapshot.latest_version(map_dir)
    end
  end

  defp parse_version(v_str) do
    # Accept "v001" or "1"
    num_str = String.trim_leading(v_str, "v")

    case Integer.parse(num_str) do
      {n, ""} when n > 0 -> {:ok, n}
      _ -> {:error, "invalid version: #{v_str}"}
    end
  end
end

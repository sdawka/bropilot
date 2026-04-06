defmodule Mix.Tasks.Bro.Build do
  @shortdoc "Dispatch and execute work tasks"

  @moduledoc """
  Reads tasks for the latest version, dispatches them via the Task Supervisor,
  and reports progress. Currently builds prompts only (actual LLM execution later).

      $ mix bro.build
  """

  use Mix.Task

  alias Bropilot.CLI.Helpers
  alias Bropilot.Pipeline.Act3.{Snapshot, TaskGenerator}
  alias Bropilot.Task.Agent

  @impl Mix.Task
  def run(_args) do
    Mix.Task.run("app.start")

    bropilot_dir = Helpers.ensure_project!()
    map_dir = Path.join(bropilot_dir, "map")
    version = Snapshot.latest_version(map_dir)

    if version == 0 do
      Helpers.print_error("No snapshots found.")
      Mix.raise("No snapshots found. Run `mix bro.snapshot` first.")
    end

    version_str = Snapshot.format_version(version)
    Helpers.print_header("Build #{version_str}")

    case TaskGenerator.read_tasks(map_dir, version) do
      {:ok, tasks} when tasks != [] ->
        dispatch_tasks(tasks)

      {:ok, []} ->
        Helpers.print_warning("No tasks found. Run `mix bro.tasks` first.")

      {:error, _} ->
        Helpers.print_error("No tasks found.")
        Mix.raise("No tasks found. Run `mix bro.tasks` first.")
    end
  end

  defp dispatch_tasks(tasks) do
    total = length(tasks)
    project_path = File.cwd!()
    bropilot_dir = Path.join(project_path, ".bropilot")
    map_dir = Path.join(bropilot_dir, "map")

    Helpers.print_info("Dispatching #{total} tasks...\n")

    results =
      tasks
      |> Enum.with_index(1)
      |> Enum.map(fn {task, index} ->
        task_data = to_agent_map(task)
        id_str = String.pad_leading(Integer.to_string(task.id), 3, "0")

        Helpers.print_progress(index, total, "##{id_str} #{task.title}")

        case Agent.start_link(task_data,
               execution_mode: :llm,
               map_dir: map_dir,
               project_path: project_path
             ) do
          {:ok, pid} ->
            case Agent.execute(pid) do
              {:ok, %{files_written: files}} ->
                Helpers.print_success(
                  "##{id_str} completed (#{length(files)} files written)"
                )

                GenServer.stop(pid)
                {:ok, task.id}

              {:ok, prompt} when is_binary(prompt) ->
                Helpers.print_success(
                  "##{id_str} completed (prompt: #{String.length(prompt)} chars)"
                )

                GenServer.stop(pid)
                {:ok, task.id}

              {:error, reason} ->
                Helpers.print_error("##{id_str} failed: #{inspect(reason)}")
                GenServer.stop(pid)
                {:error, task.id, reason}
            end

          {:error, reason} ->
            Helpers.print_error("##{id_str} failed to start: #{inspect(reason)}")
            {:error, task.id, reason}
        end
      end)

    print_summary(results)
  end

  defp print_summary(results) do
    completed = Enum.count(results, &match?({:ok, _}, &1))
    failed = Enum.count(results, &match?({:error, _, _}, &1))
    total = length(results)

    Mix.shell().info("")

    if failed == 0 do
      Helpers.print_success("#{completed}/#{total} tasks completed")
    else
      Helpers.print_warning("#{completed} tasks completed, #{failed} failed (#{total} total)")
    end
  end

  defp to_agent_map(task) do
    %{
      "id" => task.id,
      "title" => task.title,
      "description" => task.description,
      "context" => task.context,
      "definition_of_done" => task.definition_of_done,
      "dependencies" => task.dependencies,
      "priority" => Atom.to_string(task.priority),
      "related_specs" => task.related_specs,
      "status" => Atom.to_string(task.status)
    }
  end
end

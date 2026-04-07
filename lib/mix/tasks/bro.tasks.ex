defmodule Mix.Tasks.Bro.Tasks do
  @shortdoc "Generate work tasks from the latest change plan"

  @moduledoc """
  Generates work tasks from the latest change plan.
  Each change produces a task with an ID, title, description,
  context, definition of done, and priority.

      $ mix bro.tasks
  """

  use Mix.Task

  alias Bropilot.CLI.Helpers
  alias Bropilot.Pipeline.Act3.{Snapshot, Diff, TaskGenerator}

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
    Helpers.print_header("Generate Tasks — #{version_str}")

    changes = load_changes(map_dir, version)

    if changes == [] do
      Helpers.print_info("No changes to generate tasks from. Run `mix bro.plan` to check.")
    else
      tasks = TaskGenerator.generate_tasks(changes)
      :ok = TaskGenerator.write_tasks(tasks, map_dir, version)

      Helpers.print_success("Generated #{length(tasks)} tasks")
      Mix.shell().info("")
      print_task_list(tasks)
    end
  end

  defp load_changes(map_dir, version) do
    changes_path =
      Path.join(Snapshot.version_dir(map_dir, version), "changes.yaml")

    case Bropilot.Yaml.decode_file(changes_path) do
      {:ok, %{"changes" => changes_data}} ->
        Enum.map(changes_data, fn c ->
          %{
            path: c["path"],
            type: String.to_atom(c["type"]),
            old_value: c["old_value"],
            new_value: c["new_value"]
          }
        end)

      {:error, _} ->
        # If no changes.yaml, generate the change plan first
        {:ok, changes} = Diff.generate_change_plan(map_dir, version)
        changes
    end
  end

  defp print_task_list(tasks) do
    rows =
      for task <- tasks do
        id_str = "#" <> String.pad_leading(Integer.to_string(task.id), 3, "0")
        priority_str = "[#{task.priority}]"
        [id_str, priority_str, task.title]
      end

    Helpers.print_table(["ID", "Priority", "Title"], rows)
  end
end

defmodule Bropilot.Pipeline.Act3.TaskGenerator do
  @moduledoc """
  Generates work tasks from changes.
  Simple implementation that creates one task per change.
  LLM-enhanced version comes later.
  """

  alias Bropilot.Pipeline.Act3.Snapshot

  @doc """
  For each change (or group of related changes), creates a task map with:
    - id: sequential task id
    - title: human-readable title
    - description: what needs to be done
    - context: the relevant spec data from the change
    - definition_of_done: list of acceptance criteria
    - dependencies: list of dependency task ids
    - priority: :high | :medium | :low
    - related_specs: list of related spec paths
    - status: :pending

  `recipe` is accepted for future LLM-enhanced generation but currently unused.
  """
  def generate_tasks(changes, _recipe \\ nil) do
    changes
    |> Enum.with_index(1)
    |> Enum.map(fn {change, index} ->
      %{
        id: index,
        title: task_title(change),
        description: task_description(change),
        context: change.new_value || change.old_value,
        definition_of_done: definition_of_done(change),
        dependencies: [],
        priority: task_priority(change),
        related_specs: [change.path],
        status: :pending
      }
    end)
  end

  @doc """
  Writes each task as task-{NNN}.yaml in versions/v{NNN}/tasks/.
  Returns :ok on success.
  """
  def write_tasks(tasks, map_dir, version) do
    tasks_dir = Path.join(Snapshot.version_dir(map_dir, version), "tasks")
    File.mkdir_p!(tasks_dir)

    Enum.each(tasks, fn task ->
      filename = "task-" <> String.pad_leading(Integer.to_string(task.id), 3, "0") <> ".yaml"
      path = Path.join(tasks_dir, filename)

      data = %{
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

      :ok = Bropilot.Yaml.encode_to_file(data, path)
    end)

    :ok
  end

  @doc """
  Reads all tasks for a version, returning them sorted by id.
  """
  def read_tasks(map_dir, version) do
    tasks_dir = Path.join(Snapshot.version_dir(map_dir, version), "tasks")

    case File.ls(tasks_dir) do
      {:ok, files} ->
        tasks =
          files
          |> Enum.filter(&String.ends_with?(&1, ".yaml"))
          |> Enum.sort()
          |> Enum.map(fn file ->
            {:ok, data} = Bropilot.Yaml.decode_file(Path.join(tasks_dir, file))

            %{
              id: data["id"],
              title: data["title"],
              description: data["description"],
              context: data["context"],
              definition_of_done: data["definition_of_done"],
              dependencies: data["dependencies"] || [],
              priority: String.to_atom(data["priority"]),
              related_specs: data["related_specs"],
              status: String.to_atom(data["status"])
            }
          end)

        {:ok, tasks}

      {:error, reason} ->
        {:error, reason}
    end
  end

  # -- Private --

  defp task_title(%{type: :added, path: path}), do: "Implement #{path}"
  defp task_title(%{type: :modified, path: path}), do: "Update #{path}"
  defp task_title(%{type: :removed, path: path}), do: "Remove #{path}"

  defp task_description(%{type: :added, path: path}) do
    "New spec added at #{path}. Implement the corresponding functionality."
  end

  defp task_description(%{type: :modified, path: path}) do
    "Spec modified at #{path}. Update the implementation to match the new spec."
  end

  defp task_description(%{type: :removed, path: path}) do
    "Spec removed at #{path}. Remove or deprecate the corresponding functionality."
  end

  defp definition_of_done(%{type: :added}) do
    ["Implementation matches spec", "Tests written and passing", "Documentation updated"]
  end

  defp definition_of_done(%{type: :modified}) do
    ["Implementation updated to match new spec", "Existing tests updated", "No regressions"]
  end

  defp definition_of_done(%{type: :removed}) do
    ["Functionality removed or deprecated", "Related tests cleaned up", "No broken references"]
  end

  defp task_priority(%{type: :added}), do: :high
  defp task_priority(%{type: :modified}), do: :medium
  defp task_priority(%{type: :removed}), do: :low
end

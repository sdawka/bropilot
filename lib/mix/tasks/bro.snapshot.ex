defmodule Mix.Tasks.Bro.Snapshot do
  @shortdoc "Create a version snapshot of the current map"

  @moduledoc """
  Creates a versioned snapshot of the problem and solution spaces.

  Reads all YAML files from the map, bundles them into a snapshot,
  and writes it to a new version directory.

      $ mix bro.snapshot
  """

  use Mix.Task

  alias Bropilot.CLI.Helpers
  alias Bropilot.Pipeline.Act3.Snapshot

  @impl Mix.Task
  def run(_args) do
    Mix.Task.run("app.start")

    bropilot_dir = Helpers.ensure_project!()
    map_dir = Path.join(bropilot_dir, "map")

    Helpers.print_header("Snapshot")

    # Check if there's anything to snapshot
    problem_dir = Path.join(map_dir, "problem")
    solution_dir = Path.join(map_dir, "solution")

    has_content =
      has_yaml_files?(problem_dir) or has_yaml_files?(solution_dir)

    unless has_content do
      Helpers.print_warning("No specs to snapshot. Run `mix bro.server` and drive exploration via the `/api/explore/*` endpoints first.")
      return_early()
    end

    {:ok, version} = Snapshot.create_snapshot(map_dir)
    version_str = Snapshot.format_version(version)
    Helpers.print_success("Snapshot created: #{version_str}")
    print_snapshot_contents(map_dir, version)
  end

  defp return_early, do: :ok

  defp has_yaml_files?(dir) do
    case File.ls(dir) do
      {:ok, entries} ->
        Enum.any?(entries, fn entry ->
          full = Path.join(dir, entry)

          cond do
            String.ends_with?(entry, ".yaml") or String.ends_with?(entry, ".yml") -> true
            File.dir?(full) -> has_yaml_files?(full)
            true -> false
          end
        end)

      {:error, _} ->
        false
    end
  end

  defp print_snapshot_contents(map_dir, version) do
    case Snapshot.read_snapshot(map_dir, version) do
      {:ok, snapshot} ->
        rows =
          for {space_name, space_data} <- snapshot do
            count = count_entries(space_data)
            [space_name, "#{count} entries"]
          end

        if rows != [] do
          Mix.shell().info("")
          Helpers.print_table(["Space", "Contents"], rows)
        end

      {:error, _} ->
        :ok
    end
  end

  defp count_entries(data) when is_map(data) do
    Enum.reduce(data, 0, fn {_key, value}, acc ->
      if is_map(value) do
        acc + count_entries(value)
      else
        acc + 1
      end
    end)
  end

  defp count_entries(_), do: 1
end

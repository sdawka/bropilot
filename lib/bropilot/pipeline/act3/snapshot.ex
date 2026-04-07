defmodule Bropilot.Pipeline.Act3.Snapshot do
  @moduledoc """
  Pure functions for version management.
  Creates snapshots of problem/ and solution/ spaces, manages version directories.
  """

  @version_prefix "v"
  @snapshot_spaces ~w(problem solution)

  @doc """
  Reads all YAML files from map/problem/ and map/solution/ recursively,
  bundles them into a single snapshot map, determines the next version number,
  and writes snapshot.yaml to map/work/versions/v{NNN}/.

  Returns `{:ok, version}` on success.
  """
  def create_snapshot(map_dir) do
    snapshot =
      @snapshot_spaces
      |> Enum.map(fn space ->
        space_dir = Path.join(map_dir, space)
        {space, read_space_recursive(space_dir)}
      end)
      |> Map.new()

    version = latest_version(map_dir) + 1
    version_dir = version_dir(map_dir, version)
    File.mkdir_p!(version_dir)

    snapshot_path = Path.join(version_dir, "snapshot.yaml")
    :ok = Bropilot.Yaml.encode_to_file(snapshot, snapshot_path)

    {:ok, version}
  end

  @doc """
  Returns the highest version number, or 0 if none exist.
  """
  def latest_version(map_dir) do
    case list_versions(map_dir) do
      [] -> 0
      versions -> Enum.max(versions)
    end
  end

  @doc """
  Reads and returns a snapshot for the given version.
  """
  def read_snapshot(map_dir, version) do
    path = Path.join(version_dir(map_dir, version), "snapshot.yaml")
    Bropilot.Yaml.decode_file(path)
  end

  @doc """
  Returns a sorted list of version numbers found in the versions directory.
  """
  def list_versions(map_dir) do
    versions_dir = versions_dir(map_dir)

    case File.ls(versions_dir) do
      {:ok, entries} ->
        entries
        |> Enum.filter(&String.starts_with?(&1, @version_prefix))
        |> Enum.map(&parse_version/1)
        |> Enum.reject(&is_nil/1)
        |> Enum.sort()

      {:error, _} ->
        []
    end
  end

  @doc """
  Returns the path to the versions directory.
  """
  def versions_dir(map_dir) do
    Path.join([map_dir, "work", "versions"])
  end

  @doc """
  Returns the path to a specific version directory.
  """
  def version_dir(map_dir, version) do
    Path.join(versions_dir(map_dir), format_version(version))
  end

  @doc """
  Formats a version number as zero-padded string: v001, v002, etc.
  """
  def format_version(version) do
    @version_prefix <> String.pad_leading(Integer.to_string(version), 3, "0")
  end

  # -- Private --

  defp parse_version(@version_prefix <> num_str) do
    case Integer.parse(num_str) do
      {n, ""} -> n
      _ -> nil
    end
  end

  defp parse_version(_), do: nil

  defp read_space_recursive(dir) do
    case File.ls(dir) do
      {:ok, entries} ->
        entries
        |> Enum.sort()
        |> Enum.reduce(%{}, fn entry, acc ->
          full_path = Path.join(dir, entry)

          cond do
            File.dir?(full_path) ->
              sub = read_space_recursive(full_path)
              if map_size(sub) > 0, do: Map.put(acc, entry, sub), else: acc

            yaml_file?(entry) ->
              name = Path.rootname(entry, Path.extname(entry))

              case Bropilot.Yaml.decode_file(full_path) do
                {:ok, data} -> Map.put(acc, name, data)
                _ -> acc
              end

            true ->
              acc
          end
        end)

      {:error, _} ->
        %{}
    end
  end

  defp yaml_file?(filename) do
    String.ends_with?(filename, ".yaml") or String.ends_with?(filename, ".yml")
  end
end

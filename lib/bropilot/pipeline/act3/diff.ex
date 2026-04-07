defmodule Bropilot.Pipeline.Act3.Diff do
  @moduledoc """
  Pure functions for diffing snapshots.
  Produces path-based change lists from two snapshot maps.
  """

  alias Bropilot.Pipeline.Act3.Snapshot

  @doc """
  Deep diff of two snapshot maps.
  Returns a list of changes, each being:
    %{path: "solution.specs.api", type: :added | :modified | :removed, old_value: ..., new_value: ...}
  """
  def diff(old_snapshot, new_snapshot) do
    deep_diff(old_snapshot, new_snapshot, [])
    |> List.flatten()
    |> Enum.sort_by(& &1.path)
  end

  @doc """
  Diffs version N against version N-1 (or empty map for v001).
  Writes changes.yaml to the version dir.
  Returns `{:ok, changes}` on success.
  """
  def generate_change_plan(map_dir, version) do
    old_snapshot =
      if version <= 1 do
        %{}
      else
        case Snapshot.read_snapshot(map_dir, version - 1) do
          {:ok, snap} -> snap
          _ -> %{}
        end
      end

    new_snapshot =
      case Snapshot.read_snapshot(map_dir, version) do
        {:ok, snap} -> snap
        _ -> %{}
      end

    changes = diff(old_snapshot, new_snapshot)

    changes_data =
      Enum.map(changes, fn change ->
        %{
          "path" => change.path,
          "type" => Atom.to_string(change.type),
          "old_value" => change.old_value,
          "new_value" => change.new_value
        }
      end)

    version_dir = Snapshot.version_dir(map_dir, version)
    changes_path = Path.join(version_dir, "changes.yaml")
    :ok = Bropilot.Yaml.encode_to_file(%{"changes" => changes_data}, changes_path)

    {:ok, changes}
  end

  @doc """
  Returns a summary map:
    %{added: count, modified: count, removed: count, by_space: %{...}}
  """
  def summarize(changes) do
    counts =
      changes
      |> Enum.group_by(& &1.type)
      |> Enum.map(fn {type, items} -> {type, length(items)} end)
      |> Map.new()

    by_space =
      changes
      |> Enum.group_by(fn change ->
        change.path |> String.split(".") |> List.first()
      end)
      |> Enum.map(fn {space, items} -> {space, length(items)} end)
      |> Map.new()

    %{
      added: Map.get(counts, :added, 0),
      modified: Map.get(counts, :modified, 0),
      removed: Map.get(counts, :removed, 0),
      by_space: by_space
    }
  end

  # -- Private --

  defp deep_diff(old, new, path) when is_map(old) and is_map(new) do
    all_keys = MapSet.union(MapSet.new(Map.keys(old)), MapSet.new(Map.keys(new)))

    Enum.map(all_keys, fn key ->
      current_path = path ++ [to_string(key)]
      path_str = Enum.join(current_path, ".")

      case {Map.get(old, key), Map.get(new, key)} do
        {nil, new_val} ->
          %{path: path_str, type: :added, old_value: nil, new_value: new_val}

        {old_val, nil} ->
          %{path: path_str, type: :removed, old_value: old_val, new_value: nil}

        {old_val, new_val} when is_map(old_val) and is_map(new_val) ->
          deep_diff(old_val, new_val, current_path)

        {old_val, new_val} when is_list(old_val) and is_list(new_val) ->
          diff_lists(old_val, new_val, current_path)

        {same, same} ->
          []

        {old_val, new_val} ->
          %{path: path_str, type: :modified, old_value: old_val, new_value: new_val}
      end
    end)
  end

  defp deep_diff(_old, _new, _path), do: []

  defp diff_lists(old_list, new_list, path) do
    max_len = max(length(old_list), length(new_list))

    if max_len == 0 do
      []
    else
      0..(max_len - 1)
      |> Enum.map(fn i ->
        current_path = path ++ [to_string(i)]
        path_str = Enum.join(current_path, ".")
        old_val = Enum.at(old_list, i)
        new_val = Enum.at(new_list, i)

        case {old_val, new_val} do
          {nil, new_v} ->
            %{path: path_str, type: :added, old_value: nil, new_value: new_v}

          {old_v, nil} ->
            %{path: path_str, type: :removed, old_value: old_v, new_value: nil}

          {old_v, new_v} when is_map(old_v) and is_map(new_v) ->
            deep_diff(old_v, new_v, current_path)

          {same, same} ->
            []

          {old_v, new_v} ->
            %{path: path_str, type: :modified, old_value: old_v, new_value: new_v}
        end
      end)
    end
  end
end

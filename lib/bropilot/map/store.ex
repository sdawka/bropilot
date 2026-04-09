defmodule Bropilot.Map.Store do
  @moduledoc """
  Reads and writes YAML files in the map/ directory.
  Each space has its own subdirectory with slots defined by the Spaces layer.
  """

  def read(map_dir, space, slot) do
    path = slot_path(map_dir, space, slot)

    cond do
      File.exists?(path <> ".yaml") ->
        Bropilot.Yaml.decode_file(path <> ".yaml")

      File.exists?(path <> ".yml") ->
        Bropilot.Yaml.decode_file(path <> ".yml")

      File.dir?(path) ->
        read_directory(path)

      true ->
        {:error, {:not_found, space, slot}}
    end
  end

  def write(map_dir, space, slot, data) do
    path = slot_path(map_dir, space, slot) <> ".yaml"
    File.mkdir_p(Path.dirname(path))
    Bropilot.Yaml.encode_to_file(data, path)
  end

  def exists?(map_dir, space, slot) do
    path = slot_path(map_dir, space, slot)
    File.exists?(path <> ".yaml") or File.exists?(path <> ".yml") or File.dir?(path)
  end

  def slot_path(map_dir, space, slot) do
    Path.join([map_dir, Atom.to_string(space), Atom.to_string(slot)])
  end

  defp read_directory(dir) do
    case File.ls(dir) do
      {:ok, files} ->
        results =
          files
          |> Enum.filter(&(String.ends_with?(&1, ".yaml") or String.ends_with?(&1, ".yml")))
          |> Enum.map(fn file ->
            name = Path.rootname(file)
            {:ok, data} = Bropilot.Yaml.decode_file(Path.join(dir, file))
            {name, data}
          end)
          |> Map.new()

        {:ok, results}

      error ->
        error
    end
  end
end

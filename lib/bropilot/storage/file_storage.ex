defmodule Bropilot.Storage.FileStorage do
  @moduledoc """
  File-based storage implementation wrapping `Bropilot.Map.Store`.

  Reads and writes YAML files in the map/ directory structure.
  This is the default storage backend.
  """

  @behaviour Bropilot.Storage

  alias Bropilot.Map.Store

  @impl true
  def read(map_dir, space, slot) do
    case Store.read(map_dir, space, slot) do
      {:ok, data} -> {:ok, data}
      {:error, {:not_found, _space, _slot}} -> {:error, :not_found}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def write(map_dir, space, slot, data) do
    Store.write(map_dir, space, slot, data)
  end

  @impl true
  def list(map_dir, space, slot) do
    path = Store.slot_path(map_dir, space, slot)

    if File.dir?(path) do
      case File.ls(path) do
        {:ok, files} -> {:ok, files}
        {:error, reason} -> {:error, reason}
      end
    else
      {:error, :not_found}
    end
  end

  @impl true
  def delete(map_dir, space, slot) do
    path = Store.slot_path(map_dir, space, slot)

    yaml_path = path <> ".yaml"
    yml_path = path <> ".yml"

    cond do
      File.exists?(yaml_path) ->
        File.rm!(yaml_path)
        :ok

      File.exists?(yml_path) ->
        File.rm!(yml_path)
        :ok

      true ->
        {:error, :not_found}
    end
  end

  @impl true
  def exists?(map_dir, space, slot) do
    Store.exists?(map_dir, space, slot)
  end
end

defmodule Bropilot.Storage.CloudStorage do
  @moduledoc """
  Cloud storage interface (stub) for future D1/KV backend.

  All callbacks return `{:error, :not_implemented}` until a cloud
  storage provider is integrated.
  """

  @behaviour Bropilot.Storage

  @impl true
  def read(_map_dir, _space, _slot) do
    {:error, :not_implemented}
  end

  @impl true
  def write(_map_dir, _space, _slot, _data) do
    {:error, :not_implemented}
  end

  @impl true
  def list(_map_dir, _space, _slot) do
    {:error, :not_implemented}
  end

  @impl true
  def delete(_map_dir, _space, _slot) do
    {:error, :not_implemented}
  end

  @impl true
  def exists?(_map_dir, _space, _slot) do
    {:error, :not_implemented}
  end
end

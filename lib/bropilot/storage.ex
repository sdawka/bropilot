defmodule Bropilot.Storage do
  @moduledoc """
  Behaviour defining the storage interface for reading and writing map data.

  Implementations:
  - `Bropilot.Storage.FileStorage` — wraps `Bropilot.Map.Store` for YAML files on disk (default)
  - `Bropilot.Storage.CloudStorage` — stub interface for future D1/KV cloud storage

  The active backend is selected via application config:

      config :bropilot, :storage_backend, Bropilot.Storage.FileStorage

  Or at runtime: `Application.put_env(:bropilot, :storage_backend, MyBackend)`.
  Defaults to `Bropilot.Storage.FileStorage` when unset.
  """

  @type map_dir :: String.t()
  @type space :: atom()
  @type slot :: atom()
  @type data :: map()

  @doc "Read a slot from the map. Returns `{:ok, data}` or `{:error, reason}`."
  @callback read(map_dir, space, slot) :: {:ok, data} | {:error, term()}

  @doc "Write data to a slot. Returns `:ok` or `{:error, reason}`."
  @callback write(map_dir, space, slot, data) :: :ok | {:error, term()}

  @doc "List files in a slot directory. Returns `{:ok, [filename]}` or `{:error, reason}`."
  @callback list(map_dir, space, slot) :: {:ok, [String.t()]} | {:error, term()}

  @doc "Delete a slot file. Returns `:ok` or `{:error, reason}`."
  @callback delete(map_dir, space, slot) :: :ok | {:error, term()}

  @doc "Check if a slot exists. Returns `boolean()` or `{:error, reason}`."
  @callback exists?(map_dir, space, slot) :: boolean() | {:error, term()}

  @doc """
  Returns the currently configured storage backend module.
  Defaults to `Bropilot.Storage.FileStorage`.
  """
  @spec backend() :: module()
  def backend do
    Application.get_env(:bropilot, :storage_backend, Bropilot.Storage.FileStorage)
  end

  @doc "Delegates to the configured backend's `read/3`."
  @spec read(map_dir, space, slot) :: {:ok, data} | {:error, term()}
  def read(map_dir, space, slot) do
    backend().read(map_dir, space, slot)
  end

  @doc "Delegates to the configured backend's `write/4`."
  @spec write(map_dir, space, slot, data) :: :ok | {:error, term()}
  def write(map_dir, space, slot, data) do
    backend().write(map_dir, space, slot, data)
  end

  @doc "Delegates to the configured backend's `list/3`."
  @spec list(map_dir, space, slot) :: {:ok, [String.t()]} | {:error, term()}
  def list(map_dir, space, slot) do
    backend().list(map_dir, space, slot)
  end

  @doc "Delegates to the configured backend's `delete/3`."
  @spec delete(map_dir, space, slot) :: :ok | {:error, term()}
  def delete(map_dir, space, slot) do
    backend().delete(map_dir, space, slot)
  end

  @doc "Delegates to the configured backend's `exists?/3`."
  @spec exists?(map_dir, space, slot) :: boolean() | {:error, term()}
  def exists?(map_dir, space, slot) do
    backend().exists?(map_dir, space, slot)
  end
end

defmodule Bropilot.State do
  @moduledoc """
  Behaviour defining the state management interface for pipeline state,
  session tokens, and worker state.

  Implementations:
  - `Bropilot.State.GenServerState` — wraps current GenServer-based state (default)
  - `Bropilot.State.DurableObjectState` — stub interface for future Durable Objects

  State is organized by namespace (`:pipeline`, `:session`, `:worker`) and key.
  Namespaces are isolated: pipeline state does not leak into session state.
  Worker state supports per-worker isolation via composite keys (e.g. `"worker_1:task"`).

  The active backend is selected via application config:

      config :bropilot, :state_backend, Bropilot.State.GenServerState

  Or at runtime: `Application.put_env(:bropilot, :state_backend, MyBackend)`.
  Defaults to `Bropilot.State.GenServerState` when unset.
  """

  @type namespace :: :pipeline | :session | :worker
  @type key :: String.t()
  @type value :: term()
  @type server :: GenServer.server()

  @doc "Retrieve a value by namespace and key. Returns `{:ok, value}` or `{:error, :not_found}`."
  @callback get(server, namespace, key) :: {:ok, value} | {:error, :not_found}

  @doc "Store a value under namespace and key. Returns `:ok`."
  @callback put(server, namespace, key, value) :: :ok

  @doc "Delete a key from namespace. Returns `:ok` or `{:error, :not_found}`."
  @callback delete(server, namespace, key) :: :ok | {:error, :not_found}

  @doc "List all keys in a namespace. Returns `{:ok, [key]}`."
  @callback list_keys(server, namespace) :: {:ok, [key]}

  @doc """
  Returns the currently configured state backend module.
  Defaults to `Bropilot.State.GenServerState`.
  """
  @spec backend() :: module()
  def backend do
    Application.get_env(:bropilot, :state_backend, Bropilot.State.GenServerState)
  end

  @doc "Delegates to the configured backend's `get/3`."
  @spec get(server, namespace, key) :: {:ok, value} | {:error, :not_found}
  def get(server, namespace, key) do
    backend().get(server, namespace, key)
  end

  @doc "Delegates to the configured backend's `put/4`."
  @spec put(server, namespace, key, value) :: :ok
  def put(server, namespace, key, value) do
    backend().put(server, namespace, key, value)
  end

  @doc "Delegates to the configured backend's `delete/3`."
  @spec delete(server, namespace, key) :: :ok | {:error, :not_found}
  def delete(server, namespace, key) do
    backend().delete(server, namespace, key)
  end

  @doc "Delegates to the configured backend's `list_keys/2`."
  @spec list_keys(server, namespace) :: {:ok, [key]}
  def list_keys(server, namespace) do
    backend().list_keys(server, namespace)
  end
end

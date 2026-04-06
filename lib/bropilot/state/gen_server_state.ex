defmodule Bropilot.State.GenServerState do
  @moduledoc """
  GenServer-based state management implementation.

  Stores state in-memory using a GenServer process with a nested map structure
  organized by namespace (`:pipeline`, `:session`, `:worker`).

  Each namespace maintains its own isolated key-value store. Worker state
  supports per-worker isolation via composite keys (e.g. `"worker_1:task"`).

  This is the default state backend for local development.
  """

  use GenServer

  @behaviour Bropilot.State

  # -- Public API (Behaviour callbacks) --

  @impl Bropilot.State
  def get(server, namespace, key) do
    GenServer.call(server, {:get, namespace, key})
  end

  @impl Bropilot.State
  def put(server, namespace, key, value) do
    GenServer.call(server, {:put, namespace, key, value})
  end

  @impl Bropilot.State
  def delete(server, namespace, key) do
    GenServer.call(server, {:delete, namespace, key})
  end

  @impl Bropilot.State
  def list_keys(server, namespace) do
    GenServer.call(server, {:list_keys, namespace})
  end

  # -- GenServer lifecycle --

  @doc "Starts a linked GenServerState process."
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name)

    if name do
      GenServer.start_link(__MODULE__, opts, name: name)
    else
      GenServer.start_link(__MODULE__, opts)
    end
  end

  @doc "Starts an unlinked GenServerState process."
  def start(opts \\ []) do
    name = Keyword.get(opts, :name)

    if name do
      GenServer.start(__MODULE__, opts, name: name)
    else
      GenServer.start(__MODULE__, opts)
    end
  end

  # -- GenServer callbacks --

  @impl GenServer
  def init(_opts) do
    state = %{
      pipeline: %{},
      session: %{},
      worker: %{}
    }

    {:ok, state}
  end

  @impl GenServer
  def handle_call({:get, namespace, key}, _from, state) do
    ns_map = Map.get(state, namespace, %{})

    case Map.fetch(ns_map, key) do
      {:ok, value} -> {:reply, {:ok, value}, state}
      :error -> {:reply, {:error, :not_found}, state}
    end
  end

  @impl GenServer
  def handle_call({:put, namespace, key, value}, _from, state) do
    ns_map = Map.get(state, namespace, %{})
    updated_ns = Map.put(ns_map, key, value)
    new_state = Map.put(state, namespace, updated_ns)
    {:reply, :ok, new_state}
  end

  @impl GenServer
  def handle_call({:delete, namespace, key}, _from, state) do
    ns_map = Map.get(state, namespace, %{})

    if Map.has_key?(ns_map, key) do
      updated_ns = Map.delete(ns_map, key)
      new_state = Map.put(state, namespace, updated_ns)
      {:reply, :ok, new_state}
    else
      {:reply, {:error, :not_found}, state}
    end
  end

  @impl GenServer
  def handle_call({:list_keys, namespace}, _from, state) do
    ns_map = Map.get(state, namespace, %{})
    keys = Map.keys(ns_map)
    {:reply, {:ok, keys}, state}
  end
end

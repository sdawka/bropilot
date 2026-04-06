defmodule Bropilot.Traceability.Writer do
  @moduledoc """
  GenServer that serializes all traceability write operations to prevent
  concurrent write data loss. All writes to traceability.yaml go through
  this process, ensuring at most one read-modify-write cycle at a time.
  """
  use GenServer

  alias Bropilot.Traceability

  # ── Public API ──────────────────────────────────────────────────

  @doc """
  Starts the Writer GenServer.
  """
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, %{}, name: name)
  end

  @doc """
  Serialized write: creates or replaces a traceability entry.
  Falls back to direct write if the GenServer is not running.
  """
  def write(map_dir, spec_category, spec_id, links, name \\ __MODULE__) do
    case safe_call(name, {:write, map_dir, spec_category, spec_id, links}) do
      {:via_genserver, result} -> result
      :fallback -> Traceability.do_write_direct(map_dir, spec_category, spec_id, links)
    end
  end

  @doc """
  Serialized update: merges links for a traceability entry.
  Falls back to direct update if the GenServer is not running.
  """
  def update(map_dir, spec_category, spec_id, new_links, name \\ __MODULE__) do
    case safe_call(name, {:update, map_dir, spec_category, spec_id, new_links}) do
      {:via_genserver, result} -> result
      :fallback -> Traceability.do_update_direct(map_dir, spec_category, spec_id, new_links)
    end
  end

  @doc """
  Serialized delete: removes a traceability entry.
  Falls back to direct delete if the GenServer is not running.
  """
  def delete(map_dir, spec_category, spec_id, name \\ __MODULE__) do
    case safe_call(name, {:delete, map_dir, spec_category, spec_id}) do
      {:via_genserver, result} -> result
      :fallback -> Traceability.do_delete_direct(map_dir, spec_category, spec_id)
    end
  end

  # ── GenServer callbacks ─────────────────────────────────────────

  @impl true
  def init(state) do
    {:ok, state}
  end

  @impl true
  def handle_call({:write, map_dir, spec_category, spec_id, links}, _from, state) do
    result = Traceability.do_write_direct(map_dir, spec_category, spec_id, links)
    {:reply, result, state}
  end

  @impl true
  def handle_call({:update, map_dir, spec_category, spec_id, new_links}, _from, state) do
    result = Traceability.do_update_direct(map_dir, spec_category, spec_id, new_links)
    {:reply, result, state}
  end

  @impl true
  def handle_call({:delete, map_dir, spec_category, spec_id}, _from, state) do
    result = Traceability.do_delete_direct(map_dir, spec_category, spec_id)
    {:reply, result, state}
  end

  # ── Helpers ─────────────────────────────────────────────────────

  defp safe_call(name, msg) do
    case Process.whereis(name) do
      nil -> :fallback
      _pid ->
        try do
          {:via_genserver, GenServer.call(name, msg, 10_000)}
        catch
          :exit, _ -> :fallback
        end
    end
  end
end

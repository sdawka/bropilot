defmodule Bropilot.StateTest do
  use ExUnit.Case, async: true

  alias Bropilot.State
  alias Bropilot.State.GenServerState
  alias Bropilot.State.DurableObjectState

  @moduletag :state

  # --- Behaviour definition ---

  describe "State behaviour" do
    test "defines get callback" do
      assert {:get, 3} in Bropilot.State.behaviour_info(:callbacks)
    end

    test "defines put callback" do
      assert {:put, 4} in Bropilot.State.behaviour_info(:callbacks)
    end

    test "defines delete callback" do
      assert {:delete, 3} in Bropilot.State.behaviour_info(:callbacks)
    end

    test "defines list_keys callback" do
      assert {:list_keys, 2} in Bropilot.State.behaviour_info(:callbacks)
    end

    test "has exactly 4 callbacks" do
      assert length(Bropilot.State.behaviour_info(:callbacks)) == 4
    end
  end

  # --- GenServerState ---

  describe "GenServerState put/get round-trip" do
    setup do
      {:ok, pid} = GenServerState.start_link()
      %{pid: pid}
    end

    test "pipeline namespace round-trip", %{pid: pid} do
      assert :ok = GenServerState.put(pid, :pipeline, "current_step", 3)
      assert {:ok, 3} = GenServerState.get(pid, :pipeline, "current_step")
    end

    test "session namespace round-trip", %{pid: pid} do
      assert :ok = GenServerState.put(pid, :session, "token", "falcon-1234")
      assert {:ok, "falcon-1234"} = GenServerState.get(pid, :session, "token")
    end

    test "worker namespace round-trip", %{pid: pid} do
      assert :ok = GenServerState.put(pid, :worker, "worker_1:task", %{"status" => "running"})
      assert {:ok, %{"status" => "running"}} = GenServerState.get(pid, :worker, "worker_1:task")
    end

    test "stores complex values", %{pid: pid} do
      complex = %{
        "steps" => [1, 2, 3],
        "completed" => true,
        "metadata" => %{"name" => "test"}
      }

      assert :ok = GenServerState.put(pid, :pipeline, "state", complex)
      assert {:ok, ^complex} = GenServerState.get(pid, :pipeline, "state")
    end

    test "overwrites existing key with new value", %{pid: pid} do
      assert :ok = GenServerState.put(pid, :pipeline, "step", 1)
      assert {:ok, 1} = GenServerState.get(pid, :pipeline, "step")

      assert :ok = GenServerState.put(pid, :pipeline, "step", 2)
      assert {:ok, 2} = GenServerState.get(pid, :pipeline, "step")
    end
  end

  describe "GenServerState.get/3" do
    setup do
      {:ok, pid} = GenServerState.start_link()
      %{pid: pid}
    end

    test "returns {:error, :not_found} for missing key", %{pid: pid} do
      assert {:error, :not_found} = GenServerState.get(pid, :pipeline, "nonexistent")
    end

    test "returns {:error, :not_found} in empty namespace", %{pid: pid} do
      assert {:error, :not_found} = GenServerState.get(pid, :session, "any_key")
    end
  end

  describe "GenServerState.delete/3" do
    setup do
      {:ok, pid} = GenServerState.start_link()
      %{pid: pid}
    end

    test "removes existing key", %{pid: pid} do
      :ok = GenServerState.put(pid, :pipeline, "step", 5)
      assert {:ok, 5} = GenServerState.get(pid, :pipeline, "step")

      assert :ok = GenServerState.delete(pid, :pipeline, "step")
      assert {:error, :not_found} = GenServerState.get(pid, :pipeline, "step")
    end

    test "returns {:error, :not_found} for missing key", %{pid: pid} do
      assert {:error, :not_found} = GenServerState.delete(pid, :pipeline, "nonexistent")
    end

    test "delete does not affect other keys in same namespace", %{pid: pid} do
      :ok = GenServerState.put(pid, :session, "token_a", "abc")
      :ok = GenServerState.put(pid, :session, "token_b", "def")

      :ok = GenServerState.delete(pid, :session, "token_a")

      assert {:error, :not_found} = GenServerState.get(pid, :session, "token_a")
      assert {:ok, "def"} = GenServerState.get(pid, :session, "token_b")
    end
  end

  describe "GenServerState.list_keys/2" do
    setup do
      {:ok, pid} = GenServerState.start_link()
      %{pid: pid}
    end

    test "returns empty list for empty namespace", %{pid: pid} do
      assert {:ok, []} = GenServerState.list_keys(pid, :pipeline)
    end

    test "lists all keys in a namespace", %{pid: pid} do
      :ok = GenServerState.put(pid, :pipeline, "step", 1)
      :ok = GenServerState.put(pid, :pipeline, "completed", [])
      :ok = GenServerState.put(pid, :pipeline, "status", "running")

      {:ok, keys} = GenServerState.list_keys(pid, :pipeline)
      assert length(keys) == 3
      assert "step" in keys
      assert "completed" in keys
      assert "status" in keys
    end

    test "only lists keys from the requested namespace", %{pid: pid} do
      :ok = GenServerState.put(pid, :pipeline, "step", 1)
      :ok = GenServerState.put(pid, :session, "token", "abc")
      :ok = GenServerState.put(pid, :worker, "w1:task", %{})

      {:ok, pipeline_keys} = GenServerState.list_keys(pid, :pipeline)
      assert pipeline_keys == ["step"]

      {:ok, session_keys} = GenServerState.list_keys(pid, :session)
      assert session_keys == ["token"]

      {:ok, worker_keys} = GenServerState.list_keys(pid, :worker)
      assert worker_keys == ["w1:task"]
    end
  end

  # --- Namespace isolation ---

  describe "namespace isolation" do
    setup do
      {:ok, pid} = GenServerState.start_link()
      %{pid: pid}
    end

    test "pipeline state does not leak into session state", %{pid: pid} do
      :ok = GenServerState.put(pid, :pipeline, "data", "pipeline_value")

      assert {:error, :not_found} = GenServerState.get(pid, :session, "data")
      assert {:error, :not_found} = GenServerState.get(pid, :worker, "data")
    end

    test "session state does not leak into pipeline state", %{pid: pid} do
      :ok = GenServerState.put(pid, :session, "token", "secret-123")

      assert {:error, :not_found} = GenServerState.get(pid, :pipeline, "token")
      assert {:error, :not_found} = GenServerState.get(pid, :worker, "token")
    end

    test "worker state does not leak into other namespaces", %{pid: pid} do
      :ok = GenServerState.put(pid, :worker, "w1:status", "busy")

      assert {:error, :not_found} = GenServerState.get(pid, :pipeline, "w1:status")
      assert {:error, :not_found} = GenServerState.get(pid, :session, "w1:status")
    end

    test "same key name in different namespaces holds different values", %{pid: pid} do
      :ok = GenServerState.put(pid, :pipeline, "status", "pipeline_running")
      :ok = GenServerState.put(pid, :session, "status", "session_active")
      :ok = GenServerState.put(pid, :worker, "status", "worker_idle")

      assert {:ok, "pipeline_running"} = GenServerState.get(pid, :pipeline, "status")
      assert {:ok, "session_active"} = GenServerState.get(pid, :session, "status")
      assert {:ok, "worker_idle"} = GenServerState.get(pid, :worker, "status")
    end

    test "deleting from one namespace does not affect others", %{pid: pid} do
      :ok = GenServerState.put(pid, :pipeline, "key", "p_val")
      :ok = GenServerState.put(pid, :session, "key", "s_val")
      :ok = GenServerState.put(pid, :worker, "key", "w_val")

      :ok = GenServerState.delete(pid, :pipeline, "key")

      assert {:error, :not_found} = GenServerState.get(pid, :pipeline, "key")
      assert {:ok, "s_val"} = GenServerState.get(pid, :session, "key")
      assert {:ok, "w_val"} = GenServerState.get(pid, :worker, "key")
    end
  end

  # --- Per-worker state independence ---

  describe "per-worker state independence" do
    setup do
      {:ok, pid} = GenServerState.start_link()
      %{pid: pid}
    end

    test "worker_1 and worker_2 have separate state", %{pid: pid} do
      :ok = GenServerState.put(pid, :worker, "worker_1:task", %{"id" => 1, "status" => "running"})
      :ok = GenServerState.put(pid, :worker, "worker_2:task", %{"id" => 2, "status" => "idle"})

      {:ok, w1} = GenServerState.get(pid, :worker, "worker_1:task")
      {:ok, w2} = GenServerState.get(pid, :worker, "worker_2:task")

      assert w1["id"] == 1
      assert w1["status"] == "running"
      assert w2["id"] == 2
      assert w2["status"] == "idle"
    end

    test "deleting worker_1 state does not affect worker_2", %{pid: pid} do
      :ok = GenServerState.put(pid, :worker, "worker_1:config", %{"threads" => 4})
      :ok = GenServerState.put(pid, :worker, "worker_2:config", %{"threads" => 8})

      :ok = GenServerState.delete(pid, :worker, "worker_1:config")

      assert {:error, :not_found} = GenServerState.get(pid, :worker, "worker_1:config")
      assert {:ok, %{"threads" => 8}} = GenServerState.get(pid, :worker, "worker_2:config")
    end

    test "listing worker keys shows all workers", %{pid: pid} do
      :ok = GenServerState.put(pid, :worker, "worker_1:status", "active")
      :ok = GenServerState.put(pid, :worker, "worker_2:status", "idle")
      :ok = GenServerState.put(pid, :worker, "worker_3:status", "done")

      {:ok, keys} = GenServerState.list_keys(pid, :worker)
      assert length(keys) == 3
      assert "worker_1:status" in keys
      assert "worker_2:status" in keys
      assert "worker_3:status" in keys
    end
  end

  # --- GenServerState lifecycle ---

  describe "GenServerState lifecycle" do
    test "start_link/1 starts a process" do
      {:ok, pid} = GenServerState.start_link()
      assert Process.alive?(pid)
    end

    test "start/1 starts an unlinked process" do
      {:ok, pid} = GenServerState.start()
      assert Process.alive?(pid)
      GenServer.stop(pid)
    end

    test "start_link/1 with name option" do
      {:ok, _pid} = GenServerState.start_link(name: :test_state_named)
      assert {:ok, []} = GenServerState.list_keys(:test_state_named, :pipeline)
      GenServer.stop(:test_state_named)
    end

    test "GenServerState module has all 4 behaviour callbacks" do
      functions = GenServerState.__info__(:functions)
      assert {:get, 3} in functions
      assert {:put, 4} in functions
      assert {:delete, 3} in functions
      assert {:list_keys, 2} in functions
    end
  end

  # --- DurableObjectState ---

  describe "DurableObjectState" do
    test "get returns {:error, :not_implemented}" do
      assert {:error, :not_implemented} = DurableObjectState.get(nil, :pipeline, "key")
    end

    test "put returns {:error, :not_implemented}" do
      assert {:error, :not_implemented} = DurableObjectState.put(nil, :pipeline, "key", "val")
    end

    test "delete returns {:error, :not_implemented}" do
      assert {:error, :not_implemented} = DurableObjectState.delete(nil, :session, "key")
    end

    test "list_keys returns {:error, :not_implemented}" do
      assert {:error, :not_implemented} = DurableObjectState.list_keys(nil, :worker)
    end

    test "compiles without errors" do
      assert Code.ensure_loaded?(Bropilot.State.DurableObjectState)
    end

    test "DurableObjectState module has all 4 behaviour callbacks" do
      functions = DurableObjectState.__info__(:functions)
      assert {:get, 3} in functions
      assert {:put, 4} in functions
      assert {:delete, 3} in functions
      assert {:list_keys, 2} in functions
    end
  end

  # --- Config-driven backend selection ---

  describe "State.backend/0" do
    test "defaults to GenServerState when env is unset" do
      original = Application.get_env(:bropilot, :state_backend)
      Application.delete_env(:bropilot, :state_backend)

      assert State.backend() == Bropilot.State.GenServerState

      if original, do: Application.put_env(:bropilot, :state_backend, original)
    end

    test "returns configured backend when set" do
      original = Application.get_env(:bropilot, :state_backend)
      Application.put_env(:bropilot, :state_backend, Bropilot.State.DurableObjectState)

      assert State.backend() == Bropilot.State.DurableObjectState

      Application.delete_env(:bropilot, :state_backend)
      if original, do: Application.put_env(:bropilot, :state_backend, original)
    end
  end

  # --- State dispatch helpers ---

  describe "State dispatch functions" do
    setup do
      {:ok, pid} = GenServerState.start_link()
      original = Application.get_env(:bropilot, :state_backend)
      Application.put_env(:bropilot, :state_backend, Bropilot.State.GenServerState)

      on_exit(fn ->
        Application.delete_env(:bropilot, :state_backend)
        if original, do: Application.put_env(:bropilot, :state_backend, original)
      end)

      %{pid: pid}
    end

    test "State.put/4 delegates to configured backend", %{pid: pid} do
      assert :ok = State.put(pid, :pipeline, "test_key", "test_value")
    end

    test "State.get/3 delegates to configured backend", %{pid: pid} do
      :ok = State.put(pid, :session, "token", "abc-123")
      assert {:ok, "abc-123"} = State.get(pid, :session, "token")
    end

    test "State.delete/3 delegates to configured backend", %{pid: pid} do
      :ok = State.put(pid, :worker, "w1:data", "hello")
      assert :ok = State.delete(pid, :worker, "w1:data")
      assert {:error, :not_found} = State.get(pid, :worker, "w1:data")
    end

    test "State.list_keys/2 delegates to configured backend", %{pid: pid} do
      :ok = State.put(pid, :pipeline, "a", 1)
      :ok = State.put(pid, :pipeline, "b", 2)
      {:ok, keys} = State.list_keys(pid, :pipeline)
      assert length(keys) == 2
      assert "a" in keys
      assert "b" in keys
    end
  end
end

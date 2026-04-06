defmodule Bropilot.ConfigSwitchingTest do
  use ExUnit.Case, async: false

  alias Bropilot.Config
  alias Bropilot.Storage
  alias Bropilot.State

  @moduletag :config_switching

  setup do
    # Save original env values
    original_storage = Application.get_env(:bropilot, :storage_backend)
    original_state = Application.get_env(:bropilot, :state_backend)
    original_env = System.get_env("BROPILOT_BACKEND")

    on_exit(fn ->
      # Restore original env values
      if original_storage do
        Application.put_env(:bropilot, :storage_backend, original_storage)
      else
        Application.delete_env(:bropilot, :storage_backend)
      end

      if original_state do
        Application.put_env(:bropilot, :state_backend, original_state)
      else
        Application.delete_env(:bropilot, :state_backend)
      end

      if original_env do
        System.put_env("BROPILOT_BACKEND", original_env)
      else
        System.delete_env("BROPILOT_BACKEND")
      end
    end)

    :ok
  end

  # --- VAL-CFGSW-001: BROPILOT_BACKEND=local selects FileStorage ---

  describe "BROPILOT_BACKEND=local" do
    test "selects FileStorage + GenServerState" do
      System.put_env("BROPILOT_BACKEND", "local")
      Config.apply!()

      assert Storage.backend() == Bropilot.Storage.FileStorage
      assert State.backend() == Bropilot.State.GenServerState
    end

    test "FileStorage performs real filesystem operations" do
      System.put_env("BROPILOT_BACKEND", "local")
      Config.apply!()

      tmp = Path.join(System.tmp_dir!(), "bropilot_config_test_#{System.unique_integer([:positive])}")
      File.mkdir_p!(tmp)

      on_exit(fn -> File.rm_rf!(tmp) end)

      data = %{"config_test" => true}
      assert :ok = Storage.write(tmp, :problem, :test_config, data)

      path = Path.join([tmp, "problem", "test_config.yaml"])
      assert File.exists?(path)

      assert {:ok, %{"config_test" => true}} = Storage.read(tmp, :problem, :test_config)
    end
  end

  # --- VAL-CFGSW-002: BROPILOT_BACKEND=cloud selects CloudStorage ---

  describe "BROPILOT_BACKEND=cloud" do
    test "selects CloudStorage + DurableObjectState" do
      System.put_env("BROPILOT_BACKEND", "cloud")
      Config.apply!()

      assert Storage.backend() == Bropilot.Storage.CloudStorage
      assert State.backend() == Bropilot.State.DurableObjectState
    end

    test "CloudStorage routes operations to cloud implementation" do
      System.put_env("BROPILOT_BACKEND", "cloud")
      Config.apply!()

      # CloudStorage stubs return :not_implemented
      assert {:error, :not_implemented} = Storage.read("dir", :space, :slot)
      assert {:error, :not_implemented} = Storage.write("dir", :space, :slot, %{})
      assert {:error, :not_implemented} = Storage.list("dir", :space, :slot)
      assert {:error, :not_implemented} = Storage.delete("dir", :space, :slot)
      assert {:error, :not_implemented} = Storage.exists?("dir", :space, :slot)
    end

    test "DurableObjectState routes operations to cloud implementation" do
      System.put_env("BROPILOT_BACKEND", "cloud")
      Config.apply!()

      # DurableObjectState stubs return :not_implemented
      assert {:error, :not_implemented} = State.get(nil, :pipeline, "key")
      assert {:error, :not_implemented} = State.put(nil, :pipeline, "key", "val")
      assert {:error, :not_implemented} = State.delete(nil, :session, "key")
      assert {:error, :not_implemented} = State.list_keys(nil, :worker)
    end
  end

  # --- VAL-CFGSW-003: Default backend is local when env var is unset ---

  describe "default backend when env var is unset" do
    test "defaults to local (FileStorage + GenServerState)" do
      System.delete_env("BROPILOT_BACKEND")
      Config.apply!()

      assert Storage.backend() == Bropilot.Storage.FileStorage
      assert State.backend() == Bropilot.State.GenServerState
    end
  end

  # --- VAL-CFGSW-004: Invalid backend value raises a clear error ---

  describe "invalid backend value" do
    test "raises clear error for 'redis'" do
      System.put_env("BROPILOT_BACKEND", "redis")

      assert_raise ArgumentError, ~r/Invalid BROPILOT_BACKEND: "redis"/, fn ->
        Config.apply!()
      end
    end

    test "raises clear error for empty string" do
      System.put_env("BROPILOT_BACKEND", "")

      assert_raise ArgumentError, ~r/Invalid BROPILOT_BACKEND: ""/, fn ->
        Config.apply!()
      end
    end

    test "raises clear error for arbitrary string" do
      System.put_env("BROPILOT_BACKEND", "memcached")

      assert_raise ArgumentError, ~r/Invalid BROPILOT_BACKEND: "memcached"/, fn ->
        Config.apply!()
      end
    end

    test "error message mentions valid options" do
      System.put_env("BROPILOT_BACKEND", "redis")

      error =
        assert_raise ArgumentError, fn ->
          Config.apply!()
        end

      assert error.message =~ "local"
      assert error.message =~ "cloud"
    end
  end

  # --- VAL-CFGSW-005: API response shapes identical regardless of backend ---

  describe "API response shapes identical" do
    test "Storage.backend/0 returns the correct module for each setting" do
      # Local
      System.put_env("BROPILOT_BACKEND", "local")
      Config.apply!()
      assert Storage.backend() == Bropilot.Storage.FileStorage

      # Cloud
      System.put_env("BROPILOT_BACKEND", "cloud")
      Config.apply!()
      assert Storage.backend() == Bropilot.Storage.CloudStorage

      # Both implement the same behaviour (same callbacks)
      local_callbacks = Bropilot.Storage.FileStorage.__info__(:functions)
      cloud_callbacks = Bropilot.Storage.CloudStorage.__info__(:functions)

      for cb <- [{:read, 3}, {:write, 4}, {:list, 3}, {:delete, 3}, {:exists?, 3}] do
        assert cb in local_callbacks
        assert cb in cloud_callbacks
      end
    end
  end

  # --- VAL-CFGSW-006: Config switch is hot-reloadable ---

  describe "hot-reload / runtime switching" do
    test "runtime Application.put_env immediately changes active backend" do
      # Start with local
      System.put_env("BROPILOT_BACKEND", "local")
      Config.apply!()
      assert Storage.backend() == Bropilot.Storage.FileStorage

      # Switch at runtime via Application.put_env
      Application.put_env(:bropilot, :storage_backend, Bropilot.Storage.CloudStorage)
      Application.put_env(:bropilot, :state_backend, Bropilot.State.DurableObjectState)

      # Takes effect immediately (no restart needed)
      assert Storage.backend() == Bropilot.Storage.CloudStorage
      assert State.backend() == Bropilot.State.DurableObjectState
    end

    test "Config.apply!/0 with new env var updates backends immediately" do
      System.put_env("BROPILOT_BACKEND", "local")
      Config.apply!()
      assert Storage.backend() == Bropilot.Storage.FileStorage

      System.put_env("BROPILOT_BACKEND", "cloud")
      Config.apply!()
      assert Storage.backend() == Bropilot.Storage.CloudStorage
      assert State.backend() == Bropilot.State.DurableObjectState
    end
  end

  # --- Config.resolve/0 for inspection ---

  describe "Config.resolve/0" do
    test "returns :local when env is unset" do
      System.delete_env("BROPILOT_BACKEND")
      assert Config.resolve() == :local
    end

    test "returns :local when env is 'local'" do
      System.put_env("BROPILOT_BACKEND", "local")
      assert Config.resolve() == :local
    end

    test "returns :cloud when env is 'cloud'" do
      System.put_env("BROPILOT_BACKEND", "cloud")
      assert Config.resolve() == :cloud
    end

    test "raises for invalid value" do
      System.put_env("BROPILOT_BACKEND", "redis")

      assert_raise ArgumentError, ~r/Invalid BROPILOT_BACKEND/, fn ->
        Config.resolve()
      end
    end
  end

  # --- Config.storage_module/0 and Config.state_module/0 ---

  describe "Config.storage_module/0" do
    test "returns FileStorage for local" do
      System.put_env("BROPILOT_BACKEND", "local")
      assert Config.storage_module() == Bropilot.Storage.FileStorage
    end

    test "returns CloudStorage for cloud" do
      System.put_env("BROPILOT_BACKEND", "cloud")
      assert Config.storage_module() == Bropilot.Storage.CloudStorage
    end

    test "returns FileStorage when unset" do
      System.delete_env("BROPILOT_BACKEND")
      assert Config.storage_module() == Bropilot.Storage.FileStorage
    end
  end

  describe "Config.state_module/0" do
    test "returns GenServerState for local" do
      System.put_env("BROPILOT_BACKEND", "local")
      assert Config.state_module() == Bropilot.State.GenServerState
    end

    test "returns DurableObjectState for cloud" do
      System.put_env("BROPILOT_BACKEND", "cloud")
      assert Config.state_module() == Bropilot.State.DurableObjectState
    end

    test "returns GenServerState when unset" do
      System.delete_env("BROPILOT_BACKEND")
      assert Config.state_module() == Bropilot.State.GenServerState
    end
  end
end

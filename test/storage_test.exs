defmodule Bropilot.StorageTest do
  use ExUnit.Case, async: true

  alias Bropilot.Storage
  alias Bropilot.Storage.FileStorage
  alias Bropilot.Storage.CloudStorage

  @moduletag :storage

  setup do
    tmp = Path.join(System.tmp_dir!(), "bropilot_storage_test_#{System.unique_integer([:positive])}")
    File.mkdir_p!(tmp)

    on_exit(fn -> File.rm_rf!(tmp) end)

    %{tmp: tmp}
  end

  # --- Behaviour definition ---

  describe "Storage behaviour" do
    test "defines read callback" do
      assert {:read, 3} in Bropilot.Storage.behaviour_info(:callbacks)
    end

    test "defines write callback" do
      assert {:write, 4} in Bropilot.Storage.behaviour_info(:callbacks)
    end

    test "defines list callback" do
      assert {:list, 3} in Bropilot.Storage.behaviour_info(:callbacks)
    end

    test "defines delete callback" do
      assert {:delete, 3} in Bropilot.Storage.behaviour_info(:callbacks)
    end

    test "defines exists? callback" do
      assert {:exists?, 3} in Bropilot.Storage.behaviour_info(:callbacks)
    end

    test "has exactly 5 callbacks" do
      assert length(Bropilot.Storage.behaviour_info(:callbacks)) == 5
    end
  end

  # --- FileStorage ---

  describe "FileStorage.read/3" do
    test "returns {:ok, data} for existing YAML file", %{tmp: tmp} do
      map_dir = tmp
      File.mkdir_p!(Path.join([map_dir, "solution"]))
      File.write!(Path.join([map_dir, "solution", "vocabulary.yaml"]), "terms:\n  - hello\n")

      assert {:ok, %{"terms" => ["hello"]}} = FileStorage.read(map_dir, :solution, :vocabulary)
    end

    test "returns {:error, :not_found} for missing file", %{tmp: tmp} do
      assert {:error, :not_found} = FileStorage.read(tmp, :solution, :nonexistent)
    end

    test "reads directory slot as map of files", %{tmp: tmp} do
      dir = Path.join([tmp, "solution", "domain"])
      File.mkdir_p!(dir)
      File.write!(Path.join(dir, "entities.yaml"), "entities:\n  - User\n")
      File.write!(Path.join(dir, "relationships.yaml"), "rels:\n  - has_many\n")

      {:ok, data} = FileStorage.read(tmp, :solution, :domain)
      assert Map.has_key?(data, "entities")
      assert Map.has_key?(data, "relationships")
    end
  end

  describe "FileStorage.write/4" do
    test "persists YAML data to disk", %{tmp: tmp} do
      data = %{"name" => "Test", "version" => "1.0"}
      assert :ok = FileStorage.write(tmp, :problem, :context, data)

      path = Path.join([tmp, "problem", "context.yaml"])
      assert File.exists?(path)
    end

    test "round-trip: write then read returns matching data", %{tmp: tmp} do
      data = %{"hello" => "world", "count" => 42}
      :ok = FileStorage.write(tmp, :solution, :vocabulary, data)
      {:ok, read_data} = FileStorage.read(tmp, :solution, :vocabulary)

      assert read_data["hello"] == "world"
      assert read_data["count"] == 42
    end

    test "creates intermediate directories", %{tmp: tmp} do
      data = %{"test" => true}
      :ok = FileStorage.write(tmp, :solution, :"specs/api", data)

      path = Path.join([tmp, "solution", "specs", "api.yaml"])
      assert File.exists?(path)
    end
  end

  describe "FileStorage.list/3" do
    test "returns directory contents", %{tmp: tmp} do
      dir = Path.join([tmp, "solution", "specs"])
      File.mkdir_p!(dir)
      File.write!(Path.join(dir, "api.yaml"), "api: true\n")
      File.write!(Path.join(dir, "views.yaml"), "views: true\n")

      {:ok, files} = FileStorage.list(tmp, :solution, :specs)
      assert is_list(files)
      assert "api.yaml" in files
      assert "views.yaml" in files
    end

    test "returns {:error, :not_found} for non-existent directory", %{tmp: tmp} do
      assert {:error, :not_found} = FileStorage.list(tmp, :solution, :nonexistent)
    end
  end

  describe "FileStorage.delete/3" do
    test "removes an existing file", %{tmp: tmp} do
      dir = Path.join([tmp, "problem"])
      File.mkdir_p!(dir)
      File.write!(Path.join(dir, "context.yaml"), "context: test\n")

      assert :ok = FileStorage.delete(tmp, :problem, :context)
      refute File.exists?(Path.join(dir, "context.yaml"))
    end

    test "returns {:error, :not_found} for non-existent file", %{tmp: tmp} do
      assert {:error, :not_found} = FileStorage.delete(tmp, :problem, :nonexistent)
    end
  end

  describe "FileStorage.exists?/3" do
    test "returns true when file exists", %{tmp: tmp} do
      dir = Path.join([tmp, "problem"])
      File.mkdir_p!(dir)
      File.write!(Path.join(dir, "context.yaml"), "test: true\n")

      assert FileStorage.exists?(tmp, :problem, :context) == true
    end

    test "returns false when file does not exist", %{tmp: tmp} do
      assert FileStorage.exists?(tmp, :problem, :missing) == false
    end

    test "returns true for directory slots", %{tmp: tmp} do
      dir = Path.join([tmp, "solution", "domain"])
      File.mkdir_p!(dir)
      File.write!(Path.join(dir, "entities.yaml"), "entities: []\n")

      assert FileStorage.exists?(tmp, :solution, :domain) == true
    end
  end

  describe "FileStorage implements Storage behaviour" do
    test "FileStorage module has all 5 behaviour callbacks" do
      functions = FileStorage.__info__(:functions)
      assert {:read, 3} in functions
      assert {:write, 4} in functions
      assert {:list, 3} in functions
      assert {:delete, 3} in functions
      assert {:exists?, 3} in functions
    end
  end

  # --- CloudStorage ---

  describe "CloudStorage" do
    test "read returns {:error, :not_implemented}" do
      assert {:error, :not_implemented} = CloudStorage.read("dir", :space, :slot)
    end

    test "write returns {:error, :not_implemented}" do
      assert {:error, :not_implemented} = CloudStorage.write("dir", :space, :slot, %{})
    end

    test "list returns {:error, :not_implemented}" do
      assert {:error, :not_implemented} = CloudStorage.list("dir", :space, :slot)
    end

    test "delete returns {:error, :not_implemented}" do
      assert {:error, :not_implemented} = CloudStorage.delete("dir", :space, :slot)
    end

    test "exists? returns {:error, :not_implemented}" do
      assert {:error, :not_implemented} = CloudStorage.exists?("dir", :space, :slot)
    end

    test "compiles without errors" do
      # If we got here, the module compiled successfully
      assert Code.ensure_loaded?(Bropilot.Storage.CloudStorage)
    end
  end

  # --- Config-driven backend selection ---

  describe "Storage.backend/0" do
    test "defaults to FileStorage when env var is unset" do
      # Clear any existing config
      original = Application.get_env(:bropilot, :storage_backend)
      Application.delete_env(:bropilot, :storage_backend)

      assert Storage.backend() == Bropilot.Storage.FileStorage

      # Restore
      if original, do: Application.put_env(:bropilot, :storage_backend, original)
    end

    test "returns configured backend when set" do
      original = Application.get_env(:bropilot, :storage_backend)
      Application.put_env(:bropilot, :storage_backend, Bropilot.Storage.CloudStorage)

      assert Storage.backend() == Bropilot.Storage.CloudStorage

      # Restore
      Application.delete_env(:bropilot, :storage_backend)
      if original, do: Application.put_env(:bropilot, :storage_backend, original)
    end
  end

  # --- Storage dispatch helpers ---

  describe "Storage dispatch functions" do
    test "Storage.read/3 delegates to configured backend", %{tmp: tmp} do
      original = Application.get_env(:bropilot, :storage_backend)
      Application.put_env(:bropilot, :storage_backend, Bropilot.Storage.FileStorage)

      File.mkdir_p!(Path.join([tmp, "problem"]))
      File.write!(Path.join([tmp, "problem", "context.yaml"]), "ctx: hello\n")

      assert {:ok, %{"ctx" => "hello"}} = Storage.read(tmp, :problem, :context)

      Application.delete_env(:bropilot, :storage_backend)
      if original, do: Application.put_env(:bropilot, :storage_backend, original)
    end

    test "Storage.write/4 delegates to configured backend", %{tmp: tmp} do
      original = Application.get_env(:bropilot, :storage_backend)
      Application.put_env(:bropilot, :storage_backend, Bropilot.Storage.FileStorage)

      :ok = Storage.write(tmp, :solution, :vocabulary, %{"terms" => ["one"]})
      assert File.exists?(Path.join([tmp, "solution", "vocabulary.yaml"]))

      Application.delete_env(:bropilot, :storage_backend)
      if original, do: Application.put_env(:bropilot, :storage_backend, original)
    end

    test "Storage.exists?/3 delegates to configured backend", %{tmp: tmp} do
      original = Application.get_env(:bropilot, :storage_backend)
      Application.put_env(:bropilot, :storage_backend, Bropilot.Storage.FileStorage)

      assert Storage.exists?(tmp, :problem, :missing) == false

      Application.delete_env(:bropilot, :storage_backend)
      if original, do: Application.put_env(:bropilot, :storage_backend, original)
    end

    test "Storage.list/3 delegates to configured backend", %{tmp: tmp} do
      original = Application.get_env(:bropilot, :storage_backend)
      Application.put_env(:bropilot, :storage_backend, Bropilot.Storage.FileStorage)

      dir = Path.join([tmp, "solution", "specs"])
      File.mkdir_p!(dir)
      File.write!(Path.join(dir, "api.yaml"), "api: true\n")

      {:ok, files} = Storage.list(tmp, :solution, :specs)
      assert "api.yaml" in files

      Application.delete_env(:bropilot, :storage_backend)
      if original, do: Application.put_env(:bropilot, :storage_backend, original)
    end

    test "Storage.delete/3 delegates to configured backend", %{tmp: tmp} do
      original = Application.get_env(:bropilot, :storage_backend)
      Application.put_env(:bropilot, :storage_backend, Bropilot.Storage.FileStorage)

      dir = Path.join([tmp, "problem"])
      File.mkdir_p!(dir)
      File.write!(Path.join(dir, "context.yaml"), "test: true\n")

      assert :ok = Storage.delete(tmp, :problem, :context)

      Application.delete_env(:bropilot, :storage_backend)
      if original, do: Application.put_env(:bropilot, :storage_backend, original)
    end
  end
end

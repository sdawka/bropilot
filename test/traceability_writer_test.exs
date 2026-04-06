defmodule Bropilot.Traceability.WriterTest do
  use ExUnit.Case

  alias Bropilot.Traceability
  alias Bropilot.Traceability.Writer

  setup do
    tmp = System.tmp_dir!() |> Path.join("bropilot_writer_test_#{:rand.uniform(100_000)}")
    map_dir = Path.join(tmp, "map")
    knowledge_dir = Path.join(map_dir, "knowledge")
    File.mkdir_p!(knowledge_dir)

    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, map_dir: map_dir}
  end

  describe "Writer GenServer serialization" do
    test "concurrent writes through Writer GenServer preserve all entries", %{map_dir: map_dir} do
      # The application supervisor starts the Writer, so it should be running
      # Issue 5 concurrent writes through the Writer
      tasks =
        for i <- 1..5 do
          Task.async(fn ->
            links = [%{"type" => "implementation", "file_path" => "lib/spec_#{i}.ex"}]
            Traceability.write(map_dir, "api", "Spec#{i}", links)
          end)
        end

      results = Task.await_many(tasks, 10_000)
      assert Enum.all?(results, &(&1 == :ok))

      # All 5 entries should be present since writes are serialized
      {:ok, entries} = Traceability.read_all(map_dir)
      assert length(entries) == 5

      # Verify each entry exists
      for i <- 1..5 do
        {:ok, entry} = Traceability.read(map_dir, "api", "Spec#{i}")
        assert length(entry["links"]) == 1
        assert hd(entry["links"])["file_path"] == "lib/spec_#{i}.ex"
      end
    end

    test "concurrent updates through Writer preserve all links", %{map_dir: map_dir} do
      # Create initial entry
      :ok = Traceability.write(map_dir, "api", "Shared", [
        %{"type" => "implementation", "file_path" => "lib/shared.ex"}
      ])

      # Issue 5 concurrent updates to the same entry
      tasks =
        for i <- 1..5 do
          Task.async(fn ->
            links = [%{"type" => "test", "file_path" => "test/shared_#{i}_test.exs"}]
            Traceability.update(map_dir, "api", "Shared", links)
          end)
        end

      results = Task.await_many(tasks, 10_000)
      assert Enum.all?(results, &(&1 == :ok))

      # All links should be present since updates are serialized
      {:ok, entry} = Traceability.read(map_dir, "api", "Shared")
      # Original implementation link + 5 test links = 6
      assert length(entry["links"]) == 6
    end

    test "concurrent mixed operations (write + update + delete) don't corrupt", %{map_dir: map_dir} do
      # Pre-seed some data
      :ok = Traceability.write(map_dir, "api", "A", [
        %{"type" => "implementation", "file_path" => "lib/a.ex"}
      ])
      :ok = Traceability.write(map_dir, "api", "B", [
        %{"type" => "implementation", "file_path" => "lib/b.ex"}
      ])

      tasks = [
        Task.async(fn ->
          Traceability.write(map_dir, "api", "C", [
            %{"type" => "implementation", "file_path" => "lib/c.ex"}
          ])
        end),
        Task.async(fn ->
          Traceability.update(map_dir, "api", "A", [
            %{"type" => "test", "file_path" => "test/a_test.exs"}
          ])
        end),
        Task.async(fn ->
          Traceability.delete(map_dir, "api", "B")
        end)
      ]

      results = Task.await_many(tasks, 10_000)
      assert Enum.all?(results, &(&1 == :ok))

      # Verify final state
      {:ok, _entries} = Traceability.read_all(map_dir)

      # A should exist with 2 links
      {:ok, a_entry} = Traceability.read(map_dir, "api", "A")
      assert length(a_entry["links"]) == 2

      # B should be deleted
      assert {:error, :not_found} = Traceability.read(map_dir, "api", "B")

      # C should exist
      {:ok, c_entry} = Traceability.read(map_dir, "api", "C")
      assert length(c_entry["links"]) == 1

      # File should be valid YAML
      path = Traceability.file_path(map_dir)
      {:ok, raw} = Bropilot.Yaml.decode_file(path)
      assert is_list(raw["traceability"])
    end
  end

  describe "Writer fallback when GenServer is not running" do
    test "write falls back to direct write when using a non-existent GenServer name", %{map_dir: map_dir} do
      links = [%{"type" => "implementation", "file_path" => "lib/fallback.ex"}]
      # Use a name that doesn't exist
      result = Writer.write(map_dir, "api", "Fallback", links, :nonexistent_writer)
      assert result == :ok

      {:ok, entry} = Traceability.read(map_dir, "api", "Fallback")
      assert length(entry["links"]) == 1
    end

    test "update falls back to direct update when using a non-existent GenServer name", %{map_dir: map_dir} do
      :ok = Traceability.write(map_dir, "api", "Foo", [
        %{"type" => "implementation", "file_path" => "lib/foo.ex"}
      ])

      links = [%{"type" => "test", "file_path" => "test/foo_test.exs"}]
      result = Writer.update(map_dir, "api", "Foo", links, :nonexistent_writer)
      assert result == :ok

      {:ok, entry} = Traceability.read(map_dir, "api", "Foo")
      assert length(entry["links"]) == 2
    end

    test "delete falls back to direct delete when using a non-existent GenServer name", %{map_dir: map_dir} do
      :ok = Traceability.write(map_dir, "api", "ToDelete", [
        %{"type" => "implementation", "file_path" => "lib/to_delete.ex"}
      ])

      result = Writer.delete(map_dir, "api", "ToDelete", :nonexistent_writer)
      assert result == :ok

      assert {:error, :not_found} = Traceability.read(map_dir, "api", "ToDelete")
    end
  end
end

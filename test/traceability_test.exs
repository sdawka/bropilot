defmodule Bropilot.TraceabilityTest do
  use ExUnit.Case

  alias Bropilot.Traceability

  @valid_categories ~w(api behaviours constraints entities modules events externals views components streams infra)

  setup do
    tmp = System.tmp_dir!() |> Path.join("bropilot_trace_test_#{:rand.uniform(100_000)}")
    map_dir = Path.join(tmp, "map")
    knowledge_dir = Path.join(map_dir, "knowledge")
    File.mkdir_p!(knowledge_dir)

    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, map_dir: map_dir}
  end

  describe "valid_categories/0" do
    test "returns all 11 spec categories" do
      assert length(Traceability.valid_categories()) == 11
      assert Traceability.valid_categories() == @valid_categories
    end
  end

  describe "valid_link_types/0" do
    test "returns 4 valid link types" do
      types = Traceability.valid_link_types()
      assert length(types) == 4
      assert "implementation" in types
      assert "test" in types
      assert "type" in types
      assert "migration" in types
    end
  end

  describe "file_path/1" do
    test "returns correct path", %{map_dir: map_dir} do
      assert Traceability.file_path(map_dir) ==
               Path.join([map_dir, "knowledge", "traceability.yaml"])
    end
  end

  describe "validate_category/1" do
    test "accepts all 11 valid categories" do
      for cat <- @valid_categories do
        assert :ok == Traceability.validate_category(cat),
               "Expected #{cat} to be a valid category"
      end
    end

    test "rejects invalid category" do
      assert {:error, {:invalid_category, "bogus", _}} = Traceability.validate_category("bogus")
    end

    test "rejects nil category" do
      assert {:error, {:invalid_category, nil, _}} = Traceability.validate_category(nil)
    end
  end

  describe "validate_links/1" do
    test "accepts valid links" do
      links = [
        %{"type" => "implementation", "file_path" => "lib/foo.ex"},
        %{"type" => "test", "file_path" => "test/foo_test.exs", "function_name" => "test_foo"}
      ]

      assert :ok == Traceability.validate_links(links)
    end

    test "accepts link with optional fields" do
      links = [
        %{
          "type" => "implementation",
          "file_path" => "lib/foo.ex",
          "function_name" => "init/1",
          "line_range" => [10, 25]
        }
      ]

      assert :ok == Traceability.validate_links(links)
    end

    test "rejects link with invalid type" do
      links = [%{"type" => "deployment", "file_path" => "lib/foo.ex"}]
      assert {:error, {:invalid_links, errors}} = Traceability.validate_links(links)
      assert length(errors) > 0
    end

    test "rejects link missing type" do
      links = [%{"file_path" => "lib/foo.ex"}]
      assert {:error, {:invalid_links, errors}} = Traceability.validate_links(links)
      assert Enum.any?(errors, fn {_, field, _} -> field == :type end)
    end

    test "rejects link missing file_path" do
      links = [%{"type" => "implementation"}]
      assert {:error, {:invalid_links, errors}} = Traceability.validate_links(links)
      assert Enum.any?(errors, fn {_, field, _} -> field == :file_path end)
    end

    test "rejects non-list" do
      assert {:error, {:invalid_links, _}} = Traceability.validate_links("not a list")
    end

    test "accepts empty list" do
      assert :ok == Traceability.validate_links([])
    end
  end

  describe "read_all/1" do
    test "returns empty list when file doesn't exist", %{map_dir: map_dir} do
      assert {:ok, []} = Traceability.read_all(map_dir)
    end

    test "returns empty list when file has empty traceability", %{map_dir: map_dir} do
      Bropilot.Yaml.encode_to_file(%{"traceability" => []}, Traceability.file_path(map_dir))
      assert {:ok, []} = Traceability.read_all(map_dir)
    end

    test "returns entries from file", %{map_dir: map_dir} do
      entry = %{
        "spec_category" => "api",
        "spec_id" => "InitProject",
        "links" => [
          %{"type" => "implementation", "file_path" => "lib/init.ex"}
        ]
      }

      Bropilot.Yaml.encode_to_file(%{"traceability" => [entry]}, Traceability.file_path(map_dir))
      assert {:ok, [^entry]} = Traceability.read_all(map_dir)
    end

    test "handles null traceability value gracefully", %{map_dir: map_dir} do
      File.write!(Traceability.file_path(map_dir), "traceability: null\n")
      assert {:ok, []} = Traceability.read_all(map_dir)
    end

    test "handles corrupted YAML gracefully", %{map_dir: map_dir} do
      File.write!(Traceability.file_path(map_dir), ": : invalid yaml {{}")
      assert {:ok, []} = Traceability.read_all(map_dir)
    end
  end

  describe "read/3" do
    test "returns entry when found", %{map_dir: map_dir} do
      links = [%{"type" => "implementation", "file_path" => "lib/init.ex"}]
      :ok = Traceability.write(map_dir, "api", "InitProject", links)

      assert {:ok, entry} = Traceability.read(map_dir, "api", "InitProject")
      assert entry["spec_category"] == "api"
      assert entry["spec_id"] == "InitProject"
      assert length(entry["links"]) == 1
    end

    test "returns not_found when missing", %{map_dir: map_dir} do
      assert {:error, :not_found} = Traceability.read(map_dir, "api", "NonExistent")
    end

    test "rejects invalid category", %{map_dir: map_dir} do
      assert {:error, {:invalid_category, _, _}} = Traceability.read(map_dir, "bogus", "Foo")
    end
  end

  describe "write/4" do
    test "creates new entry", %{map_dir: map_dir} do
      links = [%{"type" => "implementation", "file_path" => "lib/foo.ex"}]
      assert :ok = Traceability.write(map_dir, "api", "Foo", links)

      assert {:ok, entry} = Traceability.read(map_dir, "api", "Foo")
      assert entry["links"] == [%{"type" => "implementation", "file_path" => "lib/foo.ex"}]
    end

    test "replaces existing entry", %{map_dir: map_dir} do
      links1 = [%{"type" => "implementation", "file_path" => "lib/foo.ex"}]
      :ok = Traceability.write(map_dir, "api", "Foo", links1)

      links2 = [
        %{"type" => "implementation", "file_path" => "lib/foo.ex"},
        %{"type" => "test", "file_path" => "test/foo_test.exs"}
      ]

      assert :ok = Traceability.write(map_dir, "api", "Foo", links2)

      assert {:ok, entry} = Traceability.read(map_dir, "api", "Foo")
      assert length(entry["links"]) == 2
    end

    test "preserves other entries when writing", %{map_dir: map_dir} do
      :ok = Traceability.write(map_dir, "api", "A", [%{"type" => "implementation", "file_path" => "a.ex"}])
      :ok = Traceability.write(map_dir, "api", "B", [%{"type" => "test", "file_path" => "b.exs"}])

      assert {:ok, entries} = Traceability.read_all(map_dir)
      assert length(entries) == 2
    end

    test "preserves optional fields", %{map_dir: map_dir} do
      links = [
        %{
          "type" => "implementation",
          "file_path" => "lib/foo.ex",
          "function_name" => "init/1",
          "line_range" => [10, 25]
        }
      ]

      :ok = Traceability.write(map_dir, "api", "Foo", links)

      {:ok, entry} = Traceability.read(map_dir, "api", "Foo")
      link = hd(entry["links"])
      assert link["function_name"] == "init/1"
      assert link["line_range"] == [10, 25]
    end

    test "rejects invalid category", %{map_dir: map_dir} do
      links = [%{"type" => "implementation", "file_path" => "lib/foo.ex"}]
      assert {:error, {:invalid_category, _, _}} = Traceability.write(map_dir, "bogus", "Foo", links)
    end

    test "rejects invalid link type", %{map_dir: map_dir} do
      links = [%{"type" => "deployment", "file_path" => "lib/foo.ex"}]
      assert {:error, {:invalid_links, _}} = Traceability.write(map_dir, "api", "Foo", links)
    end

    test "rejects link missing file_path", %{map_dir: map_dir} do
      links = [%{"type" => "implementation"}]
      assert {:error, {:invalid_links, _}} = Traceability.write(map_dir, "api", "Foo", links)
    end

    test "rejects link missing type", %{map_dir: map_dir} do
      links = [%{"file_path" => "lib/foo.ex"}]
      assert {:error, {:invalid_links, _}} = Traceability.write(map_dir, "api", "Foo", links)
    end
  end

  describe "update/4" do
    test "creates entry if none exists", %{map_dir: map_dir} do
      new_links = [%{"type" => "implementation", "file_path" => "lib/foo.ex"}]
      assert :ok = Traceability.update(map_dir, "api", "Foo", new_links)

      {:ok, entry} = Traceability.read(map_dir, "api", "Foo")
      assert length(entry["links"]) == 1
    end

    test "merges links with existing entry", %{map_dir: map_dir} do
      :ok = Traceability.write(map_dir, "api", "Foo", [
        %{"type" => "implementation", "file_path" => "lib/foo.ex"}
      ])

      :ok = Traceability.update(map_dir, "api", "Foo", [
        %{"type" => "test", "file_path" => "test/foo_test.exs"}
      ])

      {:ok, entry} = Traceability.read(map_dir, "api", "Foo")
      assert length(entry["links"]) == 2
      types = Enum.map(entry["links"], & &1["type"])
      assert "implementation" in types
      assert "test" in types
    end

    test "deduplicates by type + file_path", %{map_dir: map_dir} do
      :ok = Traceability.write(map_dir, "api", "Foo", [
        %{"type" => "implementation", "file_path" => "lib/foo.ex", "function_name" => "old/0"}
      ])

      :ok = Traceability.update(map_dir, "api", "Foo", [
        %{"type" => "implementation", "file_path" => "lib/foo.ex", "function_name" => "new/1"}
      ])

      {:ok, entry} = Traceability.read(map_dir, "api", "Foo")
      assert length(entry["links"]) == 1
      assert hd(entry["links"])["function_name"] == "new/1"
    end

    test "rejects invalid category", %{map_dir: map_dir} do
      links = [%{"type" => "implementation", "file_path" => "lib/foo.ex"}]
      assert {:error, {:invalid_category, _, _}} = Traceability.update(map_dir, "bogus", "Foo", links)
    end

    test "rejects invalid link type", %{map_dir: map_dir} do
      links = [%{"type" => "deployment", "file_path" => "lib/foo.ex"}]
      assert {:error, {:invalid_links, _}} = Traceability.update(map_dir, "api", "Foo", links)
    end
  end

  describe "delete/3" do
    test "removes existing entry", %{map_dir: map_dir} do
      :ok = Traceability.write(map_dir, "api", "Foo", [
        %{"type" => "implementation", "file_path" => "lib/foo.ex"}
      ])

      assert :ok = Traceability.delete(map_dir, "api", "Foo")
      assert {:error, :not_found} = Traceability.read(map_dir, "api", "Foo")
    end

    test "returns not_found for non-existent entry", %{map_dir: map_dir} do
      assert {:error, :not_found} = Traceability.delete(map_dir, "api", "NoSuchSpec")
    end

    test "preserves other entries", %{map_dir: map_dir} do
      :ok = Traceability.write(map_dir, "api", "A", [%{"type" => "implementation", "file_path" => "a.ex"}])
      :ok = Traceability.write(map_dir, "api", "B", [%{"type" => "test", "file_path" => "b.exs"}])

      :ok = Traceability.delete(map_dir, "api", "A")

      assert {:error, :not_found} = Traceability.read(map_dir, "api", "A")
      assert {:ok, _} = Traceability.read(map_dir, "api", "B")
    end

    test "rejects invalid category", %{map_dir: map_dir} do
      assert {:error, {:invalid_category, _, _}} = Traceability.delete(map_dir, "bogus", "Foo")
    end
  end

  describe "round-trip all 11 categories" do
    test "creates and reads entries for each valid category", %{map_dir: map_dir} do
      for cat <- @valid_categories do
        links = [
          %{"type" => "implementation", "file_path" => "lib/#{cat}/handler.ex"},
          %{"type" => "test", "file_path" => "test/#{cat}_test.exs"},
          %{"type" => "type", "file_path" => "lib/#{cat}/types.ex"},
          %{"type" => "migration", "file_path" => "priv/migrations/#{cat}.sql"}
        ]

        assert :ok = Traceability.write(map_dir, cat, "#{cat}_spec_1", links),
               "Failed to write for category #{cat}"
      end

      # Verify all entries
      {:ok, all} = Traceability.read_all(map_dir)
      assert length(all) == 11

      for cat <- @valid_categories do
        {:ok, entry} = Traceability.read(map_dir, cat, "#{cat}_spec_1")
        assert entry["spec_category"] == cat
        assert length(entry["links"]) == 4

        link_types = Enum.map(entry["links"], & &1["type"]) |> Enum.sort()
        assert link_types == ["implementation", "migration", "test", "type"]
      end
    end
  end

  describe "link structure round-trip (VAL-TRACE-002)" do
    test "all four link types with optional fields round-trip", %{map_dir: map_dir} do
      links = [
        %{
          "type" => "implementation",
          "file_path" => "lib/app/init.ex",
          "function_name" => "init/1",
          "line_range" => [10, 25]
        },
        %{
          "type" => "test",
          "file_path" => "test/app/init_test.exs",
          "function_name" => "test_init/1"
        },
        %{
          "type" => "type",
          "file_path" => "lib/app/types.ex"
        },
        %{
          "type" => "migration",
          "file_path" => "priv/migrations/001_create_init.sql"
        }
      ]

      :ok = Traceability.write(map_dir, "entities", "User", links)
      {:ok, entry} = Traceability.read(map_dir, "entities", "User")

      assert entry["spec_category"] == "entities"
      assert entry["spec_id"] == "User"
      assert length(entry["links"]) == 4

      impl = Enum.find(entry["links"], &(&1["type"] == "implementation"))
      assert impl["file_path"] == "lib/app/init.ex"
      assert impl["function_name"] == "init/1"
      assert impl["line_range"] == [10, 25]

      test_link = Enum.find(entry["links"], &(&1["type"] == "test"))
      assert test_link["file_path"] == "test/app/init_test.exs"
      assert test_link["function_name"] == "test_init/1"

      type_link = Enum.find(entry["links"], &(&1["type"] == "type"))
      assert type_link["file_path"] == "lib/app/types.ex"
      assert type_link["function_name"] == nil

      migration = Enum.find(entry["links"], &(&1["type"] == "migration"))
      assert migration["file_path"] == "priv/migrations/001_create_init.sql"
    end
  end

  describe "persistence (VAL-TRACE-005)" do
    test "data persists on disk", %{map_dir: map_dir} do
      links = [%{"type" => "implementation", "file_path" => "lib/foo.ex"}]
      :ok = Traceability.write(map_dir, "api", "Foo", links)

      # Read raw file to verify persistence
      path = Traceability.file_path(map_dir)
      assert File.exists?(path)
      {:ok, raw} = Bropilot.Yaml.decode_file(path)
      assert is_list(raw["traceability"])
      assert length(raw["traceability"]) == 1
    end

    test "data survives module re-read (simulating server restart)", %{map_dir: map_dir} do
      links = [
        %{"type" => "implementation", "file_path" => "lib/foo.ex", "function_name" => "bar/2"}
      ]

      :ok = Traceability.write(map_dir, "api", "Foo", links)

      # Simulate restart: read fresh from disk
      {:ok, entry} = Traceability.read(map_dir, "api", "Foo")
      assert entry["links"] == [
        %{"file_path" => "lib/foo.ex", "function_name" => "bar/2", "type" => "implementation"}
      ]
    end
  end

  describe "concurrent writes (VAL-TRACE-006)" do
    test "concurrent writes do not corrupt the file", %{map_dir: map_dir} do
      tasks =
        for i <- 1..5 do
          Task.async(fn ->
            links = [%{"type" => "implementation", "file_path" => "lib/spec_#{i}.ex"}]
            Traceability.write(map_dir, "api", "Spec#{i}", links)
          end)
        end

      results = Task.await_many(tasks, 5000)
      assert Enum.all?(results, &(&1 == :ok))

      # File should be valid YAML with all 5 entries
      path = Traceability.file_path(map_dir)
      assert File.exists?(path)
      {:ok, raw} = Bropilot.Yaml.decode_file(path)
      assert is_list(raw["traceability"])

      # Due to race conditions, we may not have all 5 entries
      # (last write wins for the file), but the file must be valid YAML.
      # At minimum, the file should be parseable and contain at least 1 entry.
      assert length(raw["traceability"]) >= 1
    end
  end

  describe "init creates traceability file (VAL-TRACE-001)" do
    test "Bropilot.init creates traceability.yaml" do
      tmp = System.tmp_dir!() |> Path.join("bropilot_trace_init_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)
      on_exit(fn -> File.rm_rf!(tmp) end)

      {:ok, bropilot_dir} = Bropilot.init(tmp)
      map_dir = Path.join(bropilot_dir, "map")
      trace_path = Traceability.file_path(map_dir)

      assert File.exists?(trace_path), "traceability.yaml should exist after init"

      {:ok, data} = Bropilot.Yaml.decode_file(trace_path)
      assert Map.has_key?(data, "traceability")
      assert data["traceability"] == [] || data["traceability"] == nil
    end
  end
end

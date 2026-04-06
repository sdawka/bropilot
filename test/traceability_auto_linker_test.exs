defmodule Bropilot.Traceability.AutoLinkerTest do
  use ExUnit.Case

  alias Bropilot.Traceability
  alias Bropilot.Traceability.AutoLinker

  setup do
    tmp = System.tmp_dir!() |> Path.join("bropilot_autolink_test_#{:rand.uniform(100_000)}")
    map_dir = Path.join(tmp, "map")
    knowledge_dir = Path.join(map_dir, "knowledge")
    File.mkdir_p!(knowledge_dir)

    # Create a project directory structure for file existence checks
    project_dir = Path.join(tmp, "project")
    output_dir = Path.join(project_dir, "output/task_1")
    File.mkdir_p!(output_dir)

    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, map_dir: map_dir, project_dir: project_dir, output_dir: output_dir, tmp: tmp}
  end

  # ── parse_spec_path/1 ──────────────────────────────────────────

  describe "parse_spec_path/1" do
    test "parses solution.specs.category.SpecId format" do
      assert {:ok, "api", "InitProject"} = AutoLinker.parse_spec_path("solution.specs.api.InitProject")
      assert {:ok, "entities", "User"} = AutoLinker.parse_spec_path("solution.specs.entities.User")
      assert {:ok, "behaviours", "Auth"} = AutoLinker.parse_spec_path("solution.specs.behaviours.Auth")
    end

    test "parses all 11 valid categories" do
      for cat <- ~w(api behaviours constraints entities modules events externals views components streams infra) do
        assert {:ok, ^cat, "Spec1"} = AutoLinker.parse_spec_path("solution.specs.#{cat}.Spec1")
      end
    end

    test "parses category.SpecId shorthand" do
      assert {:ok, "api", "InitProject"} = AutoLinker.parse_spec_path("api.InitProject")
      assert {:ok, "entities", "User"} = AutoLinker.parse_spec_path("entities.User")
    end

    test "handles dotted spec_id (e.g., Module.SubModule)" do
      assert {:ok, "modules", "Act1.Worker"} = AutoLinker.parse_spec_path("solution.specs.modules.Act1.Worker")
      assert {:ok, "modules", "Pipeline.Engine"} = AutoLinker.parse_spec_path("solution.specs.modules.Pipeline.Engine")
    end

    test "returns :error for invalid categories" do
      assert :error = AutoLinker.parse_spec_path("solution.specs.bogus.Foo")
      assert :error = AutoLinker.parse_spec_path("bogus.Foo")
    end

    test "returns :error for nil or non-string" do
      assert :error = AutoLinker.parse_spec_path(nil)
      assert :error = AutoLinker.parse_spec_path(42)
    end

    test "returns :error for empty string or single segment" do
      assert :error = AutoLinker.parse_spec_path("")
      assert :error = AutoLinker.parse_spec_path("api")
    end
  end

  # ── infer_link_type/2 ──────────────────────────────────────────

  describe "infer_link_type/2" do
    test "test files are detected" do
      assert "test" == AutoLinker.infer_link_type("test/foo_test.exs", "api")
      assert "test" == AutoLinker.infer_link_type("test/foo_test.ex", "behaviours")
      assert "test" == AutoLinker.infer_link_type("tests/user.test.ts", "entities")
      assert "test" == AutoLinker.infer_link_type("test/foo.spec.ts", "api")
      assert "test" == AutoLinker.infer_link_type("tests/bar_test.ts", "modules")
    end

    test "test detection via directory" do
      assert "test" == AutoLinker.infer_link_type("test/some/nested/file.ex", "api")
      assert "test" == AutoLinker.infer_link_type("tests/some/nested/file.ts", "api")
    end

    test "migration files are detected" do
      assert "migration" == AutoLinker.infer_link_type("priv/migrations/001_create_users.sql", "entities")
      assert "migration" == AutoLinker.infer_link_type("db/migrations/add_column.sql", "entities")
      assert "migration" == AutoLinker.infer_link_type("create_table.sql", "entities")
    end

    test "type definition files are detected" do
      assert "type" == AutoLinker.infer_link_type("lib/app/user_types.ex", "entities")
      assert "type" == AutoLinker.infer_link_type("lib/app/types.ex", "entities")
      assert "type" == AutoLinker.infer_link_type("src/types/user.d.ts", "entities")
      assert "type" == AutoLinker.infer_link_type("src/user_types.ts", "entities")
      assert "type" == AutoLinker.infer_link_type("lib/types/user.ex", "entities")
    end

    test "regular source files are implementation" do
      assert "implementation" == AutoLinker.infer_link_type("lib/app/user.ex", "entities")
      assert "implementation" == AutoLinker.infer_link_type("lib/app/router.ex", "api")
      assert "implementation" == AutoLinker.infer_link_type("src/components/Button.tsx", "components")
      assert "implementation" == AutoLinker.infer_link_type("src/pages/home.astro", "views")
    end
  end

  # ── record_links/4 ─────────────────────────────────────────────

  describe "record_links/4" do
    test "records implementation links for generated files", %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      # Create actual files on disk
      File.mkdir_p!(Path.join(output_dir, "lib/app"))
      File.write!(Path.join(output_dir, "lib/app/init.ex"), "defmodule App.Init do\nend\n")

      task_map = %{
        "id" => 1,
        "title" => "Implement InitProject",
        "related_specs" => ["solution.specs.api.InitProject"],
        "context" => %{}
      }

      result = {:ok, %{files_written: ["lib/app/init.ex"], output_dir: output_dir}}

      assert :ok = AutoLinker.record_links(map_dir, task_map, result, project_dir)

      {:ok, entry} = Traceability.read(map_dir, "api", "InitProject")
      assert length(entry["links"]) == 1
      link = hd(entry["links"])
      assert link["type"] == "implementation"
      assert String.contains?(link["file_path"], "init.ex")
    end

    test "records test links for test files", %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      File.mkdir_p!(Path.join(output_dir, "lib/app"))
      File.mkdir_p!(Path.join(output_dir, "test/app"))
      File.write!(Path.join(output_dir, "lib/app/auth.ex"), "defmodule App.Auth do\nend\n")
      File.write!(Path.join(output_dir, "test/app/auth_test.exs"), "defmodule App.AuthTest do\nend\n")

      task_map = %{
        "id" => 2,
        "related_specs" => ["solution.specs.behaviours.Auth"],
        "context" => %{}
      }

      result = {:ok, %{
        files_written: ["lib/app/auth.ex", "test/app/auth_test.exs"],
        output_dir: output_dir
      }}

      assert :ok = AutoLinker.record_links(map_dir, task_map, result, project_dir)

      {:ok, entry} = Traceability.read(map_dir, "behaviours", "Auth")
      types = Enum.map(entry["links"], & &1["type"]) |> Enum.sort()
      assert "implementation" in types
      assert "test" in types
    end

    test "records entity links with type, migration, and implementation",
         %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      File.mkdir_p!(Path.join(output_dir, "lib/app"))
      File.mkdir_p!(Path.join(output_dir, "lib/app/types"))
      File.mkdir_p!(Path.join(output_dir, "priv/migrations"))

      File.write!(Path.join(output_dir, "lib/app/user.ex"), "defmodule App.User do\nend\n")
      File.write!(Path.join(output_dir, "lib/app/types/user.ex"), "defmodule App.Types.User do\nend\n")
      File.write!(Path.join(output_dir, "priv/migrations/001_create_users.sql"), "CREATE TABLE users;")

      task_map = %{
        "id" => 3,
        "related_specs" => ["solution.specs.entities.User"],
        "context" => %{}
      }

      result = {:ok, %{
        files_written: [
          "lib/app/user.ex",
          "lib/app/types/user.ex",
          "priv/migrations/001_create_users.sql"
        ],
        output_dir: output_dir
      }}

      assert :ok = AutoLinker.record_links(map_dir, task_map, result, project_dir)

      {:ok, entry} = Traceability.read(map_dir, "entities", "User")
      types = Enum.map(entry["links"], & &1["type"]) |> Enum.sort()
      assert "implementation" in types
      assert "type" in types
      assert "migration" in types
    end

    test "skips files that don't exist on disk", %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      # Don't create files on disk — they don't exist
      task_map = %{
        "id" => 4,
        "related_specs" => ["solution.specs.api.Missing"],
        "context" => %{}
      }

      result = {:ok, %{files_written: ["lib/nonexistent.ex"], output_dir: output_dir}}

      assert :ok = AutoLinker.record_links(map_dir, task_map, result, project_dir)

      # No entry should exist since file doesn't exist
      assert {:error, :not_found} = Traceability.read(map_dir, "api", "Missing")
    end

    test "handles error results gracefully", %{map_dir: map_dir} do
      task_map = %{"id" => 5, "related_specs" => ["solution.specs.api.Foo"]}
      assert :ok = AutoLinker.record_links(map_dir, task_map, {:error, :llm_failed})
    end

    test "handles empty related_specs", %{map_dir: map_dir, output_dir: output_dir} do
      File.mkdir_p!(Path.join(output_dir, "lib/app"))
      File.write!(Path.join(output_dir, "lib/app/foo.ex"), "defmodule App.Foo do\nend\n")

      task_map = %{"id" => 6, "related_specs" => []}
      result = {:ok, %{files_written: ["lib/app/foo.ex"], output_dir: output_dir}}

      assert :ok = AutoLinker.record_links(map_dir, task_map, result)
      {:ok, entries} = Traceability.read_all(map_dir)
      assert entries == []
    end

    test "handles nil related_specs", %{map_dir: map_dir, output_dir: output_dir} do
      task_map = %{"id" => 7, "related_specs" => nil}
      result = {:ok, %{files_written: ["lib/app/foo.ex"], output_dir: output_dir}}

      assert :ok = AutoLinker.record_links(map_dir, task_map, result)
    end

    test "handles task with no related_specs key", %{map_dir: map_dir, output_dir: output_dir} do
      task_map = %{"id" => 8}
      result = {:ok, %{files_written: ["lib/app/foo.ex"], output_dir: output_dir}}

      assert :ok = AutoLinker.record_links(map_dir, task_map, result)
    end

    test "handles prompt-only results (no files_written)", %{map_dir: map_dir} do
      task_map = %{"id" => 9, "related_specs" => ["solution.specs.api.Foo"]}
      result = {:ok, "some prompt text"}

      assert :ok = AutoLinker.record_links(map_dir, task_map, result)
    end
  end

  # ── Deduplication on re-run (VAL-TAUTO-008) ────────────────────

  describe "re-running codegen updates existing links" do
    test "does not create duplicate links on re-run", %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      File.mkdir_p!(Path.join(output_dir, "lib/app"))
      File.write!(Path.join(output_dir, "lib/app/init.ex"), "defmodule App.Init do\nend\n")

      task_map = %{
        "id" => 1,
        "related_specs" => ["solution.specs.api.InitProject"],
        "context" => %{}
      }

      result = {:ok, %{files_written: ["lib/app/init.ex"], output_dir: output_dir}}

      # Run twice
      assert :ok = AutoLinker.record_links(map_dir, task_map, result, project_dir)
      assert :ok = AutoLinker.record_links(map_dir, task_map, result, project_dir)

      {:ok, entry} = Traceability.read(map_dir, "api", "InitProject")
      # Should still be 1 link, not 2
      assert length(entry["links"]) == 1
    end

    test "updates stale links on re-run with new files", %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      File.mkdir_p!(Path.join(output_dir, "lib/app"))
      File.write!(Path.join(output_dir, "lib/app/init_v1.ex"), "defmodule App.InitV1 do\nend\n")

      task_map = %{
        "id" => 1,
        "related_specs" => ["solution.specs.api.InitProject"],
        "context" => %{}
      }

      result1 = {:ok, %{files_written: ["lib/app/init_v1.ex"], output_dir: output_dir}}
      assert :ok = AutoLinker.record_links(map_dir, task_map, result1, project_dir)

      {:ok, entry1} = Traceability.read(map_dir, "api", "InitProject")
      assert length(entry1["links"]) == 1
      assert hd(entry1["links"])["file_path"] |> String.contains?("init_v1.ex")

      # Now re-run with new file
      File.write!(Path.join(output_dir, "lib/app/init_v2.ex"), "defmodule App.InitV2 do\nend\n")
      result2 = {:ok, %{files_written: ["lib/app/init_v2.ex"], output_dir: output_dir}}
      assert :ok = AutoLinker.record_links(map_dir, task_map, result2, project_dir)

      {:ok, entry2} = Traceability.read(map_dir, "api", "InitProject")
      # Should have 2 links now (both files exist)
      assert length(entry2["links"]) == 2
      paths = Enum.map(entry2["links"], & &1["file_path"])
      assert Enum.any?(paths, &String.contains?(&1, "init_v1.ex"))
      assert Enum.any?(paths, &String.contains?(&1, "init_v2.ex"))
    end
  end

  # ── Preservation of manual links (VAL-TAUTO-007) ──────────────

  describe "manual links are preserved" do
    test "auto-linkage does not overwrite manual links", %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      # Add a manual link
      manual_links = [%{"type" => "implementation", "file_path" => "lib/manual/custom.ex"}]
      :ok = Traceability.write(map_dir, "api", "InitProject", manual_links)

      # Now run auto-linkage
      File.mkdir_p!(Path.join(output_dir, "lib/app"))
      File.write!(Path.join(output_dir, "lib/app/init.ex"), "defmodule App.Init do\nend\n")

      task_map = %{
        "id" => 1,
        "related_specs" => ["solution.specs.api.InitProject"],
        "context" => %{}
      }

      result = {:ok, %{files_written: ["lib/app/init.ex"], output_dir: output_dir}}
      assert :ok = AutoLinker.record_links(map_dir, task_map, result, project_dir)

      {:ok, entry} = Traceability.read(map_dir, "api", "InitProject")
      paths = Enum.map(entry["links"], & &1["file_path"])

      # Manual link should still be there
      assert "lib/manual/custom.ex" in paths
      # Auto-generated link should also be there
      assert Enum.any?(paths, &String.contains?(&1, "init.ex"))
    end
  end

  # ── Multiple spec categories in one task ───────────────────────

  describe "multiple related_specs" do
    test "records links for multiple specs from one task",
         %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      File.mkdir_p!(Path.join(output_dir, "lib/app"))
      File.write!(Path.join(output_dir, "lib/app/init.ex"), "defmodule App.Init do\nend\n")

      task_map = %{
        "id" => 1,
        "related_specs" => [
          "solution.specs.modules.Bropilot",
          "solution.specs.entities.Project"
        ],
        "context" => %{}
      }

      result = {:ok, %{files_written: ["lib/app/init.ex"], output_dir: output_dir}}
      assert :ok = AutoLinker.record_links(map_dir, task_map, result, project_dir)

      # Both specs should have entries
      assert {:ok, _} = Traceability.read(map_dir, "modules", "Bropilot")
      assert {:ok, _} = Traceability.read(map_dir, "entities", "Project")
    end
  end

  # ── All 11 categories (VAL-TAUTO-009) ──────────────────────────

  describe "all 11 spec categories produce links" do
    test "each category can receive auto-generated links", %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      categories = ~w(api behaviours constraints entities modules events externals views components streams infra)

      for cat <- categories do
        file_name = "lib/#{cat}/handler.ex"
        File.mkdir_p!(Path.join(output_dir, "lib/#{cat}"))
        File.write!(Path.join(output_dir, file_name), "defmodule #{cat} do\nend\n")

        task_map = %{
          "id" => cat,
          "related_specs" => ["solution.specs.#{cat}.TestSpec"],
          "context" => %{}
        }

        result = {:ok, %{files_written: [file_name], output_dir: output_dir}}
        assert :ok = AutoLinker.record_links(map_dir, task_map, result, project_dir),
               "Failed to record links for category #{cat}"
      end

      {:ok, all_entries} = Traceability.read_all(map_dir)
      assert length(all_entries) == 11

      for cat <- categories do
        {:ok, entry} = Traceability.read(map_dir, cat, "TestSpec")
        assert length(entry["links"]) >= 1,
               "Category #{cat} should have at least one link"
      end
    end
  end

  # ── Component/view specs (VAL-TAUTO-006) ───────────────────────

  describe "component and view specs link to correct file types" do
    test "components specs link to component source files", %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      File.mkdir_p!(Path.join(output_dir, "src/components"))
      File.write!(Path.join(output_dir, "src/components/Button.tsx"), "export const Button = () => {}\n")

      task_map = %{
        "id" => 1,
        "related_specs" => ["solution.specs.components.Button"],
        "context" => %{}
      }

      result = {:ok, %{files_written: ["src/components/Button.tsx"], output_dir: output_dir}}
      assert :ok = AutoLinker.record_links(map_dir, task_map, result, project_dir)

      {:ok, entry} = Traceability.read(map_dir, "components", "Button")
      assert length(entry["links"]) == 1
      assert hd(entry["links"])["type"] == "implementation"
      assert String.contains?(hd(entry["links"])["file_path"], "Button.tsx")
    end

    test "views specs link to page/view files", %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      File.mkdir_p!(Path.join(output_dir, "src/pages"))
      File.write!(Path.join(output_dir, "src/pages/home.astro"), "<h1>Home</h1>\n")

      task_map = %{
        "id" => 2,
        "related_specs" => ["solution.specs.views.Home"],
        "context" => %{}
      }

      result = {:ok, %{files_written: ["src/pages/home.astro"], output_dir: output_dir}}
      assert :ok = AutoLinker.record_links(map_dir, task_map, result, project_dir)

      {:ok, entry} = Traceability.read(map_dir, "views", "Home")
      assert length(entry["links"]) == 1
      assert hd(entry["links"])["type"] == "implementation"
      assert String.contains?(hd(entry["links"])["file_path"], "home.astro")
    end
  end

  # ── record_links_batch/3 ───────────────────────────────────────

  describe "record_links_batch/3" do
    test "records links for multiple tasks", %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      File.mkdir_p!(Path.join(output_dir, "lib/app"))
      File.write!(Path.join(output_dir, "lib/app/init.ex"), "defmodule App.Init do\nend\n")
      File.write!(Path.join(output_dir, "lib/app/user.ex"), "defmodule App.User do\nend\n")

      task_results = [
        {
          %{"id" => 1, "related_specs" => ["solution.specs.api.InitProject"]},
          {:ok, %{files_written: ["lib/app/init.ex"], output_dir: output_dir}}
        },
        {
          %{"id" => 2, "related_specs" => ["solution.specs.entities.User"]},
          {:ok, %{files_written: ["lib/app/user.ex"], output_dir: output_dir}}
        }
      ]

      assert :ok = AutoLinker.record_links_batch(map_dir, task_results, project_dir)

      assert {:ok, _} = Traceability.read(map_dir, "api", "InitProject")
      assert {:ok, _} = Traceability.read(map_dir, "entities", "User")
    end

    test "skips failed tasks in batch", %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      File.mkdir_p!(Path.join(output_dir, "lib/app"))
      File.write!(Path.join(output_dir, "lib/app/init.ex"), "defmodule App.Init do\nend\n")

      task_results = [
        {
          %{"id" => 1, "related_specs" => ["solution.specs.api.InitProject"]},
          {:ok, %{files_written: ["lib/app/init.ex"], output_dir: output_dir}}
        },
        {
          %{"id" => 2, "related_specs" => ["solution.specs.api.BadTask"]},
          {:error, :llm_failed}
        }
      ]

      assert :ok = AutoLinker.record_links_batch(map_dir, task_results, project_dir)

      assert {:ok, _} = Traceability.read(map_dir, "api", "InitProject")
      assert {:error, :not_found} = Traceability.read(map_dir, "api", "BadTask")
    end
  end
end

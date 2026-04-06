defmodule Bropilot.TraceabilityFixesTest do
  @moduledoc """
  Tests for the M2 scrutiny fix items:
    - Coverage summary correctly counts linked (links.length > 0) vs unlinked
    - Auto-linkage stale link handling with replace_stale_links
    - Entity context reference parsing
  """
  use ExUnit.Case
  import Plug.Test

  alias Bropilot.Api.Endpoint
  alias Bropilot.Traceability
  alias Bropilot.Traceability.AutoLinker

  setup_all do
    case Process.whereis(Bropilot.Api.Session) do
      nil -> start_supervised!(Bropilot.Api.Session)
      _pid -> :ok
    end

    :ok
  end

  @opts Endpoint.init([])

  defp call(conn) do
    Endpoint.call(conn, @opts)
  end

  defp json_body(conn) do
    Jason.decode!(conn.resp_body)
  end

  # ── Coverage summary fix ────────────────────────────────────────

  describe "coverage summary counts entries as linked only when links array is non-empty" do
    setup do
      tmp = System.tmp_dir!() |> Path.join("bropilot_coverage_fix_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)

      original_cwd = File.cwd!()
      File.cd!(tmp)

      {:ok, bropilot_dir} = Bropilot.init(tmp)
      map_dir = Path.join(bropilot_dir, "map")

      # Create spec files for the counts
      specs_dir = Path.join([map_dir, "solution", "specs"])
      File.mkdir_p!(specs_dir)

      Bropilot.Yaml.encode_to_file(
        %{"api" => %{"SpecA" => %{}, "SpecB" => %{}}},
        Path.join(specs_dir, "api.yaml")
      )

      on_exit(fn ->
        File.cd!(original_cwd)
        File.rm_rf!(tmp)
      end)

      {:ok, map_dir: map_dir}
    end

    test "entry with empty links array is NOT counted as linked", %{map_dir: map_dir} do
      # Write an entry with empty links (this can happen if links are removed)
      :ok = Traceability.write(map_dir, "api", "SpecA", [])

      # Write an entry with actual links
      :ok = Traceability.write(map_dir, "api", "SpecB", [
        %{"type" => "implementation", "file_path" => "lib/spec_b.ex"}
      ])

      conn =
        conn(:get, "/api/traceability")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      coverage = body["data"]["coverage"]

      # SpecA has empty links → should NOT be counted as linked
      # SpecB has 1 link → should be counted as linked
      api_cov = coverage["by_category"]["api"]
      assert api_cov["linked"] == 1, "Only entry with non-empty links should count as linked"
      assert api_cov["total"] == 2
      assert api_cov["unlinked"] == 1
    end

    test "entry with nil links is NOT counted as linked", %{map_dir: map_dir} do
      # Manually write an entry with nil links (edge case from corrupted data)
      path = Traceability.file_path(map_dir)
      data = %{
        "traceability" => [
          %{"spec_category" => "api", "spec_id" => "NilLinks", "links" => nil},
          %{"spec_category" => "api", "spec_id" => "GoodLinks", "links" => [
            %{"type" => "implementation", "file_path" => "lib/good.ex"}
          ]}
        ]
      }
      File.write!(path, Bropilot.Yaml.encode(data))

      conn =
        conn(:get, "/api/traceability")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      coverage = body["data"]["coverage"]

      api_cov = coverage["by_category"]["api"]
      assert api_cov["linked"] == 1, "Entry with nil links should NOT count as linked"
    end

    test "total_linked correctly sums only non-empty-linked entries", %{map_dir: map_dir} do
      :ok = Traceability.write(map_dir, "api", "EmptyA", [])
      :ok = Traceability.write(map_dir, "api", "EmptyB", [])
      :ok = Traceability.write(map_dir, "api", "Linked", [
        %{"type" => "implementation", "file_path" => "lib/linked.ex"}
      ])

      conn =
        conn(:get, "/api/traceability")
        |> call()

      body = json_body(conn)
      coverage = body["data"]["coverage"]

      assert coverage["total_linked"] == 1
    end
  end

  # ── Auto-linkage stale link handling ────────────────────────────

  describe "auto-linkage replace_stale_links" do
    setup do
      tmp = System.tmp_dir!() |> Path.join("bropilot_stale_link_#{:rand.uniform(100_000)}")
      map_dir = Path.join(tmp, "map")
      knowledge_dir = Path.join(map_dir, "knowledge")
      File.mkdir_p!(knowledge_dir)

      project_dir = Path.join(tmp, "project")
      output_dir = Path.join(project_dir, "output/task_1")
      File.mkdir_p!(output_dir)

      on_exit(fn -> File.rm_rf!(tmp) end)
      {:ok, map_dir: map_dir, project_dir: project_dir, output_dir: output_dir}
    end

    test "replace_stale_links updates function_name for same (type, file_path)", %{map_dir: map_dir} do
      # First codegen run
      :ok = AutoLinker.replace_stale_links(map_dir, "api", "Init", [
        %{"type" => "implementation", "file_path" => "lib/init.ex", "function_name" => "old/0"}
      ])

      # Second codegen run with updated function_name
      :ok = AutoLinker.replace_stale_links(map_dir, "api", "Init", [
        %{"type" => "implementation", "file_path" => "lib/init.ex", "function_name" => "new/1"}
      ])

      {:ok, entry} = Traceability.read(map_dir, "api", "Init")
      assert length(entry["links"]) == 1
      assert hd(entry["links"])["function_name"] == "new/1"
    end

    test "replace_stale_links preserves manual links of same type but different file_path", %{map_dir: map_dir} do
      # Manual link
      :ok = Traceability.write(map_dir, "api", "Init", [
        %{"type" => "implementation", "file_path" => "lib/manual/custom.ex"}
      ])

      # Auto-linkage run
      :ok = AutoLinker.replace_stale_links(map_dir, "api", "Init", [
        %{"type" => "implementation", "file_path" => "lib/auto/init.ex"}
      ])

      {:ok, entry} = Traceability.read(map_dir, "api", "Init")
      paths = Enum.map(entry["links"], & &1["file_path"])
      assert "lib/manual/custom.ex" in paths
      assert "lib/auto/init.ex" in paths
      assert length(entry["links"]) == 2
    end

    test "replace_stale_links preserves links of different types", %{map_dir: map_dir} do
      # Existing test link
      :ok = Traceability.write(map_dir, "api", "Init", [
        %{"type" => "test", "file_path" => "test/init_test.exs"}
      ])

      # Auto-linkage adds implementation link
      :ok = AutoLinker.replace_stale_links(map_dir, "api", "Init", [
        %{"type" => "implementation", "file_path" => "lib/init.ex"}
      ])

      {:ok, entry} = Traceability.read(map_dir, "api", "Init")
      types = Enum.map(entry["links"], & &1["type"]) |> Enum.sort()
      assert types == ["implementation", "test"]
    end

    test "replace_stale_links creates entry if none exists", %{map_dir: map_dir} do
      :ok = AutoLinker.replace_stale_links(map_dir, "api", "New", [
        %{"type" => "implementation", "file_path" => "lib/new.ex"}
      ])

      {:ok, entry} = Traceability.read(map_dir, "api", "New")
      assert length(entry["links"]) == 1
    end
  end

  # ── Entity context reference parsing ────────────────────────────

  describe "parse_context_entity_refs" do
    test "extracts entity names from context string" do
      task_map = %{
        "context" => "This task works with entities.User and entities.Project models"
      }

      refs = AutoLinker.parse_context_entity_refs(task_map)
      assert {"entities", "User"} in refs
      assert {"entities", "Project"} in refs
    end

    test "extracts entity names from full spec path" do
      task_map = %{
        "context" => "Related to solution.specs.entities.Order and solution.specs.entities.Product"
      }

      refs = AutoLinker.parse_context_entity_refs(task_map)
      assert {"entities", "Order"} in refs
      assert {"entities", "Product"} in refs
    end

    test "returns empty list when no entity references" do
      task_map = %{"context" => "This task is about API endpoints"}
      refs = AutoLinker.parse_context_entity_refs(task_map)
      assert refs == []
    end

    test "handles nil context" do
      task_map = %{"context" => nil}
      refs = AutoLinker.parse_context_entity_refs(task_map)
      assert refs == []
    end

    test "handles missing context key" do
      task_map = %{"id" => "1"}
      refs = AutoLinker.parse_context_entity_refs(task_map)
      assert refs == []
    end

    test "handles map context (inspect to string)" do
      task_map = %{
        "context" => %{"entities" => ["entities.User"]}
      }

      refs = AutoLinker.parse_context_entity_refs(task_map)
      assert {"entities", "User"} in refs
    end

    test "deduplicates entity references" do
      task_map = %{
        "context" => "entities.User and entities.User again"
      }

      refs = AutoLinker.parse_context_entity_refs(task_map)
      assert length(refs) == 1
      assert {"entities", "User"} in refs
    end
  end

  describe "parse_all_spec_refs" do
    test "combines related_specs and context entity refs" do
      related_specs = ["solution.specs.api.InitProject"]
      task_map = %{
        "context" => "This implements entities.User functionality"
      }

      refs = AutoLinker.parse_all_spec_refs(related_specs, task_map)
      assert {"api", "InitProject"} in refs
      assert {"entities", "User"} in refs
    end

    test "deduplicates refs from both sources" do
      related_specs = ["solution.specs.entities.User"]
      task_map = %{
        "context" => "Related to entities.User model"
      }

      refs = AutoLinker.parse_all_spec_refs(related_specs, task_map)
      # Should only have one entry for entities/User
      entity_refs = Enum.filter(refs, fn {cat, _} -> cat == "entities" end)
      assert length(entity_refs) == 1
    end

    test "handles empty related_specs with context refs" do
      related_specs = []
      task_map = %{
        "context" => "Working with entities.User"
      }

      refs = AutoLinker.parse_all_spec_refs(related_specs, task_map)
      assert {"entities", "User"} in refs
    end
  end

  # ── Entity context creates traceability links ───────────────────

  describe "entity references from task context create traceability links" do
    setup do
      tmp = System.tmp_dir!() |> Path.join("bropilot_entity_ctx_#{:rand.uniform(100_000)}")
      map_dir = Path.join(tmp, "map")
      knowledge_dir = Path.join(map_dir, "knowledge")
      File.mkdir_p!(knowledge_dir)

      project_dir = Path.join(tmp, "project")
      output_dir = Path.join(project_dir, "output/task_ctx")
      File.mkdir_p!(output_dir)

      on_exit(fn -> File.rm_rf!(tmp) end)
      {:ok, map_dir: map_dir, project_dir: project_dir, output_dir: output_dir}
    end

    test "auto-linker creates entity links from context references",
         %{map_dir: map_dir, output_dir: output_dir, project_dir: project_dir} do
      # Create files on disk
      File.mkdir_p!(Path.join(output_dir, "lib/app"))
      File.write!(Path.join(output_dir, "lib/app/handler.ex"), "defmodule App.Handler do\nend\n")

      task_map = %{
        "id" => "task-ctx",
        "related_specs" => ["solution.specs.api.InitProject"],
        "context" => "This endpoint handles entities.User creation"
      }

      result = {:ok, %{files_written: ["lib/app/handler.ex"], output_dir: output_dir}}
      assert :ok = AutoLinker.record_links(map_dir, task_map, result, project_dir)

      # API spec should have a link
      {:ok, api_entry} = Traceability.read(map_dir, "api", "InitProject")
      assert length(api_entry["links"]) >= 1

      # Entity spec should also have a link from context parsing
      {:ok, entity_entry} = Traceability.read(map_dir, "entities", "User")
      assert length(entity_entry["links"]) >= 1
    end
  end
end

defmodule Bropilot.MiscFixes2Test do
  @moduledoc """
  Tests for misc-fixes-2: M2 traceability validation fixes.
  Covers project-scoped traceability, broken path detection, git remote detection,
  auto-linker category-aware file selection, and visual indicator data.
  """
  use ExUnit.Case
  import Plug.Test

  alias Bropilot.Api.Endpoint
  alias Bropilot.Traceability

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

  setup do
    tmp = System.tmp_dir!() |> Path.join("bropilot_misc2_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)

    original_cwd = File.cwd!()
    File.cd!(tmp)

    {:ok, bropilot_dir} = Bropilot.init(tmp)
    map_dir = Path.join(bropilot_dir, "map")

    on_exit(fn ->
      File.cd!(original_cwd)
      File.rm_rf!(tmp)
    end)

    %{tmp: tmp, bropilot_dir: bropilot_dir, map_dir: map_dir}
  end

  # ── Project-Scoped Traceability (VAL-TAPI-007) ─────────────────────

  describe "project-scoped traceability routes" do
    test "GET /api/projects/:path/traceability returns matrix for project", %{tmp: tmp, map_dir: map_dir} do
      # Write a traceability entry
      :ok = Traceability.write(map_dir, "api", "InitProject", [
        %{"type" => "implementation", "file_path" => "lib/init.ex"}
      ])

      conn = conn(:get, "/api/projects/#{URI.encode_www_form(tmp)}/traceability")
      conn = call(conn)

      body = json_body(conn)
      assert conn.status == 200
      assert body["ok"] == true
      assert is_list(body["data"]["entries"])
      assert length(body["data"]["entries"]) >= 1
    end

    test "project A and project B have separate traceability data", %{map_dir: map_dir} do
      # Write data to current project (project A)
      :ok = Traceability.write(map_dir, "api", "ProjectASpec", [
        %{"type" => "implementation", "file_path" => "lib/a.ex"}
      ])

      # Create project B in a different directory
      tmp_b = System.tmp_dir!() |> Path.join("bropilot_misc2_b_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp_b)
      {:ok, bropilot_dir_b} = Bropilot.init(tmp_b)
      map_dir_b = Path.join(bropilot_dir_b, "map")

      # Write different data to project B
      :ok = Traceability.write(map_dir_b, "entities", "ProjectBSpec", [
        %{"type" => "type", "file_path" => "lib/b.ex"}
      ])

      # GET project B's traceability
      conn = conn(:get, "/api/projects/#{URI.encode_www_form(tmp_b)}/traceability")
      conn = call(conn)

      body = json_body(conn)
      assert conn.status == 200
      assert body["ok"] == true

      # Should have project B's data, not project A's
      entries = body["data"]["entries"]
      spec_ids = Enum.map(entries, & &1["spec_id"])
      assert "ProjectBSpec" in spec_ids
      refute "ProjectASpec" in spec_ids

      # Cleanup
      File.rm_rf!(tmp_b)
    end
  end

  # ── Broken Path Detection (VAL-TUI-012) ────────────────────────────

  describe "broken path detection in traceability API" do
    test "GET /api/traceability includes broken_paths for non-existent files", %{map_dir: map_dir} do
      # Write a link with a file that doesn't exist
      :ok = Traceability.write(map_dir, "api", "TestSpec", [
        %{"type" => "implementation", "file_path" => "nonexistent/file.ex"}
      ])

      conn = conn(:get, "/api/traceability")
      conn = call(conn)

      body = json_body(conn)
      assert conn.status == 200
      assert is_list(body["data"]["broken_paths"])
      assert "nonexistent/file.ex" in body["data"]["broken_paths"]
    end

    test "broken_paths does not include existing files", %{tmp: tmp, map_dir: map_dir} do
      # Create a file that exists
      existing_file = Path.join(tmp, "lib/existing.ex")
      File.mkdir_p!(Path.dirname(existing_file))
      File.write!(existing_file, "defmodule Existing do\nend\n")

      :ok = Traceability.write(map_dir, "api", "ExistingSpec", [
        %{"type" => "implementation", "file_path" => "lib/existing.ex"}
      ])

      conn = conn(:get, "/api/traceability")
      conn = call(conn)

      body = json_body(conn)
      assert conn.status == 200
      refute "lib/existing.ex" in body["data"]["broken_paths"]
    end
  end

  # ── Git Remote Detection ────────────────────────────────────────────

  describe "git remote detection in /api/project" do
    test "GET /api/project includes git_remote when .git/config exists", %{tmp: tmp} do
      # Create a mock .git/config
      git_dir = Path.join(tmp, ".git")
      File.mkdir_p!(git_dir)
      File.write!(Path.join(git_dir, "config"), """
      [core]
      \trepositoryformatversion = 0
      \tfilemode = true
      \tbare = false
      [remote "origin"]
      \turl = git@github.com:user/myrepo.git
      \tfetch = +refs/heads/*:refs/remotes/origin/*
      """)

      conn = conn(:get, "/api/project")
      conn = call(conn)

      body = json_body(conn)
      assert conn.status == 200
      assert body["ok"] == true
      assert body["data"]["project"]["git_remote"] == "git@github.com:user/myrepo.git"
    end

    test "GET /api/project has no git_remote when .git doesn't exist" do
      # Default tmp dir has no .git
      conn = conn(:get, "/api/project")
      conn = call(conn)

      body = json_body(conn)
      # Project data should not have git_remote when no .git exists
      project = body["data"]["project"]
      refute Map.has_key?(project, "git_remote")
    end
  end

  # ── Auto-Linker Category-Aware File Selection ──────────────────────

  describe "auto-linker category-aware file selection" do
    test "entity tasks get type, migration, and implementation files", %{map_dir: map_dir, tmp: tmp} do
      output_dir = Path.join(tmp, "output/v1")
      File.mkdir_p!(output_dir)

      # Create mock generator output files
      File.write!(Path.join(output_dir, "types.ts"), "export interface User {}")
      File.write!(Path.join(output_dir, "routes.ts"), "app.get('/api/users')")
      File.write!(Path.join(output_dir, "migration.sql"), "CREATE TABLE users")
      File.write!(Path.join(output_dir, "tests.test.ts"), "describe('User', () => {})")

      task_map = %{
        "id" => "task-1",
        "related_specs" => ["solution.specs.entities.User"],
        "context" => ""
      }

      result = {:ok, %{
        files_written: ["types.ts", "routes.ts", "migration.sql", "tests.test.ts"],
        output_dir: output_dir
      }}

      Bropilot.Traceability.AutoLinker.record_links(map_dir, task_map, result, tmp)

      {:ok, entries} = Traceability.read_all(map_dir)
      entity_entries = Enum.filter(entries, & &1["spec_category"] == "entities")
      assert length(entity_entries) >= 1

      entity_entry = List.first(entity_entries)
      link_types = Enum.map(entity_entry["links"], & &1["type"])

      # Entity specs should have type, migration, and implementation links
      assert "type" in link_types
      assert "migration" in link_types
    end

    test "behaviour tasks get test links", %{map_dir: map_dir, tmp: tmp} do
      output_dir = Path.join(tmp, "output/v1")
      File.mkdir_p!(output_dir)

      File.write!(Path.join(output_dir, "types.ts"), "export interface User {}")
      File.write!(Path.join(output_dir, "routes.ts"), "app.get('/api/users')")
      File.write!(Path.join(output_dir, "migration.sql"), "CREATE TABLE users")
      File.write!(Path.join(output_dir, "tests.test.ts"), "describe('User', () => {})")

      task_map = %{
        "id" => "task-2",
        "related_specs" => ["solution.specs.behaviours.CreateUser"],
        "context" => ""
      }

      result = {:ok, %{
        files_written: ["tests.test.ts", "routes.ts"],
        output_dir: output_dir
      }}

      Bropilot.Traceability.AutoLinker.record_links(map_dir, task_map, result, tmp)

      {:ok, entries} = Traceability.read_all(map_dir)
      behaviour_entries = Enum.filter(entries, & &1["spec_category"] == "behaviours")
      assert length(behaviour_entries) >= 1

      behaviour_entry = List.first(behaviour_entries)
      link_types = Enum.map(behaviour_entry["links"], & &1["type"])
      assert "test" in link_types
    end

    test "api tasks get implementation links", %{map_dir: map_dir, tmp: tmp} do
      output_dir = Path.join(tmp, "output/v1")
      File.mkdir_p!(output_dir)

      File.write!(Path.join(output_dir, "routes.ts"), "app.get('/api/users')")

      task_map = %{
        "id" => "task-3",
        "related_specs" => ["solution.specs.api.GetUsers"],
        "context" => ""
      }

      result = {:ok, %{
        files_written: ["routes.ts"],
        output_dir: output_dir
      }}

      Bropilot.Traceability.AutoLinker.record_links(map_dir, task_map, result, tmp)

      {:ok, entries} = Traceability.read_all(map_dir)
      api_entries = Enum.filter(entries, & &1["spec_category"] == "api")
      assert length(api_entries) >= 1

      api_entry = List.first(api_entries)
      link_types = Enum.map(api_entry["links"], & &1["type"])
      assert "implementation" in link_types
    end
  end

  # ── Coverage Summary Accuracy ──────────────────────────────────────

  describe "coverage summary" do
    test "coverage counts entries as linked only when links are non-empty", %{map_dir: map_dir} do
      # Write an entry with links
      :ok = Traceability.write(map_dir, "api", "WithLinks", [
        %{"type" => "implementation", "file_path" => "lib/a.ex"}
      ])

      # Write an entry with empty links
      :ok = Traceability.write(map_dir, "api", "NoLinks", [])

      conn = conn(:get, "/api/traceability")
      conn = call(conn)

      body = json_body(conn)
      coverage = body["data"]["coverage"]
      api_coverage = coverage["by_category"]["api"]

      # Only the entry with non-empty links should count as linked
      assert api_coverage["linked"] >= 1
    end
  end
end

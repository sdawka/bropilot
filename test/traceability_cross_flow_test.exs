defmodule Bropilot.TraceabilityCrossFlowTest do
  @moduledoc """
  Cross-flow integration tests for the codegen → traceability → UI pipeline.

  Verifies:
    - After Step 8 codegen, GET /api/traceability returns non-empty matrix with links
    - Each traceability link file_path points to an existing file on disk
    - Re-running codegen does not create duplicate links (count stays stable)
    - Traceability links survive server restart (persisted to disk)
    - Empty state renders gracefully when no links exist
    - GET /api/traceability returns correct coverage summary
  """
  use ExUnit.Case
  import Plug.Test

  alias Bropilot.Api.Endpoint
  alias Bropilot.Task.Agent
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
    tmp = System.tmp_dir!() |> Path.join("bropilot_crossflow_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)

    original_cwd = File.cwd!()
    File.cd!(tmp)

    {:ok, bropilot_dir} = Bropilot.init(tmp)
    map_dir = Path.join(bropilot_dir, "map")

    # Create spec files so codegen has something to reference
    specs_dir = Path.join([map_dir, "solution", "specs"])
    File.mkdir_p!(specs_dir)

    Bropilot.Yaml.encode_to_file(
      %{"api" => %{"InitProject" => %{"path" => "/api/init", "method" => "POST"}}},
      Path.join(specs_dir, "api.yaml")
    )

    Bropilot.Yaml.encode_to_file(
      %{"entities" => %{"User" => %{"attributes" => %{"id" => "integer", "name" => "string"}}}},
      Path.join(specs_dir, "entities.yaml")
    )

    Bropilot.Yaml.encode_to_file(
      %{"behaviours" => %{"Auth" => %{"description" => "Authenticate users"}}},
      Path.join(specs_dir, "behaviours.yaml")
    )

    # Create empty spec files for other categories
    for cat <- ~w(constraints modules events externals views components streams infra) do
      Bropilot.Yaml.encode_to_file(
        %{cat => %{}},
        Path.join(specs_dir, "#{cat}.yaml")
      )
    end

    on_exit(fn ->
      File.cd!(original_cwd)
      File.rm_rf!(tmp)
    end)

    {:ok,
     project_dir: tmp,
     bropilot_dir: bropilot_dir,
     map_dir: map_dir}
  end

  # ── Empty state ─────────────────────────────────────────────────

  describe "empty state" do
    test "GET /api/traceability returns empty matrix on fresh project" do
      conn =
        conn(:get, "/api/traceability")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert body["data"]["entries"] == []

      coverage = body["data"]["coverage"]
      assert coverage["total_linked"] == 0
      assert is_map(coverage["by_category"])
    end
  end

  # ── Codegen → Traceability flow ─────────────────────────────────

  describe "codegen → traceability end-to-end flow" do
    test "after Task.Agent codegen, GET /api/traceability returns non-empty links",
         %{project_dir: project_dir, map_dir: map_dir} do
      # Run a codegen task with related specs
      task = build_task("task-001", "Implement Init API", ["solution.specs.api.InitProject"])

      response_fn = fn _messages, _opts ->
        {:ok, """
        ```file:lib/app/init.ex
        defmodule App.Init do
          def init(project), do: {:ok, project}
        end
        ```
        """}
      end

      run_codegen_task(task, project_dir, map_dir, response_fn)

      # GET /api/traceability should now return non-empty entries
      conn =
        conn(:get, "/api/traceability")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert length(body["data"]["entries"]) >= 1

      # Verify the api/InitProject entry exists
      api_entry = Enum.find(body["data"]["entries"], fn e ->
        e["spec_category"] == "api" && e["spec_id"] == "InitProject"
      end)

      assert api_entry != nil, "Expected api/InitProject entry in traceability matrix"
      assert length(api_entry["links"]) >= 1

      # Verify link has correct structure
      link = hd(api_entry["links"])
      assert link["type"] == "implementation"
      assert is_binary(link["file_path"])
      assert String.contains?(link["file_path"], "init.ex")
    end

    test "traceability link file_path points to an existing file on disk",
         %{project_dir: project_dir, map_dir: map_dir} do
      task = build_task("task-exist-check", "Implement Auth", ["solution.specs.behaviours.Auth"])

      response_fn = fn _messages, _opts ->
        {:ok, """
        ```file:lib/app/auth.ex
        defmodule App.Auth do
          def authenticate(user), do: {:ok, user}
        end
        ```
        """}
      end

      run_codegen_task(task, project_dir, map_dir, response_fn)

      {:ok, entry} = Traceability.read(map_dir, "behaviours", "Auth")

      Enum.each(entry["links"], fn link ->
        # The auto-linker makes file_path relative to project_path.
        # Try resolving from project dir first, then absolute path.
        full_path = Path.join(project_dir, link["file_path"])

        assert File.exists?(full_path),
               "Expected file to exist at #{full_path} for link #{inspect(link)}"
      end)
    end

    test "re-running codegen does not create duplicate links (count stays stable)",
         %{project_dir: project_dir, map_dir: map_dir} do
      task = build_task("task-dedup", "Implement Init", ["solution.specs.api.InitProject"])

      response_fn = fn _messages, _opts ->
        {:ok, """
        ```file:lib/app/init.ex
        defmodule App.Init do
          def init, do: :ok
        end
        ```
        """}
      end

      # First run
      run_codegen_task(task, project_dir, map_dir, response_fn)

      conn1 = conn(:get, "/api/traceability") |> call()
      body1 = json_body(conn1)
      count1 = count_total_links(body1["data"]["entries"])

      # Second run (same task, same output)
      run_codegen_task(task, project_dir, map_dir, response_fn)

      conn2 = conn(:get, "/api/traceability") |> call()
      body2 = json_body(conn2)
      count2 = count_total_links(body2["data"]["entries"])

      # Link count should NOT have doubled
      assert count2 == count1,
             "Expected #{count1} links after re-run, got #{count2}. Duplication detected!"
    end

    test "coverage summary includes correct counts after codegen",
         %{project_dir: project_dir, map_dir: map_dir} do
      task = build_task("task-coverage", "Implement API", ["solution.specs.api.InitProject"])

      response_fn = fn _messages, _opts ->
        {:ok, """
        ```file:lib/app/init.ex
        defmodule App.Init do
          def init, do: :ok
        end
        ```
        """}
      end

      run_codegen_task(task, project_dir, map_dir, response_fn)

      conn = conn(:get, "/api/traceability") |> call()
      body = json_body(conn)
      coverage = body["data"]["coverage"]

      assert coverage["total_linked"] >= 1
      assert is_map(coverage["by_category"])

      # api category should have at least 1 linked spec
      api_cov = coverage["by_category"]["api"]
      assert api_cov["linked"] >= 1

      # All 11 categories should be present
      for cat <- ~w(api behaviours constraints entities modules events externals views components streams infra) do
        assert Map.has_key?(coverage["by_category"], cat),
               "Coverage should include category: #{cat}"
      end
    end

    test "GET /api/traceability/:category/:spec_id returns entry after codegen",
         %{project_dir: project_dir, map_dir: map_dir} do
      task = build_task("task-entry-get", "Implement Init", ["solution.specs.api.InitProject"])

      response_fn = fn _messages, _opts ->
        {:ok, """
        ```file:lib/app/init.ex
        defmodule App.Init do
          def init, do: :ok
        end
        ```
        """}
      end

      run_codegen_task(task, project_dir, map_dir, response_fn)

      conn = conn(:get, "/api/traceability/api/InitProject") |> call()
      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert body["data"]["spec_category"] == "api"
      assert body["data"]["spec_id"] == "InitProject"
      assert length(body["data"]["links"]) >= 1
    end
  end

  # ── Persistence (survive restart) ───────────────────────────────

  describe "traceability links survive server restart" do
    test "links persist to disk and can be re-read (simulating restart)",
         %{project_dir: project_dir, map_dir: map_dir} do
      task = build_task("task-persist", "Implement Init", ["solution.specs.api.InitProject"])

      response_fn = fn _messages, _opts ->
        {:ok, """
        ```file:lib/app/init.ex
        defmodule App.Init do
          def init, do: :ok
        end
        ```
        """}
      end

      run_codegen_task(task, project_dir, map_dir, response_fn)

      # Verify via API
      conn1 = conn(:get, "/api/traceability") |> call()
      body1 = json_body(conn1)
      entries_before = body1["data"]["entries"]
      assert length(entries_before) >= 1

      # Verify the file exists on disk
      trace_file = Traceability.file_path(map_dir)
      assert File.exists?(trace_file)

      # "Restart": re-read from disk using a fresh module call
      {:ok, fresh_entries} = Traceability.read_all(map_dir)
      assert length(fresh_entries) == length(entries_before)

      # Entry contents should match
      entry_before = Enum.find(entries_before, &(&1["spec_id"] == "InitProject"))
      entry_after = Enum.find(fresh_entries, &(&1["spec_id"] == "InitProject"))
      assert entry_before["links"] == entry_after["links"]
    end
  end

  # ── Multi-spec codegen ──────────────────────────────────────────

  describe "multi-spec codegen produces links for all related specs" do
    test "task with multiple related_specs produces entries for each",
         %{project_dir: project_dir, map_dir: map_dir} do
      task = build_task(
        "task-multi",
        "Implement User CRUD",
        ["solution.specs.entities.User", "solution.specs.api.InitProject"]
      )

      response_fn = fn _messages, _opts ->
        {:ok, """
        ```file:lib/app/user.ex
        defmodule App.User do
          defstruct [:id, :name]
        end
        ```

        ```file:lib/app/user_types.ex
        defmodule App.UserTypes do
          @type t :: %{id: integer, name: String.t}
        end
        ```
        """}
      end

      run_codegen_task(task, project_dir, map_dir, response_fn)

      # Both specs should have entries
      {:ok, entities_entry} = Traceability.read(map_dir, "entities", "User")
      assert length(entities_entry["links"]) >= 1

      {:ok, api_entry} = Traceability.read(map_dir, "api", "InitProject")
      assert length(api_entry["links"]) >= 1
    end

    test "different link types are correctly inferred from file paths",
         %{project_dir: project_dir, map_dir: map_dir} do
      task = build_task(
        "task-types",
        "Implement User with all artifact types",
        ["solution.specs.entities.User"]
      )

      response_fn = fn _messages, _opts ->
        {:ok, """
        ```file:lib/app/user.ex
        defmodule App.User do
          defstruct [:id, :name]
        end
        ```

        ```file:lib/app/user_types.ex
        defmodule App.UserTypes do
          @type t :: %{id: integer, name: String.t}
        end
        ```

        ```file:test/app/user_test.exs
        defmodule App.UserTest do
          use ExUnit.Case
          test "creates user" do
            assert %App.User{} = %App.User{id: 1, name: "test"}
          end
        end
        ```

        ```file:priv/migrations/001_create_users.sql
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        );
        ```
        """}
      end

      run_codegen_task(task, project_dir, map_dir, response_fn)

      {:ok, entry} = Traceability.read(map_dir, "entities", "User")
      types = Enum.map(entry["links"], & &1["type"]) |> Enum.sort() |> Enum.uniq()

      assert "implementation" in types
      assert "test" in types
      assert "type" in types
      assert "migration" in types
    end
  end

  # ── Traceability API response structure ─────────────────────────

  describe "traceability API response structure for UI consumption" do
    test "matrix response has all fields needed by traceability UI page",
         %{project_dir: project_dir, map_dir: map_dir} do
      # Seed some traceability data
      task = build_task("task-ui-check", "Implement Init", ["solution.specs.api.InitProject"])

      response_fn = fn _messages, _opts ->
        {:ok, """
        ```file:lib/app/init.ex
        defmodule App.Init do
          def init, do: :ok
        end
        ```
        """}
      end

      run_codegen_task(task, project_dir, map_dir, response_fn)

      conn = conn(:get, "/api/traceability") |> call()
      body = json_body(conn)

      # The UI expects these top-level fields
      assert Map.has_key?(body["data"], "entries")
      assert Map.has_key?(body["data"], "coverage")

      # Entries must have spec_category, spec_id, links
      entry = hd(body["data"]["entries"])
      assert Map.has_key?(entry, "spec_category")
      assert Map.has_key?(entry, "spec_id")
      assert Map.has_key?(entry, "links")

      # Links must have type and file_path
      link = hd(entry["links"])
      assert Map.has_key?(link, "type")
      assert Map.has_key?(link, "file_path")

      # Coverage must have totals and by_category
      coverage = body["data"]["coverage"]
      assert Map.has_key?(coverage, "total_specs")
      assert Map.has_key?(coverage, "total_linked")
      assert Map.has_key?(coverage, "total_unlinked")
      assert Map.has_key?(coverage, "by_category")

      # Each category coverage must have total, linked, unlinked
      Enum.each(coverage["by_category"], fn {_cat, cat_cov} ->
        assert Map.has_key?(cat_cov, "total")
        assert Map.has_key?(cat_cov, "linked")
        assert Map.has_key?(cat_cov, "unlinked")
      end)
    end
  end

  # ── Helpers ─────────────────────────────────────────────────────

  defp build_task(id, title, related_specs) do
    %{
      "id" => id,
      "title" => title,
      "description" => "Auto-generated task for #{title}",
      "context" => "",
      "definition_of_done" => ["Task completed"],
      "dependencies" => [],
      "priority" => "high",
      "related_specs" => related_specs,
      "status" => "pending"
    }
  end

  defp run_codegen_task(task, project_dir, map_dir, response_fn) do
    {:ok, pid} =
      Agent.start_link(task,
        execution_mode: :llm,
        llm_opts: [provider: :mock, response_fn: response_fn],
        map_dir: map_dir,
        project_path: project_dir
      )

    result = Agent.execute(pid)
    GenServer.stop(pid)
    result
  end

  defp count_total_links(entries) do
    Enum.reduce(entries, 0, fn entry, acc ->
      acc + length(entry["links"])
    end)
  end
end

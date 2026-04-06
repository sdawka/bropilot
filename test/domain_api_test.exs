defmodule Bropilot.DomainApiTest do
  @moduledoc """
  Tests for the Domain API endpoints (Act 2).
  Covers POST /api/domain/start, POST /api/domain/input, POST /api/domain/extract.
  """
  use ExUnit.Case
  import Plug.Test

  alias Bropilot.Api.Endpoint

  @worker_name Bropilot.Api.DomainWorker

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

  defp post_json(path, body \\ nil) do
    conn =
      if body do
        conn(:post, path, Jason.encode!(body))
      else
        conn(:post, path)
      end

    conn
    |> Plug.Conn.put_req_header("content-type", "application/json")
    |> call()
  end

  setup do
    # Set up a temp project directory with .bropilot
    tmp = System.tmp_dir!() |> Path.join("bropilot_domain_api_test_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)

    original_cwd = File.cwd!()
    File.cd!(tmp)

    {:ok, _bropilot_dir} = Bropilot.init(tmp)

    # Pre-populate Problem Space data (as if Act 1 completed)
    map_dir = Path.join([tmp, ".bropilot", "map"])

    Bropilot.Map.Store.write(map_dir, :problem, :problem, %{
      "problem" => "Teams struggle to track tasks"
    })

    Bropilot.Map.Store.write(map_dir, :problem, :context, %{
      "context" => "Existing tools are too complex"
    })

    Bropilot.Map.Store.write(map_dir, :problem, :audience, %{
      "audience" => "Small teams of 2-10 people"
    })

    Bropilot.Map.Store.write(map_dir, :problem, :assumptions, %{
      "assumptions" => ["Teams communicate regularly"]
    })

    Bropilot.Map.Store.write(map_dir, :problem, :hypotheses, %{
      "hypotheses" => ["Simple task management increases productivity"]
    })

    Bropilot.Map.Store.write(map_dir, :problem, :"vibes/basics", %{
      "audience" => "Small teams",
      "use_cases" => ["Create tasks", "Assign tasks"],
      "capabilities" => ["Task CRUD"],
      "design" => "Clean, minimal",
      "volo" => "Team task management made effortless",
      "hypotheses" => ["Productivity increases"],
      "assumptions" => ["Teams communicate regularly"]
    })

    on_exit(fn ->
      # Clean up registered worker
      case Process.whereis(@worker_name) do
        nil -> :ok
        pid ->
          try do
            GenServer.stop(pid, :normal)
          catch
            :exit, _ -> :ok
          end
      end

      File.cd!(original_cwd)
      File.rm_rf!(tmp)
    end)

    {:ok, project_dir: tmp, map_dir: map_dir}
  end

  # ── POST /api/domain/start ──────────────────────────────────

  describe "POST /api/domain/start" do
    test "returns Step 3 prompt with correct response structure" do
      conn = post_json("/api/domain/start")

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert is_binary(body["data"]["prompt"])
      assert body["data"]["step"] == "step3"
    end

    test "with mode=mock uses mock extraction" do
      conn = post_json("/api/domain/start", %{"mode" => "mock"})

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert body["data"]["step"] == "step3"
    end

    test "with mode=llm accepts llm mode" do
      conn = post_json("/api/domain/start", %{"mode" => "llm"})

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert body["data"]["step"] == "step3"
    end

    test "without explicit mode defaults based on LLM provider" do
      conn = post_json("/api/domain/start")

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert body["data"]["step"] == "step3"
    end

    test "returns 400 when .bropilot directory is missing" do
      # Change to a directory without .bropilot
      tmp2 = System.tmp_dir!() |> Path.join("bropilot_no_init_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp2)
      original = File.cwd!()
      File.cd!(tmp2)

      conn = post_json("/api/domain/start")

      assert conn.status == 400
      body = json_body(conn)
      assert body["ok"] == false
      assert String.contains?(body["error"], ".bropilot")

      File.cd!(original)
      File.rm_rf!(tmp2)
    end

    test "restarting domain session kills old worker" do
      # First start
      conn1 = post_json("/api/domain/start", %{"mode" => "mock"})
      assert conn1.status == 200

      old_pid = Process.whereis(@worker_name)
      assert is_pid(old_pid)

      # Second start (should kill old worker)
      conn2 = post_json("/api/domain/start", %{"mode" => "mock"})
      assert conn2.status == 200

      new_pid = Process.whereis(@worker_name)
      assert is_pid(new_pid)

      # Old worker should be gone
      refute Process.alive?(old_pid)
    end
  end

  # ── POST /api/domain/extract ────────────────────────────────

  describe "POST /api/domain/extract" do
    test "returns 400 when called before start" do
      conn = post_json("/api/domain/extract")

      assert conn.status == 400
      body = json_body(conn)
      assert body["ok"] == false
      assert String.contains?(body["error"], "domain worker not started")
    end

    test "Step 3 extract returns domain data with step3_done status" do
      # Start first
      post_json("/api/domain/start", %{"mode" => "mock"})

      # Extract (Step 3)
      conn = post_json("/api/domain/extract")

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert body["data"]["status"] == "step3_done"
      assert body["data"]["next"] == "step4"

      # Should have extracted domain data
      extracted = body["data"]["extracted"]
      assert is_map(extracted)
      assert is_list(extracted["vocabulary"])
      assert is_list(extracted["entities"])
      assert is_list(extracted["relationships"])
    end

    test "Step 3 extract auto-triggers Step 4 prompt" do
      post_json("/api/domain/start", %{"mode" => "mock"})

      conn = post_json("/api/domain/extract")

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true

      # Should include step4_prompt from auto-trigger
      assert is_binary(body["data"]["step4_prompt"])
    end

    test "second extract runs Step 4 and returns all 11 spec categories" do
      post_json("/api/domain/start", %{"mode" => "mock"})

      # Step 3 extract
      post_json("/api/domain/extract")

      # Step 4 extract
      conn = post_json("/api/domain/extract")

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert body["data"]["status"] == "complete"

      extracted = body["data"]["extracted"]
      assert is_map(extracted)

      # All 11 spec categories should be present
      spec_categories =
        ~w(api behaviours constraints entities modules events externals views components streams infra)

      for cat <- spec_categories do
        assert is_list(extracted[cat]),
               "Expected extracted data to contain #{cat} as a list, got: #{inspect(extracted[cat])}"
      end
    end
  end

  # ── POST /api/domain/input ──────────────────────────────────

  describe "POST /api/domain/input" do
    test "returns 400 when called before start" do
      conn = post_json("/api/domain/input", %{"text" => "My domain description"})

      assert conn.status == 400
      body = json_body(conn)
      assert body["ok"] == false
      assert String.contains?(body["error"], "domain worker not started")
    end

    test "accepts domain description text after start" do
      post_json("/api/domain/start", %{"mode" => "mock"})

      conn = post_json("/api/domain/input", %{"text" => "A collaborative task management app"})

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
    end

    test "returns 400 for empty input" do
      post_json("/api/domain/start", %{"mode" => "mock"})

      conn = post_json("/api/domain/input", %{"text" => ""})

      assert conn.status == 400
      body = json_body(conn)
      assert body["ok"] == false
      assert String.contains?(body["error"], "empty")
    end

    test "returns 400 for whitespace-only input" do
      post_json("/api/domain/start", %{"mode" => "mock"})

      conn = post_json("/api/domain/input", %{"text" => "   \n  "})

      assert conn.status == 400
      body = json_body(conn)
      assert body["ok"] == false
      assert String.contains?(body["error"], "empty")
    end
  end

  # ── YAML writes after full extraction ───────────────────────

  describe "extract writes YAML to solution space map" do
    test "after full Act 2 run, YAML files exist in map/solution/", %{map_dir: map_dir} do
      post_json("/api/domain/start", %{"mode" => "mock"})

      # Step 3 extract
      post_json("/api/domain/extract")

      # Step 4 extract
      post_json("/api/domain/extract")

      # Domain files
      assert File.exists?(Path.join([map_dir, "solution", "vocabulary.yaml"]))
      assert File.exists?(Path.join([map_dir, "solution", "domain", "entities.yaml"]))
      assert File.exists?(Path.join([map_dir, "solution", "domain", "relationships.yaml"]))
      assert File.exists?(Path.join([map_dir, "solution", "flows", "user-flows.yaml"]))
      assert File.exists?(Path.join([map_dir, "solution", "flows", "system-flows.yaml"]))
      assert File.exists?(Path.join([map_dir, "solution", "architecture", "components.yaml"]))
      assert File.exists?(Path.join([map_dir, "solution", "architecture", "dependencies.yaml"]))

      # All 11 spec files
      spec_categories =
        ~w(api behaviours constraints entities modules events externals views components streams infra)

      for cat <- spec_categories do
        path = Path.join([map_dir, "solution", "specs", "#{cat}.yaml"])
        assert File.exists?(path), "Expected #{path} to exist"
      end
    end
  end
end

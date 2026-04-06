defmodule Bropilot.ApiTest do
  use ExUnit.Case
  import Plug.Test
  import Plug.Conn

  alias Bropilot.Api.Endpoint

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

  # ── Health ───────────────────────────────────────────────────

  describe "GET /api/health" do
    test "returns 200 with healthy status" do
      conn =
        conn(:get, "/api/health")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert body["data"]["status"] == "healthy"
    end
  end

  # ── CORS ─────────────────────────────────────────────────────

  describe "CORS headers" do
    test "CORS headers are present on responses" do
      conn =
        conn(:get, "/api/health")
        |> put_req_header("origin", "http://localhost:3000")
        |> call()

      assert conn.status == 200

      cors_header = get_resp_header(conn, "access-control-allow-origin")
      assert cors_header == ["*"]
    end

    test "OPTIONS preflight returns CORS headers" do
      conn =
        conn(:options, "/api/health")
        |> put_req_header("origin", "http://localhost:3000")
        |> put_req_header("access-control-request-method", "POST")
        |> call()

      assert conn.status in [200, 204]

      cors_header = get_resp_header(conn, "access-control-allow-origin")
      assert cors_header == ["*"]
    end
  end

  # ── Spaces ───────────────────────────────────────────────────

  describe "GET /api/spaces" do
    test "returns all 5 spaces" do
      conn =
        conn(:get, "/api/spaces")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert length(body["data"]["spaces"]) == 5

      space_ids = Enum.map(body["data"]["spaces"], & &1["id"])
      assert "problem" in space_ids
      assert "solution" in space_ids
      assert "work" in space_ids
      assert "measurement" in space_ids
      assert "knowledge" in space_ids
    end
  end

  # ── Project (requires init) ──────────────────────────────────

  describe "GET /api/project" do
    setup do
      tmp = System.tmp_dir!() |> Path.join("bropilot_api_test_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)

      # Store original cwd and change to tmp
      original_cwd = File.cwd!()
      File.cd!(tmp)

      {:ok, _bropilot_dir} = Bropilot.init(tmp)

      on_exit(fn ->
        File.cd!(original_cwd)
        File.rm_rf!(tmp)
      end)

      {:ok, project_dir: tmp}
    end

    test "returns project info after init" do
      conn =
        conn(:get, "/api/project")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert is_map(body["data"]["project"])
    end
  end

  # ── Map read/write ──────────────────────────────────────────

  describe "PUT and GET /api/map/:space/:slot" do
    setup do
      tmp = System.tmp_dir!() |> Path.join("bropilot_api_map_test_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)

      original_cwd = File.cwd!()
      File.cd!(tmp)

      {:ok, _bropilot_dir} = Bropilot.init(tmp)

      on_exit(fn ->
        File.cd!(original_cwd)
        File.rm_rf!(tmp)
      end)

      {:ok, project_dir: tmp}
    end

    test "writes and reads slot data" do
      data = %{"problem" => "Users can't find things", "severity" => "high"}

      # Write
      put_conn =
        conn(:put, "/api/map/problem/problem", Jason.encode!(data))
        |> put_req_header("content-type", "application/json")
        |> call()

      assert put_conn.status == 200
      put_body = json_body(put_conn)
      assert put_body["ok"] == true

      # Read
      get_conn =
        conn(:get, "/api/map/problem/problem")
        |> call()

      assert get_conn.status == 200
      get_body = json_body(get_conn)
      assert get_body["ok"] == true
      assert get_body["data"]["problem"] == "Users can't find things"
    end
  end

  # ── Snapshot ─────────────────────────────────────────────────

  describe "POST /api/snapshot" do
    setup do
      tmp = System.tmp_dir!() |> Path.join("bropilot_api_snap_test_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)

      original_cwd = File.cwd!()
      File.cd!(tmp)

      {:ok, bropilot_dir} = Bropilot.init(tmp)

      # Write some data so snapshot has content
      map_dir = Path.join(bropilot_dir, "map")
      Bropilot.Map.Store.write(map_dir, :problem, :problem, %{"problem" => "test"})

      # Fill solution space slots so gate validation passes
      Bropilot.Map.Store.write(map_dir, :solution, :vocabulary, %{"terms" => []})
      File.mkdir_p!(Path.join([map_dir, "solution", "domain"]))
      Bropilot.Map.Store.write(map_dir, :solution, :"domain/entities", %{"entities" => []})
      File.mkdir_p!(Path.join([map_dir, "solution", "flows"]))
      Bropilot.Map.Store.write(map_dir, :solution, :"flows/user-flows", %{"flows" => []})
      File.mkdir_p!(Path.join([map_dir, "solution", "architecture"]))
      Bropilot.Map.Store.write(map_dir, :solution, :"architecture/components", %{"components" => []})
      File.mkdir_p!(Path.join([map_dir, "solution", "specs"]))
      Bropilot.Map.Store.write(map_dir, :solution, :"specs/api", %{"api" => []})

      # Ensure versions dir exists
      File.mkdir_p!(Path.join([map_dir, "work", "versions"]))

      on_exit(fn ->
        File.cd!(original_cwd)
        File.rm_rf!(tmp)
      end)

      {:ok, project_dir: tmp}
    end

    test "creates a new version snapshot" do
      conn =
        conn(:post, "/api/snapshot")
        |> put_req_header("content-type", "application/json")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert body["data"]["version"] == 1
      assert body["data"]["version_id"] == "v001"
    end
  end

  # ── Vibe (Act 1) ────────────────────────────────────────────

  describe "POST /api/vibe/start" do
    setup do
      tmp = System.tmp_dir!() |> Path.join("bropilot_api_vibe_test_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)

      original_cwd = File.cwd!()
      File.cd!(tmp)

      {:ok, _bropilot_dir} = Bropilot.init(tmp)

      on_exit(fn ->
        # Clean up registered worker
        case Process.whereis(Bropilot.Api.VibeWorker) do
          nil -> :ok
          pid -> GenServer.stop(pid, :normal)
        end

        File.cd!(original_cwd)
        File.rm_rf!(tmp)
      end)

      {:ok, project_dir: tmp}
    end

    test "starts vibe worker and returns step1 prompt" do
      conn =
        conn(:post, "/api/vibe/start")
        |> put_req_header("content-type", "application/json")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert is_binary(body["data"]["prompt"])
      assert body["data"]["step"] == "step1"
    end
  end

  # ── 404 ──────────────────────────────────────────────────────

  describe "unknown routes" do
    test "returns 404 for unknown paths" do
      conn =
        conn(:get, "/api/nonexistent")
        |> call()

      assert conn.status == 404
      body = json_body(conn)
      assert body["ok"] == false
      assert body["error"] == "not found"
    end
  end

  # ── JSON format ──────────────────────────────────────────────

  describe "response format" do
    test "all responses have content-type application/json" do
      conn =
        conn(:get, "/api/health")
        |> call()

      content_type = get_resp_header(conn, "content-type")
      assert Enum.any?(content_type, &String.contains?(&1, "application/json"))
    end

    test "success responses have ok: true and data key" do
      conn =
        conn(:get, "/api/health")
        |> call()

      body = json_body(conn)
      assert body["ok"] == true
      assert Map.has_key?(body, "data")
    end

    test "error responses have ok: false and error key" do
      conn =
        conn(:get, "/api/nonexistent")
        |> call()

      body = json_body(conn)
      assert body["ok"] == false
      assert Map.has_key?(body, "error")
    end
  end
end

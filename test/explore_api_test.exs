defmodule Bropilot.ExploreApiTest do
  @moduledoc """
  Tests for the unified Exploration API endpoints.
  Covers /api/explore/{start,message,buffer,extract,readiness,lenses,auto,commit}.
  """
  use ExUnit.Case
  import Plug.Test
  import Plug.Conn

  alias Bropilot.Api.Endpoint

  @worker_name Bropilot.Api.ExplorationWorker
  @engine_name Bropilot.Api.PipelineEngine

  setup_all do
    case Process.whereis(Bropilot.Api.Session) do
      nil -> start_supervised!(Bropilot.Api.Session)
      _pid -> :ok
    end

    :ok
  end

  @opts Endpoint.init([])

  defp call(conn), do: Endpoint.call(conn, @opts)
  defp json_body(conn), do: Jason.decode!(conn.resp_body)

  defp setup_project do
    tmp = System.tmp_dir!() |> Path.join("bropilot_explore_api_#{:rand.uniform(1_000_000)}")
    File.mkdir_p!(tmp)
    original_cwd = File.cwd!()
    File.cd!(tmp)
    {:ok, _bropilot_dir} = Bropilot.init(tmp)
    {tmp, original_cwd}
  end

  defp cleanup(tmp, original_cwd) do
    case Process.whereis(@worker_name) do
      nil -> :ok
      pid -> (try do GenServer.stop(pid, :normal) catch _, _ -> :ok end)
    end

    case Process.whereis(@engine_name) do
      nil -> :ok
      pid -> (try do GenServer.stop(pid, :normal) catch _, _ -> :ok end)
    end

    File.cd!(original_cwd)
    File.rm_rf!(tmp)
  end

  defp post_json(path, body) do
    conn(:post, path, Jason.encode!(body))
    |> put_req_header("content-type", "application/json")
    |> call()
  end

  defp post_empty(path) do
    conn(:post, path, "")
    |> put_req_header("content-type", "application/json")
    |> call()
  end

  defp fill_problem_slots(map_dir) do
    problem_dir = Path.join(map_dir, "problem")
    File.mkdir_p!(problem_dir)
    for slot <- ~w(audience problem context assumptions hypotheses) do
      File.write!(Path.join(problem_dir, "#{slot}.yaml"), "test: true")
    end
  end

  defp fill_solution_slots(map_dir) do
    solution_dir = Path.join(map_dir, "solution")
    File.mkdir_p!(solution_dir)
    File.write!(Path.join(solution_dir, "vocabulary.yaml"), "test: true")
    for dir <- ~w(domain flows architecture specs) do
      File.mkdir_p!(Path.join(solution_dir, dir))
    end
  end

  describe "POST /api/explore/start" do
    test "before init, returns error" do
      tmp = System.tmp_dir!() |> Path.join("explore_no_init_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)
      original_cwd = File.cwd!()
      File.cd!(tmp)

      try do
        conn = post_json("/api/explore/start", %{"mode" => "mock"})
        assert conn.status == 400
        body = json_body(conn)
        assert body["ok"] == false
      after
        File.cd!(original_cwd)
        File.rm_rf!(tmp)
      end
    end

    test "after init, start returns ok" do
      {tmp, cwd} = setup_project()

      try do
        conn = post_json("/api/explore/start", %{"mode" => "mock"})
        assert conn.status == 200
        body = json_body(conn)
        assert body["ok"] == true
      after
        cleanup(tmp, cwd)
      end
    end
  end

  describe "exploration flow" do
    setup do
      {tmp, cwd} = setup_project()
      _ = post_json("/api/explore/start", %{"mode" => "mock"})
      on_exit(fn -> cleanup(tmp, cwd) end)
      {:ok, project_dir: tmp}
    end

    test "submit messages, extract, get readiness" do
      m_conn = post_json("/api/explore/message", %{"text" => "I want a todo app"})
      assert m_conn.status == 200
      assert json_body(m_conn)["ok"] == true

      e_conn = post_empty("/api/explore/extract")
      assert e_conn.status in [200, 400]

      r_conn = call(conn(:get, "/api/explore/readiness"))
      assert r_conn.status == 200
      assert json_body(r_conn)["ok"] == true
    end

    test "buffer endpoint accepts text" do
      conn = post_json("/api/explore/buffer", %{"text" => "voice transcript chunk"})
      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert is_integer(body["data"]["buffer_size"])
    end

    test "auto endpoint toggles state" do
      c1 = post_json("/api/explore/auto", %{"enabled" => true})
      assert c1.status == 200
      assert json_body(c1)["data"]["auto_extract"] == true

      c2 = post_json("/api/explore/auto", %{"enabled" => false})
      assert c2.status == 200
      assert json_body(c2)["data"]["auto_extract"] == false
    end

    test "GET /api/explore/lenses returns a list" do
      conn = call(conn(:get, "/api/explore/lenses"))
      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert is_list(body["data"]["lenses"])
    end
  end

  describe "POST /api/explore/commit" do
    setup do
      {tmp, cwd} = setup_project()
      _ = post_json("/api/explore/start", %{"mode" => "mock"})

      # Always start a fresh pipeline engine pointing at THIS test's tmp dir.
      # A previous test may have left a stale engine registered with a different project_path.
      case Process.whereis(@engine_name) do
        nil -> :ok
        existing -> Process.exit(existing, :kill); :timer.sleep(20)
      end

      {:ok, pid} = Bropilot.Pipeline.Engine.start_link(project_path: tmp)
      Process.register(pid, @engine_name)

      on_exit(fn ->
        # Stop and unregister the engine so other test suites don't see a stale process
        case Process.whereis(@engine_name) do
          nil -> :ok
          stale -> Process.exit(stale, :kill); :timer.sleep(10)
        end

        cleanup(tmp, cwd)
      end)
      {:ok, project_dir: tmp, map_dir: Path.join([tmp, ".bropilot", "map"])}
    end

    test "commit when slots empty returns 422 with unfilled_slots", _ctx do
      conn = post_empty("/api/explore/commit")
      assert conn.status == 422
      body = json_body(conn)
      assert body["error"] == "unfilled_slots"
    end

    test "commit succeeds after filling slots", %{map_dir: map_dir} do
      fill_problem_slots(map_dir)
      fill_solution_slots(map_dir)

      conn = post_empty("/api/explore/commit")
      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert body["data"]["phase"] == "work"
    end
  end
end

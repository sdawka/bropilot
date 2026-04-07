defmodule Bropilot.E2eTest do
  @moduledoc """
  End-to-end test: starts a real Bandit server, hits the API with HTTP,
  and verifies the full flow from init to vibe to snapshot.
  """
  use ExUnit.Case

  @port 4099
  @base "http://127.0.0.1:#{@port}"

  setup_all do
    # Start Session agent
    case Process.whereis(Bropilot.Api.Session) do
      nil -> start_supervised!(Bropilot.Api.Session)
      _pid -> :ok
    end

    # Start a real Bandit server on a test port
    {:ok, _} = Bandit.start_link(plug: Bropilot.Api.Endpoint, port: @port)

    # Init a project in a temp directory and cd into it
    tmp = Path.join(System.tmp_dir!(), "bropilot_e2e_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)
    original_cwd = File.cwd!()
    File.cd!(tmp)

    {:ok, _} = Bropilot.init(tmp)

    on_exit(fn ->
      File.cd!(original_cwd)
      File.rm_rf!(tmp)
    end)

    {:ok, tmp: tmp, token: Bropilot.Api.Session.get_token()}
  end

  defp get(path) do
    Req.get!("#{@base}#{path}").body
  end

  defp post(path, body \\ %{}) do
    Req.post!("#{@base}#{path}", json: body).body
  end

  describe "full API flow (localhost, no token needed)" do
    test "health check" do
      resp = get("/api/health")
      assert resp["ok"] == true
      assert resp["data"]["status"] == "healthy"
    end

    test "spaces returns all 5" do
      resp = get("/api/spaces")
      assert resp["ok"] == true
      assert length(resp["data"]["spaces"]) == 5
      ids = Enum.map(resp["data"]["spaces"], & &1["id"])
      assert "problem" in ids
      assert "solution" in ids
      assert "work" in ids
      assert "measurement" in ids
      assert "knowledge" in ids
    end

    test "init project via API" do
      resp = post("/api/init")
      assert resp["ok"] == true
      assert resp["data"]["status"] in ["initialized", "already_initialized"]
    end

    test "pipeline status after init" do
      # Ensure pipeline is started
      post("/api/init")

      resp = get("/api/pipeline/status")
      assert resp["ok"] == true
      assert resp["data"]["phase"] == "exploration"
    end

    test "recipe endpoint returns webapp recipe" do
      resp = get("/api/recipe")
      assert resp["ok"] == true
      assert resp["data"]["name"] == "webapp"
    end

    test "space data for problem space" do
      resp = get("/api/spaces/problem")
      assert resp["ok"] == true
      assert resp["data"]["id"] == "problem"
      assert is_list(resp["data"]["slots"])
    end

    test "write and read map slot" do
      data = %{"test" => "hello", "items" => [1, 2, 3]}
      put_resp = Req.put!("#{@base}/api/map/problem/audience", json: data).body
      assert put_resp["ok"] == true

      get_resp = get("/api/map/problem/audience")
      assert get_resp["ok"] == true
      assert get_resp["data"]["test"] == "hello"
    end

    test "explore start returns ok" do
      resp = post("/api/explore/start", %{mode: "mock"})
      assert resp["ok"] == true
    end

    test "explore message then extract" do
      # Start fresh in mock mode
      post("/api/explore/start", %{mode: "mock"})

      # Submit a message
      msg_resp = post("/api/explore/message", %{text: "I want to build a todo app for teams"})
      assert msg_resp["ok"] == true

      # Extract (mock mode)
      extract_resp = post("/api/explore/extract")
      assert extract_resp["ok"] == true, "Extract failed: #{inspect(extract_resp)}"
    end

    test "knowledge endpoint" do
      resp = get("/api/knowledge")
      assert resp["ok"] == true
      assert is_list(resp["data"]["glossary"])
      assert is_list(resp["data"]["decisions"])
      assert is_list(resp["data"]["changelog"])
    end

    test "versions endpoint" do
      resp = get("/api/versions")
      assert resp["ok"] == true
      assert is_list(resp["data"]["versions"])
    end

    test "pair endpoint validates token", %{token: token} do
      # Wrong token
      bad_resp = post("/api/pair", %{token: "wrong-0000"})
      assert bad_resp["ok"] == false

      # Right token
      good_resp = post("/api/pair", %{token: token})
      assert good_resp["ok"] == true
    end

    test "unknown route returns 404" do
      resp = get("/api/nonexistent")
      assert resp["ok"] == false
      assert resp["error"] == "not found"
    end
  end
end

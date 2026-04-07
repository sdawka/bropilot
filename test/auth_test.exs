defmodule Bropilot.Api.AuthTest do
  use ExUnit.Case
  import Plug.Test
  import Plug.Conn

  alias Bropilot.Api.Endpoint
  alias Bropilot.Api.Session

  setup_all do
    case Process.whereis(Session) do
      nil -> start_supervised!(Session)
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

  # ── Localhost bypass ─────────────────────────────────────────

  describe "localhost bypass" do
    test "IPv4 127.0.0.1 passes without token" do
      conn =
        conn(:get, "/api/spaces")
        |> Map.put(:remote_ip, {127, 0, 0, 1})
        |> call()

      assert conn.status == 200
    end

    test "IPv6 ::1 passes without token" do
      conn =
        conn(:get, "/api/spaces")
        |> Map.put(:remote_ip, {0, 0, 0, 0, 0, 0, 0, 1})
        |> call()

      assert conn.status == 200
    end
  end

  # ── Remote without token ─────────────────────────────────────

  describe "remote requests without token" do
    test "returns 401 for remote IP without token" do
      conn =
        conn(:get, "/api/spaces")
        |> Map.put(:remote_ip, {192, 168, 1, 100})
        |> call()

      assert conn.status == 401
      body = json_body(conn)
      assert body["ok"] == false
      assert body["error"] == "unauthorized"
      assert body["message"] =~ "Bearer"
    end
  end

  # ── Remote with valid Bearer token ───────────────────────────

  describe "remote requests with valid Bearer token" do
    test "passes when Authorization header has correct token" do
      token = Session.get_token()

      conn =
        conn(:get, "/api/spaces")
        |> Map.put(:remote_ip, {192, 168, 1, 100})
        |> put_req_header("authorization", "Bearer #{token}")
        |> call()

      assert conn.status == 200
    end
  end

  # ── Remote with valid query param token ──────────────────────

  describe "remote requests with valid query param token" do
    test "passes when token query param is correct" do
      token = Session.get_token()

      conn =
        conn(:get, "/api/spaces?token=#{token}")
        |> Map.put(:remote_ip, {192, 168, 1, 100})
        |> call()

      assert conn.status == 200
    end
  end

  # ── Remote with invalid token ────────────────────────────────

  describe "remote requests with invalid token" do
    test "returns 401 with wrong Bearer token" do
      conn =
        conn(:get, "/api/spaces")
        |> Map.put(:remote_ip, {192, 168, 1, 100})
        |> put_req_header("authorization", "Bearer wrong-token-1234")
        |> call()

      assert conn.status == 401
      body = json_body(conn)
      assert body["ok"] == false
      assert body["error"] == "unauthorized"
    end

    test "returns 401 with wrong query param token" do
      conn =
        conn(:get, "/api/spaces?token=wrong-token-1234")
        |> Map.put(:remote_ip, {192, 168, 1, 100})
        |> call()

      assert conn.status == 401
    end
  end

  # ── Public endpoints ─────────────────────────────────────────

  describe "public endpoints" do
    test "GET /api/health passes without token from remote IP" do
      conn =
        conn(:get, "/api/health")
        |> Map.put(:remote_ip, {192, 168, 1, 100})
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
    end

    test "OPTIONS preflight passes without token from remote IP" do
      conn =
        conn(:options, "/api/spaces")
        |> Map.put(:remote_ip, {192, 168, 1, 100})
        |> put_req_header("origin", "http://example.com")
        |> put_req_header("access-control-request-method", "GET")
        |> call()

      assert conn.status in [200, 204]
    end
  end

  # ── Pairing endpoint ─────────────────────────────────────────

  describe "POST /api/pair" do
    test "returns success with correct token" do
      token = Session.get_token()

      conn =
        conn(:post, "/api/pair", Jason.encode!(%{"token" => token}))
        |> Map.put(:remote_ip, {192, 168, 1, 100})
        |> put_req_header("content-type", "application/json")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert body["data"]["version"] == "0.1.0"
      assert is_binary(body["data"]["server_url"])
      assert is_binary(body["data"]["project_name"])
    end

    test "returns error with wrong token" do
      conn =
        conn(:post, "/api/pair", Jason.encode!(%{"token" => "wrong-0000"}))
        |> Map.put(:remote_ip, {192, 168, 1, 100})
        |> put_req_header("content-type", "application/json")
        |> call()

      assert conn.status == 401
      body = json_body(conn)
      assert body["ok"] == false
      assert body["error"] == "invalid_token"
    end

    test "pairing endpoint is accessible without auth from remote IP" do
      # POST /api/pair should not require auth itself
      conn =
        conn(:post, "/api/pair", Jason.encode!(%{"token" => "test-0000"}))
        |> Map.put(:remote_ip, {192, 168, 1, 100})
        |> put_req_header("content-type", "application/json")
        |> call()

      # Should get pair handler response (401 invalid_token), NOT auth middleware 401
      body = json_body(conn)
      assert body["error"] == "invalid_token"
    end
  end
end

defmodule Bropilot.TraceabilityApiTest do
  use ExUnit.Case
  import Plug.Test
  import Plug.Conn

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
    tmp = System.tmp_dir!() |> Path.join("bropilot_trace_api_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)

    original_cwd = File.cwd!()
    File.cd!(tmp)

    {:ok, bropilot_dir} = Bropilot.init(tmp)
    map_dir = Path.join(bropilot_dir, "map")

    on_exit(fn ->
      File.cd!(original_cwd)
      File.rm_rf!(tmp)
    end)

    {:ok, project_dir: tmp, map_dir: map_dir, bropilot_dir: bropilot_dir}
  end

  # ── GET /api/traceability ─────────────────────────────────────

  describe "GET /api/traceability" do
    test "returns empty matrix with coverage summary when no entries", %{map_dir: _map_dir} do
      conn =
        conn(:get, "/api/traceability")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert is_list(body["data"]["entries"])
      assert body["data"]["entries"] == []
      assert is_map(body["data"]["coverage"])
    end

    test "returns full matrix with entries (VAL-TAPI-001)", %{map_dir: map_dir} do
      # Seed 3 entries across different categories
      :ok = Traceability.write(map_dir, "api", "InitProject", [
        %{"type" => "implementation", "file_path" => "lib/init.ex"}
      ])
      :ok = Traceability.write(map_dir, "entities", "User", [
        %{"type" => "implementation", "file_path" => "lib/user.ex"},
        %{"type" => "test", "file_path" => "test/user_test.exs"}
      ])
      :ok = Traceability.write(map_dir, "behaviours", "Auth", [
        %{"type" => "implementation", "file_path" => "lib/auth.ex"}
      ])

      conn =
        conn(:get, "/api/traceability")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert length(body["data"]["entries"]) == 3

      # Check all entries present
      categories = Enum.map(body["data"]["entries"], & &1["spec_category"])
      assert "api" in categories
      assert "entities" in categories
      assert "behaviours" in categories
    end

    test "includes coverage summary (VAL-TAPI-005)", %{map_dir: map_dir} do
      :ok = Traceability.write(map_dir, "api", "InitProject", [
        %{"type" => "implementation", "file_path" => "lib/init.ex"}
      ])

      conn =
        conn(:get, "/api/traceability")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      coverage = body["data"]["coverage"]

      assert is_map(coverage)
      # Coverage should have per-category breakdowns
      assert is_map(coverage["by_category"])

      # The api category should show linked count
      api_cov = coverage["by_category"]["api"]
      assert is_map(api_cov)
      assert api_cov["linked"] >= 1
    end

    test "distinguishes link types in response (VAL-TAPI-006)", %{map_dir: map_dir} do
      :ok = Traceability.write(map_dir, "entities", "User", [
        %{"type" => "implementation", "file_path" => "lib/user.ex"},
        %{"type" => "test", "file_path" => "test/user_test.exs"},
        %{"type" => "type", "file_path" => "lib/types/user.ex"},
        %{"type" => "migration", "file_path" => "priv/migrations/001.sql"}
      ])

      conn =
        conn(:get, "/api/traceability")
        |> call()

      assert conn.status == 200
      body = json_body(conn)

      user_entry = Enum.find(body["data"]["entries"], &(&1["spec_id"] == "User"))
      assert user_entry != nil
      link_types = Enum.map(user_entry["links"], & &1["type"]) |> Enum.sort()
      assert link_types == ["implementation", "migration", "test", "type"]
    end
  end

  # ── GET /api/traceability/:category/:spec_id ──────────────────

  describe "GET /api/traceability/:category/:spec_id" do
    test "returns single entry (VAL-TAPI-002)", %{map_dir: map_dir} do
      :ok = Traceability.write(map_dir, "entities", "User", [
        %{"type" => "implementation", "file_path" => "lib/user.ex"}
      ])

      conn =
        conn(:get, "/api/traceability/entities/User")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true
      assert body["data"]["spec_category"] == "entities"
      assert body["data"]["spec_id"] == "User"
      assert length(body["data"]["links"]) == 1
      assert hd(body["data"]["links"])["file_path"] == "lib/user.ex"
    end

    test "returns 404 for non-existent spec (VAL-TAPI-002)" do
      conn =
        conn(:get, "/api/traceability/entities/NonExistent")
        |> call()

      assert conn.status == 404
      body = json_body(conn)
      assert body["ok"] == false
      assert is_binary(body["error"])
    end

    test "returns 400 for invalid category" do
      conn =
        conn(:get, "/api/traceability/bogus/Foo")
        |> call()

      assert conn.status == 400
      body = json_body(conn)
      assert body["ok"] == false
    end
  end

  # ── PUT /api/traceability/:category/:spec_id ──────────────────

  describe "PUT /api/traceability/:category/:spec_id" do
    test "creates new entry (VAL-TAPI-003)", %{map_dir: _map_dir} do
      payload = %{
        "links" => [
          %{"type" => "implementation", "file_path" => "lib/init.ex", "function_name" => "init/1"}
        ]
      }

      conn =
        conn(:put, "/api/traceability/api/InitProject", Jason.encode!(payload))
        |> put_req_header("content-type", "application/json")
        |> call()

      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true

      # Verify via GET
      get_conn =
        conn(:get, "/api/traceability/api/InitProject")
        |> call()

      assert get_conn.status == 200
      get_body = json_body(get_conn)
      assert length(get_body["data"]["links"]) == 1
      assert hd(get_body["data"]["links"])["function_name"] == "init/1"
    end

    test "replaces existing entry (VAL-TAPI-003)", %{map_dir: _map_dir} do
      # First PUT with one link
      payload1 = %{
        "links" => [
          %{"type" => "implementation", "file_path" => "lib/init.ex"}
        ]
      }

      conn(:put, "/api/traceability/api/InitProject", Jason.encode!(payload1))
      |> put_req_header("content-type", "application/json")
      |> call()

      # Second PUT with two links (should replace)
      payload2 = %{
        "links" => [
          %{"type" => "implementation", "file_path" => "lib/init_v2.ex"},
          %{"type" => "test", "file_path" => "test/init_test.exs"}
        ]
      }

      conn =
        conn(:put, "/api/traceability/api/InitProject", Jason.encode!(payload2))
        |> put_req_header("content-type", "application/json")
        |> call()

      assert conn.status == 200

      # Verify replacement
      get_conn =
        conn(:get, "/api/traceability/api/InitProject")
        |> call()

      get_body = json_body(get_conn)
      assert length(get_body["data"]["links"]) == 2
    end

    test "validates missing links field (VAL-TAPI-004)" do
      payload = %{}

      conn =
        conn(:put, "/api/traceability/api/Foo", Jason.encode!(payload))
        |> put_req_header("content-type", "application/json")
        |> call()

      assert conn.status == 422
      body = json_body(conn)
      assert body["ok"] == false
      assert is_binary(body["error"])
    end

    test "validates link missing type (VAL-TAPI-004)" do
      payload = %{
        "links" => [%{"file_path" => "lib/foo.ex"}]
      }

      conn =
        conn(:put, "/api/traceability/api/Foo", Jason.encode!(payload))
        |> put_req_header("content-type", "application/json")
        |> call()

      assert conn.status == 422
      body = json_body(conn)
      assert body["ok"] == false
    end

    test "validates link missing file_path (VAL-TAPI-004)" do
      payload = %{
        "links" => [%{"type" => "implementation"}]
      }

      conn =
        conn(:put, "/api/traceability/api/Foo", Jason.encode!(payload))
        |> put_req_header("content-type", "application/json")
        |> call()

      assert conn.status == 422
      body = json_body(conn)
      assert body["ok"] == false
    end

    test "validates invalid link type (VAL-TRACE-004)" do
      payload = %{
        "links" => [%{"type" => "deployment", "file_path" => "lib/foo.ex"}]
      }

      conn =
        conn(:put, "/api/traceability/api/Foo", Jason.encode!(payload))
        |> put_req_header("content-type", "application/json")
        |> call()

      assert conn.status == 422
      body = json_body(conn)
      assert body["ok"] == false
    end

    test "rejects invalid category (VAL-TRACE-003)" do
      payload = %{
        "links" => [%{"type" => "implementation", "file_path" => "lib/foo.ex"}]
      }

      conn =
        conn(:put, "/api/traceability/bogus/Foo", Jason.encode!(payload))
        |> put_req_header("content-type", "application/json")
        |> call()

      assert conn.status in [400, 422]
      body = json_body(conn)
      assert body["ok"] == false
    end

    test "all 11 categories accepted via PUT (VAL-TRACE-003)" do
      for cat <- ~w(api behaviours constraints entities modules events externals views components streams infra) do
        payload = %{
          "links" => [%{"type" => "implementation", "file_path" => "lib/#{cat}/handler.ex"}]
        }

        conn =
          conn(:put, "/api/traceability/#{cat}/TestSpec", Jason.encode!(payload))
          |> put_req_header("content-type", "application/json")
          |> call()

        assert conn.status == 200, "Expected 200 for category #{cat}, got #{conn.status}"
      end
    end

    test "preserves optional fields through round-trip" do
      payload = %{
        "links" => [
          %{
            "type" => "implementation",
            "file_path" => "lib/foo.ex",
            "function_name" => "init/1",
            "line_range" => [10, 25]
          }
        ]
      }

      conn(:put, "/api/traceability/api/Foo", Jason.encode!(payload))
      |> put_req_header("content-type", "application/json")
      |> call()

      get_conn =
        conn(:get, "/api/traceability/api/Foo")
        |> call()

      body = json_body(get_conn)
      link = hd(body["data"]["links"])
      assert link["function_name"] == "init/1"
      assert link["line_range"] == [10, 25]
    end
  end

  # ── Project scoping (VAL-TAPI-007) ────────────────────────────

  describe "project scoping" do
    test "separate projects have separate traceability" do
      # Current project (from setup) already has a .bropilot
      # Put traceability in project A (current cwd)
      payload = %{
        "links" => [%{"type" => "implementation", "file_path" => "lib/a.ex"}]
      }

      conn(:put, "/api/traceability/api/ProjectASpec", Jason.encode!(payload))
      |> put_req_header("content-type", "application/json")
      |> call()

      # Verify project A has the entry
      conn_a =
        conn(:get, "/api/traceability")
        |> call()

      body_a = json_body(conn_a)
      assert length(body_a["data"]["entries"]) >= 1

      # Now switch to project B
      original_cwd = File.cwd!()
      tmp_b = System.tmp_dir!() |> Path.join("bropilot_trace_api_b_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp_b)
      File.cd!(tmp_b)
      {:ok, _} = Bropilot.init(tmp_b)

      conn_b =
        conn(:get, "/api/traceability")
        |> call()

      body_b = json_body(conn_b)
      assert body_b["data"]["entries"] == []

      # Cleanup: switch back
      File.cd!(original_cwd)
      File.rm_rf!(tmp_b)
    end
  end
end

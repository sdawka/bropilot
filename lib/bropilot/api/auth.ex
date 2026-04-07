defmodule Bropilot.Api.Auth do
  @moduledoc """
  Plug that enforces token-based authentication for non-localhost requests.

  Bypass rules (no token needed):
    - Requests from localhost (127.0.0.1, ::1)
    - `GET /api/health`
    - `POST /api/pair`
    - `OPTIONS` (CORS preflight)

  Remote clients supply the token via:
    - `Authorization: Bearer <token>` header, or
    - `?token=<token>` query parameter
  """

  import Plug.Conn

  @behaviour Plug

  # Paths that are always public (no auth)
  @public_paths [
    {"GET", "/api/health"},
    {"POST", "/api/pair"}
  ]

  @impl true
  def init(opts), do: opts

  @impl true
  def call(conn, _opts) do
    cond do
      # CORS preflight always passes
      conn.method == "OPTIONS" ->
        assign(conn, :authenticated, true)

      # Public endpoints skip auth
      public_path?(conn) ->
        assign(conn, :authenticated, true)

      # Localhost connections skip auth
      localhost?(conn) ->
        assign(conn, :authenticated, true)

      # Check token
      true ->
        case extract_token(conn) do
          {:ok, token} when is_binary(token) ->
            if Bropilot.Api.Session.valid_token?(token) do
              assign(conn, :authenticated, true)
            else
              reject(conn)
            end

          :error ->
            reject(conn)
        end
    end
  end

  # --- Private ---

  defp public_path?(conn) do
    Enum.any?(@public_paths, fn {method, path} ->
      conn.method == method and conn.request_path == path
    end)
  end

  defp localhost?(conn) do
    case conn.remote_ip do
      {127, 0, 0, 1} -> true
      {0, 0, 0, 0, 0, 0, 0, 1} -> true
      _ -> false
    end
  end

  defp extract_token(conn) do
    # 1. Try Authorization header
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] -> {:ok, String.trim(token)}
      _ ->
        # 2. Try query param
        conn = fetch_query_params(conn)

        case conn.query_params do
          %{"token" => token} -> {:ok, token}
          _ -> :error
        end
    end
  end

  defp reject(conn) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(
      401,
      Jason.encode!(%{
        ok: false,
        error: "unauthorized",
        message:
          "Include token as: Authorization: Bearer <token> or ?token=<token>"
      })
    )
    |> halt()
  end
end

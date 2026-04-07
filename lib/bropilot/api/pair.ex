defmodule Bropilot.Api.Handlers.Pair do
  @moduledoc """
  Handler for the POST /api/pair pairing endpoint.

  Accepts `{"token": "<token>"}` and, when valid, returns server info
  so the UI can confirm the connection before saving it.
  """

  import Bropilot.Api.Router, only: [json: 3]

  alias Bropilot.Api.Session

  def pair(conn) do
    token = conn.body_params["token"] || ""

    if Session.valid_token?(token) do
      port = Bropilot.Application.api_port()

      json(conn, 200, %{
        ok: true,
        data: %{
          server_url: "http://localhost:#{port}",
          project_name: project_name(),
          version: "0.1.0"
        }
      })
    else
      json(conn, 401, %{ok: false, error: "invalid_token"})
    end
  end

  defp project_name do
    File.cwd!() |> Path.basename()
  end
end

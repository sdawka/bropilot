defmodule Bropilot.Api.Endpoint do
  @moduledoc """
  Plug pipeline for the Bropilot HTTP API.
  Applies CORS headers, parses JSON, and routes to the router.
  """

  use Plug.Builder

  plug Corsica,
    origins: "*",
    allow_headers: ["content-type", "authorization"],
    allow_methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]

  plug Plug.Parsers,
    parsers: [:json],
    pass: ["application/json"],
    json_decoder: Jason

  plug Bropilot.Api.Auth

  plug Bropilot.Api.Router
end

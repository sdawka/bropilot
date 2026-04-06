defmodule Bropilot.Api.Router do
  @moduledoc """
  Main Plug router for the Bropilot HTTP API.
  Delegates to handler modules to keep routes thin.
  """

  use Plug.Router

  alias Bropilot.Api.Handlers.{Project, Pipeline, Vibe, Domain, Work, Knowledge, Traceability, Pair}

  plug :match
  plug :dispatch

  # Health check
  get "/api/health" do
    json(conn, 200, %{ok: true, data: %{status: "healthy"}})
  end

  # Pairing
  post "/api/pair" do
    Pair.pair(conn)
  end

  # Init
  post "/api/init" do
    Project.init_project(conn)
  end

  # Project
  get "/api/project" do
    Project.get_project(conn)
  end

  # Spaces
  get "/api/spaces" do
    Project.get_spaces(conn)
  end

  get "/api/spaces/:space" do
    Project.get_space(conn, space)
  end

  # Map
  get "/api/map/:space/:slot" do
    Project.get_slot(conn, space, slot)
  end

  put "/api/map/:space/:slot" do
    Project.put_slot(conn, space, slot)
  end

  # Recipe
  get "/api/recipe" do
    Project.get_recipe(conn)
  end

  get "/api/recipe/schemas" do
    Project.get_schemas(conn)
  end

  # Pipeline
  get "/api/pipeline/status" do
    Pipeline.get_status(conn)
  end

  post "/api/pipeline/advance" do
    Pipeline.advance(conn)
  end

  # Act 1 - Vibe
  post "/api/vibe/start" do
    Vibe.start(conn)
  end

  post "/api/vibe/input" do
    Vibe.input(conn)
  end

  post "/api/vibe/extract" do
    Vibe.extract(conn)
  end

  # Act 2 - Domain
  post "/api/domain/start" do
    Domain.start(conn)
  end

  post "/api/domain/input" do
    Domain.input(conn)
  end

  post "/api/domain/extract" do
    Domain.extract(conn)
  end

  # Act 3 - Work
  post "/api/snapshot" do
    Work.snapshot(conn)
  end

  post "/api/plan" do
    Work.plan(conn)
  end

  post "/api/tasks" do
    Work.tasks(conn)
  end

  post "/api/build" do
    Work.build(conn)
  end

  # Versions
  get "/api/versions" do
    Work.list_versions(conn)
  end

  get "/api/versions/:v" do
    Work.get_version(conn, v)
  end

  # Knowledge
  get "/api/knowledge" do
    Knowledge.get_knowledge(conn)
  end

  # Traceability
  get "/api/traceability" do
    Traceability.get_matrix(conn)
  end

  get "/api/traceability/:category/:spec_id" do
    Traceability.get_entry(conn, category, spec_id)
  end

  put "/api/traceability/:category/:spec_id" do
    Traceability.put_entry(conn, category, spec_id)
  end

  # Catch-all
  match _ do
    json(conn, 404, %{ok: false, error: "not found"})
  end

  @doc false
  def json(conn, status, body) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(status, Jason.encode!(body))
  end
end

defmodule Bropilot.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    # Apply BROPILOT_BACKEND config (local|cloud) — sets storage and state backends.
    # Raises ArgumentError for invalid values (e.g. "redis").
    Bropilot.Config.apply!()

    children =
      [
        {Bropilot.Recipe.Registry, []},
        {Bropilot.Traceability.Writer, []}
      ] ++ api_children()

    opts = [strategy: :one_for_one, name: Bropilot.Supervisor]
    Supervisor.start_link(children, opts)
  end

  defp api_children do
    if api_enabled?() do
      port = api_port()

      [
        {Bropilot.Api.Session, []},
        {Bandit, plug: Bropilot.Api.Endpoint, port: port},
        {Bropilot.Tunnel, [port: port]}
      ]
    else
      []
    end
  end

  @doc false
  def api_enabled? do
    case System.get_env("BROPILOT_API") do
      "false" -> false
      "0" -> false
      _ -> Mix.env() != :test
    end
  rescue
    # Mix.env() raises if Mix is not loaded (e.g. in releases)
    _ -> System.get_env("BROPILOT_API") != "false"
  end

  @doc false
  def api_port do
    case System.get_env("BROPILOT_API_PORT") do
      nil -> 4000
      port_str -> String.to_integer(port_str)
    end
  end
end

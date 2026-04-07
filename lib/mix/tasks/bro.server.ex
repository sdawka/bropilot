defmodule Mix.Tasks.Bro.Server do
  @shortdoc "Start the Bropilot API server"

  @moduledoc """
  Starts the Bropilot HTTP API server.

  The server exposes a JSON API for the Astro UI to communicate
  with the Elixir backend.

      $ mix bro.server
      $ BROPILOT_API_PORT=8080 mix bro.server

  ## Environment Variables

    - `BROPILOT_API_PORT` - Port to listen on (default: 4000)

  ## Available Endpoints

    GET  /api/health              Health check
    GET  /api/project             Project info + recipe
    GET  /api/spaces              All 5 space definitions
    GET  /api/spaces/:space       Space data with slot status
    GET  /api/map/:space/:slot    Read specific slot data
    PUT  /api/map/:space/:slot    Write slot data
    GET  /api/recipe              Recipe metadata + pipeline
    GET  /api/recipe/schemas      All schemas
    GET  /api/pipeline/status     Pipeline step statuses
    POST /api/pipeline/advance    Advance to next step
    POST /api/vibe/start          Start Act 1 (returns prompt)
    POST /api/vibe/input          Submit user input
    POST /api/vibe/extract        Run extraction
    POST /api/domain/start        Start Act 2
    POST /api/domain/extract      Run extraction
    POST /api/snapshot            Create snapshot
    POST /api/plan                Generate change plan
    POST /api/tasks               Generate tasks
    POST /api/build               Dispatch codegen tasks
    GET  /api/versions            List versions
    GET  /api/versions/:v         Version details
    GET  /api/knowledge           Glossary + decisions + changelog
  """

  use Mix.Task

  @impl Mix.Task
  def run(_args) do
    Mix.Task.run("app.start")

    port = Bropilot.Application.api_port()

    # Give the tunnel a moment to establish
    Process.sleep(2_000)

    token = Bropilot.Api.Session.get_token()
    tunnel_url = Bropilot.Tunnel.get_url()

    banner = build_banner(port, tunnel_url, token)
    Mix.shell().info(banner)

    # Block the task so the server stays running
    Process.sleep(:infinity)
  end

  # ── Banner helpers ──────────────────────────────────────────

  @box_width 50

  defp build_banner(port, tunnel_url, token) do
    bright = IO.ANSI.bright()
    cyan = IO.ANSI.cyan()
    reset = IO.ANSI.reset()
    faint = IO.ANSI.faint()
    yellow = IO.ANSI.yellow()
    green = IO.ANSI.green()

    lines =
      [
        "",
        "#{bright}#{cyan}┌#{String.duplicate("─", @box_width)}┐#{reset}",
        box_line("  #{bright}Bropilot Server#{reset}"),
        "#{bright}#{cyan}├#{String.duplicate("─", @box_width)}┤#{reset}",
        box_line("  #{bright}Local:#{reset}   http://localhost:#{port}"),
        box_line("  #{bright}#{yellow}Token:#{reset}   #{bright}#{green}#{token}#{reset}"),
        box_line(""),
        remote_lines(tunnel_url),
        qr_lines(tunnel_url, token),
        install_hint_lines(tunnel_url),
        box_line(""),
        box_line("  #{faint}Press Ctrl+C to stop#{reset}"),
        "#{bright}#{cyan}└#{String.duplicate("─", @box_width)}┘#{reset}",
        ""
      ]
      |> List.flatten()
      |> Enum.reject(&is_nil/1)

    Enum.join(lines, "\n")
  end

  defp remote_lines(nil), do: nil

  defp remote_lines(url) do
    bright = IO.ANSI.bright()
    reset = IO.ANSI.reset()
    [box_line("  #{bright}Remote:#{reset}  #{url}")]
  end

  defp qr_lines(nil, _token), do: nil

  defp qr_lines(tunnel_url, token) do
    qr_text =
      if token,
        do: "#{tunnel_url}?token=#{token}",
        else: tunnel_url

    case Bropilot.QR.generate(qr_text) do
      nil ->
        [box_line(""), box_line("  #{qr_text}")]

      qr_string ->
        qr =
          qr_string
          |> String.split("\n")
          |> Enum.map(fn line -> box_line("  " <> line) end)

        [box_line("") | qr] ++
          [box_line(""), box_line("  Scan QR or enter token in Bropilot UI")]
    end
  end

  defp install_hint_lines(nil) do
    faint = IO.ANSI.faint()
    reset = IO.ANSI.reset()

    [
      box_line("  #{faint}Install cloudflared for remote access:#{reset}"),
      box_line("  #{faint}brew install cloudflared#{reset}")
    ]
  end

  defp install_hint_lines(_url), do: nil

  defp box_line(text) do
    bright = IO.ANSI.bright()
    cyan = IO.ANSI.cyan()
    reset = IO.ANSI.reset()
    visible = String.replace(text, ~r/\e\[[0-9;]*m/, "")
    padding = max(@box_width - String.length(visible), 0)
    "#{bright}#{cyan}│#{reset}#{text}#{String.duplicate(" ", padding)}#{bright}#{cyan}│#{reset}"
  end
end

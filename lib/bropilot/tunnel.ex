defmodule Bropilot.Tunnel do
  @moduledoc """
  GenServer that manages a Cloudflare Quick Tunnel (`cloudflared`).

  Spawns `cloudflared tunnel --url http://localhost:<port>` as a Port,
  parses the generated tunnel URL from stderr, and exposes it via `get_url/0`.

  Gracefully degrades when `cloudflared` is not installed — `get_url/0`
  returns `nil` and `available?/0` returns `false`.
  """

  use GenServer
  require Logger

  @name __MODULE__

  # ── Public API ──────────────────────────────────────────────

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: @name)
  end

  @doc "Returns the tunnel URL or nil if not (yet) available."
  @spec get_url() :: String.t() | nil
  def get_url do
    GenServer.call(@name, :get_url)
  catch
    :exit, _ -> nil
  end

  @doc "Returns `true` when the `cloudflared` binary is on the PATH."
  @spec available?() :: boolean()
  def available? do
    System.find_executable("cloudflared") != nil
  end

  # ── GenServer callbacks ─────────────────────────────────────

  @impl true
  def init(opts) do
    port = Keyword.get(opts, :port, 4000)

    case System.find_executable("cloudflared") do
      nil ->
        Logger.info(
          "cloudflared not found — tunnel disabled. " <>
            "Install with: brew install cloudflared"
        )

        {:ok, %{port_ref: nil, url: nil, os_pid: nil, buffer: ""}}

      executable ->
        port_ref =
          Port.open({:spawn_executable, executable}, [
            :binary,
            :exit_status,
            :stderr_to_stdout,
            args: ["tunnel", "--url", "http://localhost:#{port}"]
          ])

        {:os_pid, os_pid} = Port.info(port_ref, :os_pid)

        Logger.info("cloudflared tunnel starting (pid #{os_pid})…")

        {:ok, %{port_ref: port_ref, url: nil, os_pid: os_pid, buffer: ""}}
    end
  end

  @impl true
  def handle_call(:get_url, _from, state) do
    {:reply, state.url, state}
  end

  @impl true
  def handle_info({port_ref, {:data, data}}, %{port_ref: port_ref} = state) do
    buffer = state.buffer <> data
    {lines, rest} = split_lines(buffer)

    url =
      Enum.reduce(lines, state.url, fn line, acc ->
        case parse_tunnel_url(line) do
          nil -> acc
          found -> found
        end
      end)

    if url != state.url and url != nil do
      Logger.info("Cloudflare tunnel ready: #{url}")
    end

    {:noreply, %{state | url: url, buffer: rest}}
  end

  @impl true
  def handle_info({port_ref, {:exit_status, status}}, %{port_ref: port_ref} = state) do
    Logger.warning("cloudflared exited with status #{status}")
    {:noreply, %{state | port_ref: nil, os_pid: nil}}
  end

  @impl true
  def handle_info(_msg, state) do
    {:noreply, state}
  end

  @impl true
  def terminate(_reason, %{port_ref: nil}), do: :ok

  def terminate(_reason, %{port_ref: port_ref, os_pid: os_pid}) do
    Port.close(port_ref)

    if os_pid do
      System.cmd("kill", [to_string(os_pid)])
    end

    :ok
  catch
    _, _ -> :ok
  end

  # ── Helpers ─────────────────────────────────────────────────

  @doc false
  def parse_tunnel_url(line) do
    case Regex.run(~r{(https://[a-zA-Z0-9\-]+\.trycloudflare\.com)}, line) do
      [_, url] -> url
      _ -> nil
    end
  end

  defp split_lines(buffer) do
    case String.split(buffer, "\n") do
      [single] -> {[], single}
      parts -> {Enum.slice(parts, 0..-2//1), List.last(parts)}
    end
  end
end

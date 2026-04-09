defmodule Bropilot.Pi.Port do
  @moduledoc """
  GenServer wrapper around an Erlang Port that manages a pi coding-agent process
  running in RPC mode. Handles stdin/stdout communication.
  """

  use GenServer

  alias Bropilot.Pi.Protocol

  defstruct [:port, :pending, :buffer]

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts)
  end

  def send_message(pid, method, params \\ %{}) do
    GenServer.call(pid, {:send, method, params}, :infinity)
  end

  def stop(pid) do
    GenServer.stop(pid)
  end

  @impl true
  def init(opts) do
    pi_cmd = Keyword.get(opts, :command, "npx")
    pi_args = Keyword.get(opts, :args, ["@mariozechner/pi-coding-agent", "--mode", "rpc"])

    port =
      Port.open({:spawn_executable, System.find_executable(pi_cmd)}, [
        :binary,
        :exit_status,
        :use_stdio,
        :stderr_to_stdout,
        args: pi_args
      ])

    {:ok, %__MODULE__{port: port, pending: %{}, buffer: ""}}
  end

  @impl true
  def handle_call({:send, method, params}, from, state) do
    id = System.unique_integer([:positive])
    msg = Protocol.encode_request(method, params, id)
    Port.command(state.port, msg)
    pending = Map.put(state.pending, id, from)
    {:noreply, %{state | pending: pending}}
  end

  @impl true
  def handle_info({port, {:data, data}}, %{port: port} = state) do
    buffer = state.buffer <> data
    {lines, rest} = split_lines(buffer)

    state =
      Enum.reduce(lines, %{state | buffer: rest}, fn line, acc ->
        case Protocol.decode_response(line) do
          {:ok, %{"id" => id} = msg} when is_map_key(acc.pending, id) ->
            {from, pending} = Map.pop(acc.pending, id)
            GenServer.reply(from, {:ok, msg})
            %{acc | pending: pending}

          _ ->
            acc
        end
      end)

    {:noreply, state}
  end

  @impl true
  def handle_info({port, {:exit_status, status}}, %{port: port} = state) do
    for {_id, from} <- state.pending do
      GenServer.reply(from, {:error, {:port_exit, status}})
    end

    {:stop, {:port_exit, status}, %{state | pending: %{}}}
  end

  @impl true
  def terminate(_reason, %{port: port}) do
    Port.close(port)
  catch
    _, _ -> :ok
  end

  defp split_lines(buffer) do
    case String.split(buffer, "\n") do
      [single] -> {[], single}
      parts -> {Enum.slice(parts, 0..-2//1), List.last(parts)}
    end
  end
end

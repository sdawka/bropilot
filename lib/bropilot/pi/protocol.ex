defmodule Bropilot.Pi.Protocol do
  @moduledoc """
  JSON-RPC message encoding/decoding for communicating with pi coding-agent
  in RPC mode via stdin/stdout.
  """

  def encode_request(method, params \\ %{}, id \\ nil) do
    msg = %{
      "jsonrpc" => "2.0",
      "method" => method,
      "params" => params
    }

    msg = if id, do: Map.put(msg, "id", id), else: msg
    Jason.encode!(msg) <> "\n"
  end

  def decode_response(line) do
    case Jason.decode(String.trim(line)) do
      {:ok, %{"jsonrpc" => "2.0"} = msg} -> {:ok, msg}
      {:ok, other} -> {:error, {:invalid_rpc, other}}
      error -> error
    end
  end
end

defmodule Bropilot.Codegen.PiBackend do
  @moduledoc """
  Pi agent pool execution backend for codegen.
  Delegates code generation to a pi coding-agent process via Pi.Pool/Port/Protocol.

  The Pi agent communicates via JSON-RPC over stdin/stdout and can execute
  file-writing tasks independently. This backend checks out an agent from
  Pi.Pool, sends the codegen prompt, parses the response, and writes files
  to the output directory.

  Falls back gracefully if Pi.Pool is not started (returns {:error, :pi_pool_unavailable}).
  """

  alias Bropilot.Pi.{Pool, Port}
  alias Bropilot.Codegen.Writer

  @doc """
  Execute a codegen task via the Pi agent pool.

  Checks out a Pi agent, sends the codegen prompt, parses the file blocks
  from the response, and writes them to `output_dir`.

  Returns `{:ok, %{files_written: paths, output_dir: dir}}` or `{:error, reason}`.
  """
  def execute(prompt, output_dir, opts \\ []) do
    with {:ok, agent_pid} <- checkout_agent(opts),
         {:ok, response} <- send_codegen_request(agent_pid, prompt),
         :ok <- checkin_agent(agent_pid) do
      # Parse the response content and write files
      content = extract_content(response)
      Writer.parse_and_write(content, output_dir)
    else
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Check if the Pi.Pool is available and started.
  """
  def available? do
    case Process.whereis(Pool) do
      nil -> false
      pid -> Process.alive?(pid)
    end
  end

  # -- Private --

  defp checkout_agent(opts) do
    if available?() do
      Pool.checkout(opts)
    else
      {:error, :pi_pool_unavailable}
    end
  end

  defp send_codegen_request(agent_pid, prompt) do
    Port.send_message(agent_pid, "generate", %{
      "prompt" => prompt,
      "mode" => "codegen"
    })
  rescue
    error -> {:error, {:pi_agent_error, Exception.message(error)}}
  catch
    :exit, reason -> {:error, {:pi_agent_exit, reason}}
  end

  defp checkin_agent(agent_pid) do
    Pool.checkin(agent_pid)
    :ok
  rescue
    _ -> :ok
  end

  defp extract_content(%{"result" => result}) when is_binary(result), do: result
  defp extract_content(%{"result" => %{"content" => content}}) when is_binary(content), do: content
  defp extract_content(%{"result" => result}) when is_map(result), do: inspect(result)
  defp extract_content(other) when is_binary(other), do: other
  defp extract_content(_), do: ""
end

defmodule Bropilot.LLM.Mock do
  @moduledoc """
  Mock LLM client for testing.
  Returns a static response by default, or delegates to a custom
  response function provided via opts[:response_fn].
  """

  @behaviour Bropilot.LLM.Client

  @impl true
  def chat(messages, opts \\ []) do
    case Keyword.get(opts, :response_fn) do
      nil -> {:ok, "mock response"}
      fun when is_function(fun, 2) -> fun.(messages, opts)
      fun when is_function(fun, 1) -> fun.(messages)
    end
  end
end

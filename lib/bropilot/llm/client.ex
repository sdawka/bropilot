defmodule Bropilot.LLM.Client do
  @moduledoc """
  Behaviour for LLM chat clients.
  All LLM providers (OpenAI, Anthropic, mock) implement this behaviour.
  """

  @callback chat(messages :: list(), opts :: keyword()) :: {:ok, String.t()} | {:error, term()}
end

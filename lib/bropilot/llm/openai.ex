defmodule Bropilot.LLM.OpenAI do
  @moduledoc """
  OpenAI-compatible chat client.
  Works with OpenAI, OpenRouter, and any API that follows the
  OpenAI chat completions format.
  """

  @behaviour Bropilot.LLM.Client

  @default_model "gpt-4o"
  @default_temperature 0.7
  @default_max_tokens 4096
  @default_base_url "https://api.openai.com/v1"

  @doc """
  Builds the request body for the chat completions endpoint.
  Exposed for testing without making real HTTP calls.
  """
  def build_request_body(messages, opts \\ []) do
    %{
      model: Keyword.get(opts, :model, @default_model),
      messages: messages,
      temperature: Keyword.get(opts, :temperature, @default_temperature),
      max_tokens: Keyword.get(opts, :max_tokens, @default_max_tokens)
    }
  end

  @doc """
  Builds the request headers for the chat completions endpoint.
  """
  def build_headers(api_key) do
    [
      {"content-type", "application/json"},
      {"authorization", "Bearer #{api_key}"}
    ]
  end

  @impl true
  def chat(messages, opts \\ []) do
    api_key = Keyword.get(opts, :api_key) || System.get_env("OPENAI_API_KEY")

    if is_nil(api_key) or api_key == "" do
      {:error, :missing_api_key}
    else
      base_url = Keyword.get(opts, :base_url, @default_base_url)
      url = "#{String.trim_trailing(base_url, "/")}/chat/completions"
      body = build_request_body(messages, opts)
      headers = build_headers(api_key)

      case do_request(url, body, headers) do
        {:ok, response} -> parse_response(response)
        {:error, reason} -> {:error, reason}
      end
    end
  end

  defp do_request(url, body, headers) do
    try do
      response = Req.post!(url, json: body, headers: headers)
      {:ok, response}
    rescue
      e -> {:error, {:request_failed, Exception.message(e)}}
    end
  end

  defp parse_response(%{status: 200, body: body}) do
    case body do
      %{"choices" => [%{"message" => %{"content" => content}} | _]} ->
        {:ok, content}

      _ ->
        {:error, {:unexpected_response, body}}
    end
  end

  defp parse_response(%{status: 401}) do
    {:error, :unauthorized}
  end

  defp parse_response(%{status: 429}) do
    {:error, :rate_limited}
  end

  defp parse_response(%{status: status, body: body}) do
    {:error, {:api_error, status, body}}
  end
end

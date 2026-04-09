defmodule Bropilot.LLM.OpenRouter do
  @moduledoc """
  OpenRouter LLM client.
  Thin wrapper around the OpenAI-compatible client that targets the
  OpenRouter API (https://openrouter.ai/api/v1) with provider-specific
  defaults and required headers.

  OpenRouter aggregates multiple LLM providers behind a single API,
  allowing model flexibility and BYOK (bring your own key) workflows.
  """

  @behaviour Bropilot.LLM.Client

  @default_model "anthropic/claude-sonnet-4-20250514"
  @default_temperature 0.7
  @default_max_tokens 4096
  @base_url "https://openrouter.ai/api/v1"
  @app_title "Bropilot"

  @doc """
  Returns the default base URL for the OpenRouter API.
  """
  def base_url, do: @base_url

  @doc """
  Returns the default model used by OpenRouter requests.
  """
  def default_model, do: @default_model

  @doc """
  Builds the request body for the OpenRouter chat completions endpoint.
  Uses OpenRouter defaults but allows overrides via opts.
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
  Builds the request headers for the OpenRouter API.
  Includes the standard Authorization header plus the OpenRouter-required
  HTTP-Referer and X-Title headers.
  """
  def build_headers(api_key) do
    [
      {"content-type", "application/json"},
      {"authorization", "Bearer #{api_key}"},
      {"http-referer", "https://github.com/bropilot/bropilot"},
      {"x-title", @app_title}
    ]
  end

  @impl true
  def chat(messages, opts \\ []) do
    api_key = Keyword.get(opts, :api_key) || System.get_env("OPENROUTER_API_KEY")

    if is_nil(api_key) or api_key == "" do
      {:error, :missing_api_key}
    else
      url = "#{@base_url}/chat/completions"
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

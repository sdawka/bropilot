defmodule Bropilot.LLM.Anthropic do
  @moduledoc """
  Anthropic Claude chat client.
  Handles the Anthropic messages API format, including
  separating system messages from user/assistant messages.
  """

  @behaviour Bropilot.LLM.Client

  @default_model "claude-sonnet-4-20250514"
  @default_temperature 0.7
  @default_max_tokens 4096
  @api_url "https://api.anthropic.com/v1/messages"
  @anthropic_version "2023-06-01"

  @doc """
  Builds the request body for the Anthropic messages endpoint.
  Separates system messages from the conversation messages.
  Exposed for testing without making real HTTP calls.
  """
  def build_request_body(messages, opts \\ []) do
    {system_messages, conversation} = separate_system_messages(messages)
    system_text = Enum.map_join(system_messages, "\n\n", & &1[:content])

    body = %{
      model: Keyword.get(opts, :model, @default_model),
      messages: conversation,
      max_tokens: Keyword.get(opts, :max_tokens, @default_max_tokens)
    }

    body =
      if system_text != "" do
        Map.put(body, :system, system_text)
      else
        body
      end

    Map.put(body, :temperature, Keyword.get(opts, :temperature, @default_temperature))
  end

  @doc """
  Builds the request headers for the Anthropic messages endpoint.
  """
  def build_headers(api_key) do
    [
      {"content-type", "application/json"},
      {"x-api-key", api_key},
      {"anthropic-version", @anthropic_version}
    ]
  end

  @doc """
  Separates system messages from user/assistant messages.
  Anthropic expects system as a top-level field, not in messages list.
  """
  def separate_system_messages(messages) do
    {system, rest} =
      Enum.split_with(messages, fn msg ->
        msg[:role] == "system" || msg["role"] == "system"
      end)

    conversation =
      Enum.map(rest, fn msg ->
        %{
          role: msg[:role] || msg["role"],
          content: msg[:content] || msg["content"]
        }
      end)

    {system, conversation}
  end

  @impl true
  def chat(messages, opts \\ []) do
    api_key = Keyword.get(opts, :api_key) || System.get_env("ANTHROPIC_API_KEY")

    if is_nil(api_key) or api_key == "" do
      {:error, :missing_api_key}
    else
      body = build_request_body(messages, opts)
      headers = build_headers(api_key)

      case do_request(@api_url, body, headers) do
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
      %{"content" => [%{"text" => text} | _]} ->
        {:ok, text}

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

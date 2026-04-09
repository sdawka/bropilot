defmodule Bropilot.LLM do
  @moduledoc """
  Facade module for LLM interactions.
  Routes to the appropriate provider (Anthropic, OpenAI, or mock)
  and provides high-level helpers like YAML extraction.
  """

  alias Bropilot.LLM.{Anthropic, OpenAI, OpenRouter, Mock}

  @doc """
  Send a chat request to the configured LLM provider.

  ## Options
    - `:provider` - Force a specific provider (:anthropic, :openai, :mock)
    - `:model` - Model name override
    - `:temperature` - Temperature override
    - `:max_tokens` - Max tokens override
    - `:api_key` - API key override
    - `:base_url` - Base URL override (OpenAI-compatible only)
    - `:response_fn` - Custom response function (mock only)
  """
  def chat(messages, opts \\ []) do
    {provider_name, opts} = resolve_provider(opts)
    client = client_module(provider_name)
    client.chat(messages, opts)
  end

  @doc """
  Send a prompt to the LLM with instructions to return YAML,
  then parse the response.

  Returns `{:ok, parsed_data}` or `{:error, reason}`.
  """
  def extract_yaml(prompt, opts \\ []) do
    messages = [
      %{
        role: "system",
        content:
          "You are a structured data extraction assistant. " <>
            "Respond ONLY with valid YAML. Do not include any explanation, " <>
            "markdown code fences, or other text outside the YAML."
      },
      %{role: "user", content: prompt}
    ]

    case chat(messages, opts) do
      {:ok, raw} ->
        raw
        |> strip_code_fences()
        |> Bropilot.Yaml.decode()

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Returns which provider is currently configured.
  Checks for API keys in order: Anthropic, OpenAI, then falls back to mock.
  """
  def provider do
    cond do
      has_env?("OPENROUTER_API_KEY") -> :openrouter
      has_env?("ANTHROPIC_API_KEY") -> :anthropic
      has_env?("OPENAI_API_KEY") -> :openai
      true -> :mock
    end
  end

  # -- Private --

  defp resolve_provider(opts) do
    case Keyword.pop(opts, :provider) do
      {nil, opts} -> {provider(), opts}
      {provider_name, opts} -> {provider_name, opts}
    end
  end

  defp client_module(:openrouter), do: OpenRouter
  defp client_module(:anthropic), do: Anthropic
  defp client_module(:openai), do: OpenAI
  defp client_module(:mock), do: Mock
  defp client_module(other), do: raise("Unknown LLM provider: #{inspect(other)}")

  defp has_env?(key) do
    case System.get_env(key) do
      nil -> false
      "" -> false
      _ -> true
    end
  end

  @doc false
  def strip_code_fences(text) do
    text
    |> String.trim()
    |> do_strip_fences()
  end

  defp do_strip_fences("```yaml\n" <> rest), do: strip_trailing_fence(rest)
  defp do_strip_fences("```yml\n" <> rest), do: strip_trailing_fence(rest)
  defp do_strip_fences("```YAML\n" <> rest), do: strip_trailing_fence(rest)
  defp do_strip_fences("```\n" <> rest), do: strip_trailing_fence(rest)
  defp do_strip_fences(text), do: text

  defp strip_trailing_fence(text) do
    text
    |> String.trim_trailing()
    |> String.trim_trailing("```")
    |> String.trim_trailing()
  end
end

defmodule Bropilot.LLM.OpenRouterTest do
  use ExUnit.Case

  alias Bropilot.LLM
  alias Bropilot.LLM.OpenRouter

  # ── Request building ─────────────────────────────────────────

  describe "build_request_body/2" do
    test "builds correct request body with OpenRouter defaults" do
      messages = [%{role: "user", content: "hello"}]
      body = OpenRouter.build_request_body(messages)

      assert body.model == "anthropic/claude-sonnet-4-20250514"
      assert body.messages == messages
      assert body.temperature == 0.7
      assert body.max_tokens == 4096
    end

    test "builds correct request body with custom opts" do
      messages = [%{role: "user", content: "hello"}]

      body =
        OpenRouter.build_request_body(messages,
          model: "openai/gpt-4o",
          temperature: 0.3,
          max_tokens: 2048
        )

      assert body.model == "openai/gpt-4o"
      assert body.messages == messages
      assert body.temperature == 0.3
      assert body.max_tokens == 2048
    end
  end

  # ── Base URL ─────────────────────────────────────────────────

  describe "base_url/0" do
    test "returns the correct OpenRouter API base URL" do
      assert OpenRouter.base_url() == "https://openrouter.ai/api/v1"
    end
  end

  # ── Headers ──────────────────────────────────────────────────

  describe "build_headers/1" do
    test "includes authorization header" do
      headers = OpenRouter.build_headers("sk-or-test-key")
      assert {"authorization", "Bearer sk-or-test-key"} in headers
    end

    test "includes content-type header" do
      headers = OpenRouter.build_headers("sk-or-test-key")
      assert {"content-type", "application/json"} in headers
    end

    test "includes required HTTP-Referer header" do
      headers = OpenRouter.build_headers("sk-or-test-key")
      assert Enum.any?(headers, fn {k, _v} -> k == "http-referer" end)
    end

    test "includes required X-Title header" do
      headers = OpenRouter.build_headers("sk-or-test-key")
      assert {"x-title", "Bropilot"} in headers
    end
  end

  # ── Missing API key ─────────────────────────────────────────

  describe "chat/2 without API key" do
    test "returns error when no API key is available" do
      original = System.get_env("OPENROUTER_API_KEY")
      System.delete_env("OPENROUTER_API_KEY")

      assert {:error, :missing_api_key} =
               OpenRouter.chat([%{role: "user", content: "hello"}])

      if original, do: System.put_env("OPENROUTER_API_KEY", original)
    end
  end

  # ── Provider detection ──────────────────────────────────────

  describe "provider detection" do
    test "returns :openrouter when OPENROUTER_API_KEY is set" do
      originals = save_env_keys()
      clear_all_keys()
      System.put_env("OPENROUTER_API_KEY", "sk-or-test-key")

      assert LLM.provider() == :openrouter

      restore_env_keys(originals)
    end

    test "OpenRouter takes priority over Anthropic and OpenAI" do
      originals = save_env_keys()
      clear_all_keys()
      System.put_env("OPENROUTER_API_KEY", "sk-or-test-key")
      System.put_env("ANTHROPIC_API_KEY", "sk-ant-test-key")
      System.put_env("OPENAI_API_KEY", "sk-oai-test-key")

      assert LLM.provider() == :openrouter

      restore_env_keys(originals)
    end

    test "falls back to Anthropic when only ANTHROPIC_API_KEY is set" do
      originals = save_env_keys()
      clear_all_keys()
      System.put_env("ANTHROPIC_API_KEY", "sk-ant-test-key")

      assert LLM.provider() == :anthropic

      restore_env_keys(originals)
    end

    test "falls back to OpenAI when only OPENAI_API_KEY is set" do
      originals = save_env_keys()
      clear_all_keys()
      System.put_env("OPENAI_API_KEY", "sk-oai-test-key")

      assert LLM.provider() == :openai

      restore_env_keys(originals)
    end

    test "falls back to mock when no API keys are set" do
      originals = save_env_keys()
      clear_all_keys()

      assert LLM.provider() == :mock

      restore_env_keys(originals)
    end
  end

  # ── Default model ───────────────────────────────────────────

  describe "default_model/0" do
    test "returns a coding-optimized model" do
      assert OpenRouter.default_model() == "anthropic/claude-sonnet-4-20250514"
    end
  end

  # ── Helpers ─────────────────────────────────────────────────

  defp save_env_keys do
    %{
      openrouter: System.get_env("OPENROUTER_API_KEY"),
      anthropic: System.get_env("ANTHROPIC_API_KEY"),
      openai: System.get_env("OPENAI_API_KEY")
    }
  end

  defp clear_all_keys do
    System.delete_env("OPENROUTER_API_KEY")
    System.delete_env("ANTHROPIC_API_KEY")
    System.delete_env("OPENAI_API_KEY")
  end

  defp restore_env_keys(originals) do
    restore_key("OPENROUTER_API_KEY", originals[:openrouter])
    restore_key("ANTHROPIC_API_KEY", originals[:anthropic])
    restore_key("OPENAI_API_KEY", originals[:openai])
  end

  defp restore_key(key, nil), do: System.delete_env(key)
  defp restore_key(key, value), do: System.put_env(key, value)
end

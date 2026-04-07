defmodule Bropilot.LLMTest do
  use ExUnit.Case

  alias Bropilot.LLM
  alias Bropilot.LLM.{Mock, OpenAI, Anthropic}

  # ── Mock Client ──────────────────────────────────────────────

  describe "Mock client" do
    test "returns default mock response" do
      assert {:ok, "mock response"} = Mock.chat([%{role: "user", content: "hello"}])
    end

    test "uses custom response_fn with arity 2" do
      response_fn = fn messages, _opts ->
        first = List.first(messages)
        {:ok, "echoed: #{first[:content]}"}
      end

      assert {:ok, "echoed: hi"} =
               Mock.chat([%{role: "user", content: "hi"}], response_fn: response_fn)
    end

    test "uses custom response_fn with arity 1" do
      response_fn = fn _messages -> {:ok, "custom"} end

      assert {:ok, "custom"} =
               Mock.chat([%{role: "user", content: "test"}], response_fn: response_fn)
    end
  end

  # ── Facade routing ───────────────────────────────────────────

  describe "LLM facade" do
    test "routes to mock when no API keys are set" do
      # Ensure API keys are not set for this test
      original_openrouter = System.get_env("OPENROUTER_API_KEY")
      original_anthropic = System.get_env("ANTHROPIC_API_KEY")
      original_openai = System.get_env("OPENAI_API_KEY")
      System.delete_env("OPENROUTER_API_KEY")
      System.delete_env("ANTHROPIC_API_KEY")
      System.delete_env("OPENAI_API_KEY")

      assert LLM.provider() == :mock
      assert {:ok, "mock response"} = LLM.chat([%{role: "user", content: "hello"}])

      # Restore env
      if original_openrouter, do: System.put_env("OPENROUTER_API_KEY", original_openrouter)
      if original_anthropic, do: System.put_env("ANTHROPIC_API_KEY", original_anthropic)
      if original_openai, do: System.put_env("OPENAI_API_KEY", original_openai)
    end

    test "routes to mock when provider is explicitly set" do
      assert {:ok, "mock response"} =
               LLM.chat([%{role: "user", content: "hello"}], provider: :mock)
    end

    test "provider returns :anthropic when ANTHROPIC_API_KEY is set" do
      original_openrouter = System.get_env("OPENROUTER_API_KEY")
      original = System.get_env("ANTHROPIC_API_KEY")
      System.delete_env("OPENROUTER_API_KEY")
      System.put_env("ANTHROPIC_API_KEY", "test-key")

      assert LLM.provider() == :anthropic

      if original do
        System.put_env("ANTHROPIC_API_KEY", original)
      else
        System.delete_env("ANTHROPIC_API_KEY")
      end

      if original_openrouter, do: System.put_env("OPENROUTER_API_KEY", original_openrouter)
    end

    test "provider returns :openai when only OPENAI_API_KEY is set" do
      original_openrouter = System.get_env("OPENROUTER_API_KEY")
      original_anthropic = System.get_env("ANTHROPIC_API_KEY")
      original_openai = System.get_env("OPENAI_API_KEY")
      System.delete_env("OPENROUTER_API_KEY")
      System.delete_env("ANTHROPIC_API_KEY")
      System.put_env("OPENAI_API_KEY", "test-key")

      assert LLM.provider() == :openai

      if original_openrouter, do: System.put_env("OPENROUTER_API_KEY", original_openrouter)
      if original_anthropic, do: System.put_env("ANTHROPIC_API_KEY", original_anthropic)

      if original_openai do
        System.put_env("OPENAI_API_KEY", original_openai)
      else
        System.delete_env("OPENAI_API_KEY")
      end
    end
  end

  # ── extract_yaml ─────────────────────────────────────────────

  describe "extract_yaml" do
    test "parses YAML from mock response" do
      yaml_response = "name: TestApp\npurpose: Testing"

      response_fn = fn _messages, _opts -> {:ok, yaml_response} end

      assert {:ok, %{"name" => "TestApp", "purpose" => "Testing"}} =
               LLM.extract_yaml("extract data", provider: :mock, response_fn: response_fn)
    end

    test "strips ```yaml code fences" do
      yaml_response = "```yaml\nname: TestApp\npurpose: Testing\n```"

      response_fn = fn _messages, _opts -> {:ok, yaml_response} end

      assert {:ok, %{"name" => "TestApp", "purpose" => "Testing"}} =
               LLM.extract_yaml("extract data", provider: :mock, response_fn: response_fn)
    end

    test "strips ``` code fences without language tag" do
      yaml_response = "```\nname: TestApp\n```"

      response_fn = fn _messages, _opts -> {:ok, yaml_response} end

      assert {:ok, %{"name" => "TestApp"}} =
               LLM.extract_yaml("extract data", provider: :mock, response_fn: response_fn)
    end

    test "returns error when LLM call fails" do
      response_fn = fn _messages, _opts -> {:error, :timeout} end

      assert {:error, :timeout} =
               LLM.extract_yaml("extract data", provider: :mock, response_fn: response_fn)
    end
  end

  # ── strip_code_fences ───────────────────────────────────────

  describe "strip_code_fences" do
    test "strips ```yaml fences" do
      assert LLM.strip_code_fences("```yaml\nfoo: bar\n```") == "foo: bar"
    end

    test "strips ```yml fences" do
      assert LLM.strip_code_fences("```yml\nfoo: bar\n```") == "foo: bar"
    end

    test "strips ``` fences without language" do
      assert LLM.strip_code_fences("```\nfoo: bar\n```") == "foo: bar"
    end

    test "leaves plain text unchanged" do
      assert LLM.strip_code_fences("foo: bar") == "foo: bar"
    end

    test "handles leading/trailing whitespace" do
      assert LLM.strip_code_fences("  ```yaml\nfoo: bar\n```  ") == "foo: bar"
    end
  end

  # ── OpenAI request building ─────────────────────────────────

  describe "OpenAI request building" do
    test "builds correct request body with defaults" do
      messages = [%{role: "user", content: "hello"}]
      body = OpenAI.build_request_body(messages)

      assert body.model == "gpt-4o"
      assert body.messages == messages
      assert body.temperature == 0.7
      assert body.max_tokens == 4096
    end

    test "builds correct request body with custom opts" do
      messages = [%{role: "system", content: "be helpful"}, %{role: "user", content: "hello"}]

      body =
        OpenAI.build_request_body(messages,
          model: "gpt-4o-mini",
          temperature: 0.3,
          max_tokens: 2048
        )

      assert body.model == "gpt-4o-mini"
      assert body.messages == messages
      assert body.temperature == 0.3
      assert body.max_tokens == 2048
    end

    test "builds correct headers" do
      headers = OpenAI.build_headers("sk-test-key")

      assert {"content-type", "application/json"} in headers
      assert {"authorization", "Bearer sk-test-key"} in headers
    end

    test "returns error when no API key is available" do
      original = System.get_env("OPENAI_API_KEY")
      System.delete_env("OPENAI_API_KEY")

      assert {:error, :missing_api_key} =
               OpenAI.chat([%{role: "user", content: "hello"}])

      if original, do: System.put_env("OPENAI_API_KEY", original)
    end
  end

  # ── Anthropic request building ──────────────────────────────

  describe "Anthropic request building" do
    test "builds correct request body with system message separated" do
      messages = [
        %{role: "system", content: "be helpful"},
        %{role: "user", content: "hello"}
      ]

      body = Anthropic.build_request_body(messages)

      assert body.model == "claude-sonnet-4-20250514"
      assert body.system == "be helpful"
      assert body.max_tokens == 4096
      assert length(body.messages) == 1
      assert hd(body.messages).role == "user"
      assert hd(body.messages).content == "hello"
    end

    test "builds body without system field when no system messages" do
      messages = [%{role: "user", content: "hello"}]
      body = Anthropic.build_request_body(messages)

      refute Map.has_key?(body, :system)
      assert length(body.messages) == 1
    end

    test "builds correct request body with custom opts" do
      messages = [%{role: "user", content: "hello"}]

      body =
        Anthropic.build_request_body(messages,
          model: "claude-haiku-4-20250514",
          temperature: 0.5,
          max_tokens: 1024
        )

      assert body.model == "claude-haiku-4-20250514"
      assert body.temperature == 0.5
      assert body.max_tokens == 1024
    end

    test "builds correct headers with anthropic-version" do
      headers = Anthropic.build_headers("sk-ant-test-key")

      assert {"content-type", "application/json"} in headers
      assert {"x-api-key", "sk-ant-test-key"} in headers
      assert {"anthropic-version", "2023-06-01"} in headers
    end

    test "separates multiple system messages" do
      messages = [
        %{role: "system", content: "rule 1"},
        %{role: "system", content: "rule 2"},
        %{role: "user", content: "hello"}
      ]

      body = Anthropic.build_request_body(messages)
      assert body.system == "rule 1\n\nrule 2"
      assert length(body.messages) == 1
    end

    test "returns error when no API key is available" do
      original = System.get_env("ANTHROPIC_API_KEY")
      System.delete_env("ANTHROPIC_API_KEY")

      assert {:error, :missing_api_key} =
               Anthropic.chat([%{role: "user", content: "hello"}])

      if original, do: System.put_env("ANTHROPIC_API_KEY", original)
    end
  end
end

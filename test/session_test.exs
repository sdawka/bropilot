defmodule Bropilot.Api.SessionTest do
  use ExUnit.Case

  alias Bropilot.Api.Session

  setup_all do
    case Process.whereis(Session) do
      nil -> start_supervised!(Session)
      _pid -> :ok
    end

    :ok
  end

  describe "generate_token/0" do
    test "returns a word-digits token matching expected format" do
      token = Session.generate_token()
      assert token =~ ~r/^[a-z]+-\d{4}$/
    end

    test "generates different tokens on successive calls" do
      tokens = for _ <- 1..20, do: Session.generate_token()
      # With 37 words × 9000 digits the collision chance is negligible
      assert length(Enum.uniq(tokens)) > 1
    end
  end

  describe "get_token/0" do
    test "returns the same token on multiple calls" do
      token1 = Session.get_token()
      token2 = Session.get_token()
      assert token1 == token2
    end

    test "token matches expected format" do
      assert Session.get_token() =~ ~r/^[a-z]+-\d{4}$/
    end
  end

  describe "valid_token?/1" do
    test "returns true for the current session token" do
      token = Session.get_token()
      assert Session.valid_token?(token) == true
    end

    test "returns false for a wrong token" do
      assert Session.valid_token?("wrong-0000") == false
    end

    test "returns false for nil" do
      assert Session.valid_token?(nil) == false
    end

    test "returns false for empty string" do
      assert Session.valid_token?("") == false
    end
  end
end

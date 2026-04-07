defmodule Bropilot.Api.Session do
  @moduledoc """
  Manages a session token for API authentication.

  Generates a human-readable token (e.g. "tiger-4829") on startup.
  Localhost connections bypass auth; remote connections must present the token.
  """

  use Agent

  @words ~w(
    tiger falcon otter panda whale cobra eagle raven shark lynx
    wolf bison crane gecko heron lemur manta orca robin viper
    cedar maple aspen birch coral ember flint ivory jade onyx
    pearl amber drift frost blaze ridge storm
  )

  @doc "Starts the session agent with a freshly generated token."
  def start_link(_opts) do
    Agent.start_link(fn -> generate_token() end, name: __MODULE__)
  end

  @doc "Generates a human-readable token like `falcon-3817`."
  def generate_token do
    word = Enum.random(@words)
    digits = :rand.uniform(9000) + 999
    "#{word}-#{digits}"
  end

  @doc "Returns the current session token."
  def get_token do
    Agent.get(__MODULE__, & &1)
  end

  @doc "Returns `true` when `candidate` matches the session token (constant-time)."
  def valid_token?(candidate) when is_binary(candidate) do
    Plug.Crypto.secure_compare(candidate, get_token())
  end

  def valid_token?(_), do: false
end

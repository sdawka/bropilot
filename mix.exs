defmodule Bropilot.MixProject do
  use Mix.Project

  def project do
    [
      app: :bropilot,
      version: "0.1.0",
      elixir: "~> 1.19",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  # Run "mix help compile.app" to learn about applications.
  def application do
    [
      extra_applications: [:logger],
      mod: {Bropilot.Application, []}
    ]
  end

  # Run "mix help deps" to learn about dependencies.
  defp deps do
    [
      {:yaml_elixir, "~> 2.11"},
      {:jason, "~> 1.4"},
      {:req, "~> 0.5"},
      {:bandit, "~> 1.6"},
      {:plug, "~> 1.16"},
      {:corsica, "~> 2.1"}
    ]
  end
end

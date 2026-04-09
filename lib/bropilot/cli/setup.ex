defmodule Bropilot.CLI.Setup do
  @moduledoc """
  First-run setup helper. Checks environment configuration
  and provides a getting-started guide.
  """

  alias Bropilot.CLI.Helpers

  @doc """
  Returns a list of environment status items.
  Each item is a map with `:name`, `:status` (:ok | :warning | :missing), and `:detail`.
  """
  def check_environment do
    [
      check_elixir(),
      check_llm(),
      check_node(),
      check_git()
    ]
  end

  @doc """
  Prints the environment status as a formatted table.
  """
  def print_environment_status do
    statuses = check_environment()

    Helpers.print_header("Environment")

    for status <- statuses do
      case status.status do
        :ok -> Helpers.print_success("#{status.name}: #{status.detail}")
        :warning -> Helpers.print_warning("#{status.name}: #{status.detail}")
        :missing -> Helpers.print_error("#{status.name}: #{status.detail}")
      end
    end
  end

  @doc """
  Prints a friendly getting-started guide.
  """
  def print_setup_guide do
    Mix.shell().info("""

    #{IO.ANSI.bright()}Getting Started with Bropilot#{IO.ANSI.reset()}

    1. #{IO.ANSI.cyan()}Initialize#{IO.ANSI.reset()} a new project:
       $ mix bro.init

    2. #{IO.ANSI.cyan()}Configure#{IO.ANSI.reset()} an LLM provider:
       $ export ANTHROPIC_API_KEY=sk-...
       #{IO.ANSI.faint()}or#{IO.ANSI.reset()}
       $ export OPENAI_API_KEY=sk-...

    3. #{IO.ANSI.cyan()}Vibe#{IO.ANSI.reset()} — collect project details:
       $ mix bro.vibe

    4. #{IO.ANSI.cyan()}Snapshot#{IO.ANSI.reset()} the current map state:
       $ mix bro.snapshot

    5. #{IO.ANSI.cyan()}Plan#{IO.ANSI.reset()} changes from the snapshot:
       $ mix bro.plan

    6. #{IO.ANSI.cyan()}Generate#{IO.ANSI.reset()} work tasks:
       $ mix bro.tasks

    7. #{IO.ANSI.cyan()}Build#{IO.ANSI.reset()} — dispatch and execute tasks:
       $ mix bro.build
    """)
  end

  # -- Private checks --

  defp check_elixir do
    version = System.version()

    %{
      name: "Elixir",
      status: :ok,
      detail: "v#{version}"
    }
  end

  defp check_llm do
    case Bropilot.LLM.provider() do
      :anthropic ->
        %{name: "LLM Provider", status: :ok, detail: "Anthropic (configured)"}

      :openai ->
        %{name: "LLM Provider", status: :ok, detail: "OpenAI (configured)"}

      :mock ->
        %{
          name: "LLM Provider",
          status: :warning,
          detail: "Not configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY"
        }
    end
  end

  defp check_node do
    case System.cmd("node", ["--version"], stderr_to_stdout: true) do
      {version, 0} ->
        %{name: "Node.js", status: :ok, detail: String.trim(version)}

      _ ->
        %{name: "Node.js", status: :warning, detail: "Not available (optional, for pi integration)"}
    end
  rescue
    ErlangError ->
      %{name: "Node.js", status: :warning, detail: "Not available (optional, for pi integration)"}
  end

  defp check_git do
    case System.cmd("git", ["--version"], stderr_to_stdout: true) do
      {version, 0} ->
        %{name: "Git", status: :ok, detail: String.trim(version)}

      _ ->
        %{name: "Git", status: :missing, detail: "Not available"}
    end
  rescue
    ErlangError ->
      %{name: "Git", status: :missing, detail: "Not available"}
  end
end

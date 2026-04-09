defmodule Bropilot.CLI.Helpers do
  @moduledoc """
  Shared CLI utilities for styled output, progress indicators,
  and pre-flight checks across all Mix tasks.
  """

  @doc """
  Prints a styled header with box drawing characters.

  ## Example

      print_header("Project Status")
      # ╔══════════════════╗
      # ║  Project Status  ║
      # ╚══════════════════╝
  """
  def print_header(title) do
    padded = "  #{title}  "
    width = String.length(padded)
    bar = String.duplicate(horizontal_char(), width)

    Mix.shell().info([
      "\n",
      IO.ANSI.bright(),
      corner_tl(),
      bar,
      corner_tr(),
      "\n",
      vertical_char(),
      padded,
      vertical_char(),
      "\n",
      corner_bl(),
      bar,
      corner_br(),
      IO.ANSI.reset()
    ])
  end

  @doc "Prints a green checkmark + message."
  def print_success(msg) do
    Mix.shell().info([IO.ANSI.green(), "✓ ", IO.ANSI.reset(), msg])
  end

  @doc "Prints a red X + message."
  def print_error(msg) do
    Mix.shell().info([IO.ANSI.red(), "✗ ", IO.ANSI.reset(), msg])
  end

  @doc "Prints a yellow warning + message."
  def print_warning(msg) do
    Mix.shell().info([IO.ANSI.yellow(), "⚠ ", IO.ANSI.reset(), msg])
  end

  @doc "Prints a blue info + message."
  def print_info(msg) do
    Mix.shell().info([IO.ANSI.cyan(), "ℹ ", IO.ANSI.reset(), msg])
  end

  @doc """
  Prints a progress bar using Unicode block characters.
  Falls back to ASCII when Unicode is not supported.

  ## Example

      print_progress(3, 8, "Building specs")
      # ████░░░░ 3/8 Building specs
  """
  def print_progress(current, total, label \\ "") do
    bar_width = 20
    filled = if total > 0, do: round(current / total * bar_width), else: 0
    filled = min(filled, bar_width)
    empty = bar_width - filled

    {fill_char, empty_char} = progress_chars()

    bar = String.duplicate(fill_char, filled) <> String.duplicate(empty_char, empty)
    counter = " #{current}/#{total}"
    suffix = if label != "", do: " #{label}", else: ""

    Mix.shell().info([
      IO.ANSI.bright(),
      bar,
      IO.ANSI.reset(),
      counter,
      suffix
    ])
  end

  @doc """
  Prints a simple aligned table.

  ## Example

      print_table(["Name", "Status"], [["problem", "filled"], ["solution", "empty"]])
  """
  def print_table(headers, rows) do
    all_rows = [headers | rows]

    col_widths =
      all_rows
      |> Enum.reduce(List.duplicate(0, length(headers)), fn row, widths ->
        row
        |> Enum.zip(widths)
        |> Enum.map(fn {cell, width} -> max(String.length(to_string(cell)), width) end)
      end)

    format_row = fn row ->
      row
      |> Enum.zip(col_widths)
      |> Enum.map(fn {cell, width} -> String.pad_trailing(to_string(cell), width) end)
      |> Enum.join("  ")
    end

    # Header
    Mix.shell().info([IO.ANSI.bright(), "  ", format_row.(headers), IO.ANSI.reset()])

    # Separator
    sep =
      col_widths
      |> Enum.map(&String.duplicate("─", &1))
      |> Enum.join("──")

    Mix.shell().info(["  ", sep])

    # Rows
    for row <- rows do
      Mix.shell().info(["  ", format_row.(row)])
    end
  end

  @doc """
  Checks that .bropilot/ directory exists at the given path.
  Raises `Mix.Error` with a helpful message if not found.
  """
  def ensure_project!(path \\ ".") do
    bropilot_dir = Path.join(Path.expand(path), ".bropilot")

    unless File.dir?(bropilot_dir) do
      Mix.raise("""
      No .bropilot/ directory found at #{Path.expand(path)}.

      Run `mix bro.init` to initialize a new project.
      """)
    end

    bropilot_dir
  end

  @doc """
  Checks that an LLM provider is configured via environment variables.
  Raises `Mix.Error` with setup instructions if no provider is found.
  """
  def ensure_llm!() do
    case Bropilot.LLM.provider() do
      :mock ->
        Mix.raise("""
        No LLM provider configured. Set one of:
          export OPENROUTER_API_KEY=sk-or-...   (recommended)
          export ANTHROPIC_API_KEY=sk-ant-...
          export OPENAI_API_KEY=sk-...
        """)

      provider ->
        provider
    end
  end

  @doc """
  Returns whether an LLM provider is configured (does not raise).
  """
  def llm_configured?() do
    Bropilot.LLM.provider() != :mock
  end

  @doc """
  Prompts the user for a Y/N confirmation.
  Returns `true` for yes, `false` for no.
  """
  def confirm(prompt) do
    answer =
      IO.gets("#{IO.ANSI.bright()}#{prompt} [Y/n] #{IO.ANSI.reset()}")
      |> String.trim()
      |> String.downcase()

    answer in ["", "y", "yes"]
  end

  # -- Private: Unicode / ASCII fallback --

  defp unicode_supported? do
    case System.get_env("LANG") do
      nil -> false
      lang -> String.contains?(lang, "UTF")
    end
  end

  defp horizontal_char, do: if(unicode_supported?(), do: "═", else: "=")
  defp vertical_char, do: if(unicode_supported?(), do: "║", else: "|")
  defp corner_tl, do: if(unicode_supported?(), do: "╔", else: "+")
  defp corner_tr, do: if(unicode_supported?(), do: "╗", else: "+")
  defp corner_bl, do: if(unicode_supported?(), do: "╚", else: "+")
  defp corner_br, do: if(unicode_supported?(), do: "╝", else: "+")

  defp progress_chars do
    if unicode_supported?() do
      {"█", "░"}
    else
      {"#", "-"}
    end
  end
end

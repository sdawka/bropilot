defmodule Mix.Tasks.Bro.Init do
  @shortdoc "Initialize a new bropilot project"

  @moduledoc """
  Initializes a new bropilot project at the given path.

  Creates the `.bropilot/` directory with spaces.lock, default recipe, and empty map.

      $ mix bro.init [path]

  If no path is given, defaults to the current directory.
  """

  use Mix.Task

  alias Bropilot.CLI.Helpers

  @impl Mix.Task
  def run(args) do
    Mix.Task.run("app.start")

    path = List.first(args) || "."
    path = Path.expand(path)
    bropilot_dir = Path.join(path, ".bropilot")

    if File.dir?(bropilot_dir) do
      Helpers.print_warning("Project already initialized at #{path}")

      if Helpers.confirm("Reinitialize? This will overwrite existing configuration.") do
        do_init(path)
      else
        Helpers.print_info("Aborted. Existing project unchanged.")
      end
    else
      do_init(path)
    end
  end

  defp do_init(path) do
    case Bropilot.init(path) do
      {:ok, bropilot_dir} ->
        Helpers.print_success("Initialized bropilot project at #{path}")
        print_spaces()
        print_recipe(bropilot_dir)

        unless Helpers.llm_configured?() do
          Mix.shell().info("")

          Helpers.print_warning(
            "No LLM provider configured. Set OPENROUTER_API_KEY (recommended), ANTHROPIC_API_KEY, or OPENAI_API_KEY for full functionality."
          )
        end

      {:error, reason} ->
        Helpers.print_error("Failed to initialize: #{inspect(reason)}")
        Mix.raise("Failed to initialize: #{inspect(reason)}")
    end
  end

  defp print_spaces do
    Mix.shell().info("\nSpaces:")

    for space <- Bropilot.Spaces.all() do
      Mix.shell().info("  #{IO.ANSI.cyan()}#{space.name}#{IO.ANSI.reset()} — #{space.governs}")
    end
  end

  defp print_recipe(bropilot_dir) do
    recipe_file = Path.join([bropilot_dir, "recipe", "recipe.yaml"])

    case Bropilot.Yaml.decode_file(recipe_file) do
      {:ok, meta} ->
        Mix.shell().info(
          "\nRecipe: #{IO.ANSI.bright()}#{meta["name"]}#{IO.ANSI.reset()} v#{meta["version"]}"
        )

      {:error, _} ->
        :ok
    end
  end
end

defmodule Mix.Tasks.Bro.Status do
  @shortdoc "Show bropilot project status"

  @moduledoc """
  Displays the current status of a bropilot project.

  Shows the recipe name/version, current pipeline step,
  and which space slots are filled or empty.

      $ mix bro.status
  """

  use Mix.Task

  alias Bropilot.CLI.{Helpers, Setup}

  @impl Mix.Task
  def run(_args) do
    Mix.Task.run("app.start")

    bropilot_dir = Path.join(File.cwd!(), ".bropilot")

    if File.dir?(bropilot_dir) do
      Helpers.print_header("Bropilot Status")
      print_llm_status()
      print_recipe(bropilot_dir)
      print_pipeline_step(bropilot_dir)
      print_space_status(bropilot_dir)
    else
      Helpers.print_warning("No .bropilot/ directory found.")
      Setup.print_environment_status()
      Setup.print_setup_guide()
    end
  end

  defp print_llm_status do
    case Bropilot.LLM.provider() do
      :anthropic ->
        Helpers.print_success("LLM Provider: Anthropic")

      :openai ->
        Helpers.print_success("LLM Provider: OpenAI")

      :mock ->
        Helpers.print_warning(
          "LLM Provider: Not configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)"
        )
    end

    Mix.shell().info("")
  end

  defp print_recipe(bropilot_dir) do
    recipe_file = Path.join([bropilot_dir, "recipe", "recipe.yaml"])

    case Bropilot.Yaml.decode_file(recipe_file) do
      {:ok, meta} ->
        Helpers.print_table(
          ["Property", "Value"],
          [
            ["Recipe", meta["name"] || "unknown"],
            ["Version", meta["version"] || "unknown"],
            ["Description", truncate(meta["description"] || "—", 60)]
          ]
        )

        Mix.shell().info("")

      {:error, _} ->
        Helpers.print_error("Recipe not found")
    end
  end

  defp print_pipeline_step(bropilot_dir) do
    recipe_dir = Path.join(bropilot_dir, "recipe")

    case Bropilot.Recipe.Registry.load(recipe_dir) do
      {:ok, recipe} ->
        Mix.shell().info(
          "#{IO.ANSI.bright()}Pipeline:#{IO.ANSI.reset()} #{length(recipe.steps)} steps across #{length(recipe.acts)} acts"
        )

        for act <- recipe.acts do
          Mix.shell().info(
            "  #{IO.ANSI.cyan()}#{act["name"]}#{IO.ANSI.reset()} (#{length(act["steps"])} steps)"
          )
        end

        Mix.shell().info("")

      {:error, _} ->
        Helpers.print_error("Could not load pipeline")
    end
  end

  defp print_space_status(bropilot_dir) do
    map_dir = Path.join(bropilot_dir, "map")

    Mix.shell().info("#{IO.ANSI.bright()}Spaces:#{IO.ANSI.reset()}")

    for space <- Bropilot.Spaces.all() do
      Mix.shell().info("  #{IO.ANSI.bright()}#{space.name}#{IO.ANSI.reset()}")

      for slot <- space.required_slots do
        filled = Bropilot.Storage.exists?(map_dir, space.id, slot.id)

        {icon, color} =
          if filled do
            {"●", IO.ANSI.green()}
          else
            {"○", IO.ANSI.red()}
          end

        status = if filled, do: "filled", else: "empty"

        Mix.shell().info(
          "    #{color}#{icon}#{IO.ANSI.reset()} #{slot.name} (#{status})"
        )
      end
    end
  end

  defp truncate(str, max_len) do
    str = String.trim(str)

    if String.length(str) > max_len do
      String.slice(str, 0, max_len) <> "..."
    else
      str
    end
  end
end

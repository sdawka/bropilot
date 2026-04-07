defmodule Mix.Tasks.Bro.Recipe do
  @shortdoc "Manage bropilot recipes"

  @moduledoc """
  Manage bropilot recipes: list, publish, install, and validate.

      $ mix bro.recipe list        # Lists installed recipe + available builtins
      $ mix bro.recipe publish     # Packages current project's recipe
      $ mix bro.recipe install <path_or_name>  # Installs a recipe
      $ mix bro.recipe validate    # Validates the current recipe
  """

  use Mix.Task

  alias Bropilot.Recipe.{Publisher, Installer}
  alias Bropilot.Yaml

  @impl Mix.Task
  def run(args) do
    Mix.Task.run("app.start")

    case args do
      ["list" | _] -> do_list()
      ["publish" | rest] -> do_publish(rest)
      ["install" | rest] -> do_install(rest)
      ["validate" | _] -> do_validate()
      _ -> print_usage()
    end
  end

  defp do_list do
    bropilot_dir = Path.join(File.cwd!(), ".bropilot")
    recipe_dir = Path.join(bropilot_dir, "recipe")

    Mix.shell().info("#{IO.ANSI.bright()}Installed Recipe:#{IO.ANSI.reset()}")

    if File.dir?(recipe_dir) do
      case Yaml.decode_file(Path.join(recipe_dir, "recipe.yaml")) do
        {:ok, meta} ->
          Mix.shell().info(
            "  #{IO.ANSI.green()}#{meta["name"]}#{IO.ANSI.reset()} v#{meta["version"]} — #{meta["description"] |> String.trim()}"
          )

        {:error, _} ->
          Mix.shell().info("  #{IO.ANSI.red()}(invalid recipe)#{IO.ANSI.reset()}")
      end
    else
      Mix.shell().info("  #{IO.ANSI.yellow()}(none)#{IO.ANSI.reset()}")
    end

    Mix.shell().info("\n#{IO.ANSI.bright()}Available Builtins:#{IO.ANSI.reset()}")

    case Installer.list_builtins() do
      [] ->
        Mix.shell().info("  #{IO.ANSI.yellow()}(none)#{IO.ANSI.reset()}")

      builtins ->
        for name <- builtins do
          Mix.shell().info("  #{IO.ANSI.cyan()}#{name}#{IO.ANSI.reset()}")
        end
    end
  end

  defp do_publish(args) do
    {opts, _, _} = OptionParser.parse(args, strict: [output: :string])
    output_dir = Keyword.get(opts, :output, ".")

    bropilot_dir = Path.join(File.cwd!(), ".bropilot")
    recipe_dir = Path.join(bropilot_dir, "recipe")

    unless File.dir?(recipe_dir) do
      Mix.raise("No recipe found at #{recipe_dir}. Run `mix bro.init` first.")
    end

    Mix.shell().info("Validating recipe...")

    case Publisher.package(recipe_dir, Path.expand(output_dir)) do
      {:ok, archive_path} ->
        Mix.shell().info(
          "#{IO.ANSI.green()}✓#{IO.ANSI.reset()} Recipe packaged: #{archive_path}"
        )

      {:error, reasons} when is_list(reasons) ->
        Mix.shell().error("#{IO.ANSI.red()}✗ Publish failed:#{IO.ANSI.reset()}")

        for reason <- reasons do
          Mix.shell().error("  - #{reason}")
        end

      {:error, reason} ->
        Mix.raise("Publish failed: #{inspect(reason)}")
    end
  end

  defp do_install(args) do
    case args do
      [] ->
        Mix.raise("Usage: mix bro.recipe install <path_or_name>")

      [source | _] ->
        project_path = File.cwd!()

        result =
          cond do
            String.ends_with?(source, ".tar.gz") and File.exists?(source) ->
              Mix.shell().info("Installing from archive: #{source}")
              Installer.install_from_archive(Path.expand(source), project_path)

            File.dir?(source) ->
              Mix.shell().info("Installing from directory: #{source}")
              Installer.install_from_dir(Path.expand(source), project_path)

            true ->
              Mix.shell().info("Installing builtin recipe: #{source}")
              Installer.install_builtin(source, project_path)
          end

        case result do
          {:ok, recipe_dir} ->
            Mix.shell().info(
              "#{IO.ANSI.green()}✓#{IO.ANSI.reset()} Recipe installed at #{recipe_dir}"
            )

          {:error, reason} ->
            Mix.raise("Install failed: #{inspect(reason)}")
        end
    end
  end

  defp do_validate do
    bropilot_dir = Path.join(File.cwd!(), ".bropilot")
    recipe_dir = Path.join(bropilot_dir, "recipe")

    unless File.dir?(recipe_dir) do
      Mix.raise("No recipe found at #{recipe_dir}. Run `mix bro.init` first.")
    end

    Mix.shell().info("Validating recipe at #{recipe_dir}...")

    case Publisher.validate_for_publish(recipe_dir) do
      :ok ->
        Mix.shell().info("#{IO.ANSI.green()}✓#{IO.ANSI.reset()} Recipe is valid")

      {:error, reasons} when is_list(reasons) ->
        Mix.shell().error("#{IO.ANSI.red()}✗ Validation failed:#{IO.ANSI.reset()}")

        for reason <- reasons do
          Mix.shell().error("  - #{reason}")
        end

      {:error, reason} ->
        Mix.raise("Validation failed: #{inspect(reason)}")
    end
  end

  defp print_usage do
    Mix.shell().info(@moduledoc)
  end
end

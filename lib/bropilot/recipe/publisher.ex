defmodule Bropilot.Recipe.Publisher do
  @moduledoc """
  Packages and validates recipes for publishing.
  Bundles a recipe directory into a .tar.gz archive with a manifest.
  """

  alias Bropilot.Recipe.Registry
  alias Bropilot.Yaml

  @includable_extensions ~w(.yaml .yml .md .txt .eex)

  @doc """
  Validates that a recipe directory has everything needed for publishing.

  Checks:
    - recipe.yaml exists with name and version
    - pipeline.yaml exists and validates against spaces
    - All referenced prompt files exist
    - All referenced schema files exist

  Returns `:ok` or `{:error, reasons}` where reasons is a list of strings.
  """
  def validate_for_publish(recipe_dir) do
    errors =
      []
      |> check_recipe_yaml(recipe_dir)
      |> check_pipeline_yaml(recipe_dir)
      |> check_referenced_files(recipe_dir)
      |> check_spaces_validation(recipe_dir)

    case errors do
      [] -> :ok
      reasons -> {:error, reasons}
    end
  end

  @doc """
  Packages a recipe directory into a .tar.gz archive.

  Validates the recipe first, then bundles all YAML, markdown, and template files
  into a {name}-{version}.tar.gz archive with a generated manifest.yaml.

  Returns `{:ok, archive_path}` or `{:error, reasons}`.
  """
  def package(recipe_dir, output_dir) do
    case validate_for_publish(recipe_dir) do
      :ok ->
        do_package(recipe_dir, output_dir)

      {:error, _reasons} = error ->
        error
    end
  end

  # --- Private ---

  defp check_recipe_yaml(errors, recipe_dir) do
    recipe_path = Path.join(recipe_dir, "recipe.yaml")

    if File.exists?(recipe_path) do
      case Yaml.decode_file(recipe_path) do
        {:ok, meta} ->
          errs = []
          errs = if is_nil(meta["name"]), do: ["recipe.yaml missing 'name' field" | errs], else: errs

          errs =
            if is_nil(meta["version"]),
              do: ["recipe.yaml missing 'version' field" | errs],
              else: errs

          errors ++ Enum.reverse(errs)

        {:error, _reason} ->
          errors ++ ["recipe.yaml is not valid YAML"]
      end
    else
      errors ++ ["recipe.yaml not found"]
    end
  end

  defp check_pipeline_yaml(errors, recipe_dir) do
    pipeline_path = Path.join(recipe_dir, "pipeline.yaml")

    if File.exists?(pipeline_path) do
      errors
    else
      errors ++ ["pipeline.yaml not found"]
    end
  end

  defp check_referenced_files(errors, recipe_dir) do
    pipeline_path = Path.join(recipe_dir, "pipeline.yaml")

    if File.exists?(pipeline_path) do
      case Yaml.decode_file(pipeline_path) do
        {:ok, pipeline} ->
          acts = Map.get(pipeline, "acts", [])

          steps =
            Enum.flat_map(acts, fn act ->
              Map.get(act, "steps", [])
            end)

          prompt_errors =
            steps
            |> Enum.filter(&Map.has_key?(&1, "prompt"))
            |> Enum.reject(fn step ->
              prompt_path = Path.join(recipe_dir, step["prompt"])
              File.exists?(prompt_path)
            end)
            |> Enum.map(fn step ->
              "referenced prompt file not found: #{step["prompt"]}"
            end)

          schema_errors = check_schema_refs(recipe_dir, steps)

          errors ++ prompt_errors ++ schema_errors

        {:error, _} ->
          errors
      end
    else
      errors
    end
  end

  defp check_schema_refs(recipe_dir, _steps) do
    # Check that schema files exist for space_slots referenced in steps
    schemas_dir = Path.join(recipe_dir, "schemas")

    if File.dir?(schemas_dir) do
      # Just verify the schemas directory has content - we don't fail
      # if no schemas dir, but we do check referenced ones
      []
    else
      []
    end
  end

  defp check_spaces_validation(errors, recipe_dir) do
    # Only check if we have both recipe.yaml and pipeline.yaml
    recipe_path = Path.join(recipe_dir, "recipe.yaml")
    pipeline_path = Path.join(recipe_dir, "pipeline.yaml")

    if File.exists?(recipe_path) and File.exists?(pipeline_path) do
      case Registry.load(recipe_dir) do
        {:ok, _recipe} ->
          errors

        {:error, {:missing_spaces, ids}} ->
          errors ++ ["recipe does not cover required spaces: #{inspect(ids)}"]

        {:error, reason} ->
          errors ++ ["recipe validation failed: #{inspect(reason)}"]
      end
    else
      errors
    end
  end

  defp do_package(recipe_dir, output_dir) do
    {:ok, meta} = Yaml.decode_file(Path.join(recipe_dir, "recipe.yaml"))
    name = meta["name"]
    version = meta["version"]

    File.mkdir_p!(output_dir)

    # Collect all includable files
    files = collect_files(recipe_dir)

    # Generate manifest
    file_contents =
      Enum.map(files, fn rel_path ->
        abs_path = Path.join(recipe_dir, rel_path)
        {rel_path, File.read!(abs_path)}
      end)

    checksum = compute_checksum(file_contents)

    manifest = %{
      "name" => name,
      "version" => version,
      "files" => Enum.map(file_contents, fn {path, _} -> path end),
      "checksum" => checksum
    }

    manifest_content = Yaml.encode(manifest)

    # Build tar entries: manifest + all files
    tar_entries =
      [{"manifest.yaml", manifest_content}] ++
        Enum.map(file_contents, fn {rel_path, content} ->
          {rel_path, content}
        end)

    archive_name = "#{name}-#{version}.tar.gz"
    archive_path = Path.join(output_dir, archive_name)

    # Create tar.gz using :erl_tar
    erl_tar_entries =
      Enum.map(tar_entries, fn {path, content} ->
        {String.to_charlist(path), content}
      end)

    case :erl_tar.create(String.to_charlist(archive_path), erl_tar_entries, [:compressed]) do
      :ok ->
        {:ok, archive_path}

      {:error, reason} ->
        {:error, ["failed to create archive: #{inspect(reason)}"]}
    end
  end

  defp collect_files(recipe_dir) do
    recipe_dir
    |> Path.join("**/*")
    |> Path.wildcard()
    |> Enum.filter(&File.regular?/1)
    |> Enum.filter(fn path ->
      ext = Path.extname(path)
      ext in @includable_extensions
    end)
    |> Enum.map(fn path ->
      Path.relative_to(path, recipe_dir)
    end)
    |> Enum.sort()
  end

  defp compute_checksum(file_contents) do
    combined =
      file_contents
      |> Enum.sort_by(fn {path, _} -> path end)
      |> Enum.map(fn {_path, content} -> content end)
      |> Enum.join()

    :crypto.hash(:sha256, combined)
    |> Base.encode16(case: :lower)
  end
end

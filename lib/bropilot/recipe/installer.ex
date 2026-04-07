defmodule Bropilot.Recipe.Installer do
  @moduledoc """
  Installs recipes from archives, directories, or built-in sources.
  Handles backup and rollback on validation failure.
  """

  alias Bropilot.Recipe.Registry

  @recipe_subdir "recipe"
  @backup_subdir "recipe.bak"

  @doc """
  Installs a recipe from a .tar.gz archive into the project's .bropilot/recipe/ directory.

  Backs up any existing recipe, extracts the archive, and validates.
  If validation fails, restores the backup.

  Returns `{:ok, recipe_dir}` or `{:error, reason}`.
  """
  def install_from_archive(archive_path, project_path) do
    bropilot_dir = Path.join(project_path, ".bropilot")
    recipe_dir = Path.join(bropilot_dir, @recipe_subdir)

    with :ok <- ensure_bropilot_dir(bropilot_dir),
         :ok <- backup_existing(bropilot_dir),
         :ok <- extract_archive(archive_path, recipe_dir),
         :ok <- validate_installed(recipe_dir) do
      remove_backup(bropilot_dir)
      {:ok, recipe_dir}
    else
      {:error, :validation_failed} = _error ->
        restore_backup(bropilot_dir)
        {:error, :validation_failed}

      {:error, reason} ->
        restore_backup(bropilot_dir)
        {:error, reason}
    end
  end

  @doc """
  Installs a recipe by copying a source directory into the project's .bropilot/recipe/.

  Backs up any existing recipe, copies the directory, and validates.
  If validation fails, restores the backup.

  Returns `{:ok, recipe_dir}` or `{:error, reason}`.
  """
  def install_from_dir(source_dir, project_path) do
    bropilot_dir = Path.join(project_path, ".bropilot")
    recipe_dir = Path.join(bropilot_dir, @recipe_subdir)

    with :ok <- ensure_bropilot_dir(bropilot_dir),
         true <- File.dir?(source_dir) || {:error, :source_not_found},
         :ok <- backup_existing(bropilot_dir),
         :ok <- do_copy_dir(source_dir, recipe_dir),
         :ok <- validate_installed(recipe_dir) do
      remove_backup(bropilot_dir)
      {:ok, recipe_dir}
    else
      {:error, :validation_failed} = _error ->
        restore_backup(bropilot_dir)
        {:error, :validation_failed}

      {:error, reason} ->
        restore_backup(bropilot_dir)
        {:error, reason}
    end
  end

  @doc """
  Installs a built-in recipe by name from priv/recipes/.

  Returns `{:ok, recipe_dir}` or `{:error, reason}`.
  """
  def install_builtin(name, project_path) do
    source = builtin_path(name)

    if File.dir?(source) do
      install_from_dir(source, project_path)
    else
      {:error, {:builtin_not_found, name}}
    end
  end

  @doc """
  Lists available built-in recipe names by scanning priv/recipes/.

  Returns a list of recipe name strings.
  """
  def list_builtins do
    recipes_dir = builtin_recipes_dir()

    if File.dir?(recipes_dir) do
      recipes_dir
      |> File.ls!()
      |> Enum.filter(fn entry ->
        File.dir?(Path.join(recipes_dir, entry))
      end)
      |> Enum.sort()
    else
      []
    end
  end

  # --- Private ---

  defp ensure_bropilot_dir(bropilot_dir) do
    File.mkdir_p(bropilot_dir)
  end

  defp backup_existing(bropilot_dir) do
    recipe_dir = Path.join(bropilot_dir, @recipe_subdir)
    backup_dir = Path.join(bropilot_dir, @backup_subdir)

    if File.dir?(recipe_dir) do
      File.rm_rf(backup_dir)
      File.rename(recipe_dir, backup_dir)
    else
      :ok
    end
  end

  defp restore_backup(bropilot_dir) do
    recipe_dir = Path.join(bropilot_dir, @recipe_subdir)
    backup_dir = Path.join(bropilot_dir, @backup_subdir)

    if File.dir?(backup_dir) do
      File.rm_rf(recipe_dir)
      File.rename(backup_dir, recipe_dir)
    end
  end

  defp remove_backup(bropilot_dir) do
    backup_dir = Path.join(bropilot_dir, @backup_subdir)
    File.rm_rf(backup_dir)
  end

  defp extract_archive(archive_path, recipe_dir) do
    File.mkdir_p!(recipe_dir)

    case :erl_tar.extract(String.to_charlist(archive_path), [
           :compressed,
           {:cwd, String.to_charlist(recipe_dir)}
         ]) do
      :ok -> :ok
      {:error, reason} -> {:error, {:extract_failed, reason}}
    end
  end

  defp do_copy_dir(source_dir, dest_dir) do
    File.rm_rf(dest_dir)

    case File.cp_r(source_dir, dest_dir) do
      {:ok, _} -> :ok
      {:error, reason, _} -> {:error, {:copy_failed, reason}}
    end
  end

  defp validate_installed(recipe_dir) do
    case Registry.load(recipe_dir) do
      {:ok, _recipe} -> :ok
      {:error, _reason} -> {:error, :validation_failed}
    end
  end

  defp builtin_path(name) do
    Path.join(builtin_recipes_dir(), name)
  end

  defp builtin_recipes_dir do
    Application.app_dir(:bropilot, "priv")
    |> Path.join("recipes")
  end
end

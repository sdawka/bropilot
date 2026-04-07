defmodule Bropilot.Recipe.InstallerTest do
  use ExUnit.Case

  alias Bropilot.Recipe.{Installer, Publisher}

  @webapp_recipe_dir Path.join([__DIR__, "..", "priv", "recipes", "webapp"]) |> Path.expand()

  setup do
    tmp = System.tmp_dir!() |> Path.join("bropilot_installer_test_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)
    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, tmp_dir: tmp}
  end

  describe "install_from_dir/2" do
    test "copies recipe and validates", %{tmp_dir: tmp} do
      project_path = Path.join(tmp, "project")
      File.mkdir_p!(project_path)

      assert {:ok, recipe_dir} = Installer.install_from_dir(@webapp_recipe_dir, project_path)
      assert File.dir?(recipe_dir)
      assert File.exists?(Path.join(recipe_dir, "recipe.yaml"))
      assert File.exists?(Path.join(recipe_dir, "pipeline.yaml"))
    end

    test "backs up existing recipe", %{tmp_dir: tmp} do
      project_path = Path.join(tmp, "project")
      bropilot_dir = Path.join(project_path, ".bropilot")
      old_recipe_dir = Path.join(bropilot_dir, "recipe")
      File.mkdir_p!(old_recipe_dir)
      File.write!(Path.join(old_recipe_dir, "old_marker.txt"), "old")

      assert {:ok, recipe_dir} = Installer.install_from_dir(@webapp_recipe_dir, project_path)
      assert File.dir?(recipe_dir)
      assert File.exists?(Path.join(recipe_dir, "recipe.yaml"))

      # Backup should be cleaned up after successful install
      refute File.dir?(Path.join(bropilot_dir, "recipe.bak"))
    end

    test "restores backup on validation failure", %{tmp_dir: tmp} do
      project_path = Path.join(tmp, "project")
      bropilot_dir = Path.join(project_path, ".bropilot")
      old_recipe_dir = Path.join(bropilot_dir, "recipe")
      File.mkdir_p!(old_recipe_dir)

      # Create a valid existing recipe so backup has content
      File.cp_r!(@webapp_recipe_dir, old_recipe_dir)

      # Create an invalid recipe source
      invalid_dir = Path.join(tmp, "invalid_recipe")
      File.mkdir_p!(invalid_dir)
      File.write!(Path.join(invalid_dir, "recipe.yaml"), "name: invalid\nversion: \"0.0.1\"\n")
      File.write!(Path.join(invalid_dir, "pipeline.yaml"), "acts: []")

      assert {:error, :validation_failed} =
               Installer.install_from_dir(invalid_dir, project_path)

      # The original recipe should be restored
      assert File.dir?(old_recipe_dir)
      assert File.exists?(Path.join(old_recipe_dir, "recipe.yaml"))

      {:ok, meta} = Bropilot.Yaml.decode_file(Path.join(old_recipe_dir, "recipe.yaml"))
      assert meta["name"] == "webapp"
    end

    test "fails for nonexistent source directory", %{tmp_dir: tmp} do
      project_path = Path.join(tmp, "project")
      File.mkdir_p!(project_path)

      assert {:error, :source_not_found} =
               Installer.install_from_dir(Path.join(tmp, "nonexistent"), project_path)
    end
  end

  describe "install_from_archive/2" do
    test "extracts and installs", %{tmp_dir: tmp} do
      # First, package the webapp recipe
      archive_dir = Path.join(tmp, "archives")
      File.mkdir_p!(archive_dir)
      {:ok, archive_path} = Publisher.package(@webapp_recipe_dir, archive_dir)

      # Now install from the archive
      project_path = Path.join(tmp, "project")
      File.mkdir_p!(project_path)

      assert {:ok, recipe_dir} = Installer.install_from_archive(archive_path, project_path)
      assert File.dir?(recipe_dir)
      assert File.exists?(Path.join(recipe_dir, "recipe.yaml"))
      assert File.exists?(Path.join(recipe_dir, "pipeline.yaml"))
    end

    test "backs up existing recipe before archive install", %{tmp_dir: tmp} do
      # Package the webapp recipe
      archive_dir = Path.join(tmp, "archives")
      File.mkdir_p!(archive_dir)
      {:ok, archive_path} = Publisher.package(@webapp_recipe_dir, archive_dir)

      # Set up project with existing recipe
      project_path = Path.join(tmp, "project")
      bropilot_dir = Path.join(project_path, ".bropilot")
      old_recipe_dir = Path.join(bropilot_dir, "recipe")
      File.mkdir_p!(old_recipe_dir)
      File.write!(Path.join(old_recipe_dir, "old_marker.txt"), "old recipe")

      assert {:ok, recipe_dir} = Installer.install_from_archive(archive_path, project_path)
      assert File.dir?(recipe_dir)

      # Backup cleaned up after successful install
      refute File.dir?(Path.join(bropilot_dir, "recipe.bak"))
    end
  end

  describe "install_builtin/2" do
    test "installs webapp recipe", %{tmp_dir: tmp} do
      project_path = Path.join(tmp, "project")
      File.mkdir_p!(project_path)

      assert {:ok, recipe_dir} = Installer.install_builtin("webapp", project_path)
      assert File.dir?(recipe_dir)
      assert File.exists?(Path.join(recipe_dir, "recipe.yaml"))

      {:ok, meta} = Bropilot.Yaml.decode_file(Path.join(recipe_dir, "recipe.yaml"))
      assert meta["name"] == "webapp"
    end

    test "fails for nonexistent builtin", %{tmp_dir: tmp} do
      project_path = Path.join(tmp, "project")
      File.mkdir_p!(project_path)

      assert {:error, {:builtin_not_found, "nonexistent"}} =
               Installer.install_builtin("nonexistent", project_path)
    end
  end

  describe "list_builtins/0" do
    test "includes webapp" do
      builtins = Installer.list_builtins()
      assert "webapp" in builtins
    end

    test "returns a list of strings" do
      builtins = Installer.list_builtins()
      assert is_list(builtins)
      assert Enum.all?(builtins, &is_binary/1)
    end
  end
end

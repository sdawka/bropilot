defmodule Bropilot.Recipe.PublisherTest do
  use ExUnit.Case

  alias Bropilot.Recipe.Publisher

  @webapp_recipe_dir Path.join([__DIR__, "..", "priv", "recipes", "webapp"]) |> Path.expand()

  setup do
    tmp = System.tmp_dir!() |> Path.join("bropilot_publisher_test_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)
    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, tmp_dir: tmp}
  end

  describe "validate_for_publish/1" do
    test "passes for valid webapp recipe" do
      assert :ok = Publisher.validate_for_publish(@webapp_recipe_dir)
    end

    test "fails when recipe.yaml is missing", %{tmp_dir: tmp} do
      recipe_dir = Path.join(tmp, "bad_recipe")
      File.mkdir_p!(recipe_dir)
      File.write!(Path.join(recipe_dir, "pipeline.yaml"), "acts: []")

      assert {:error, reasons} = Publisher.validate_for_publish(recipe_dir)
      assert Enum.any?(reasons, &String.contains?(&1, "recipe.yaml not found"))
    end

    test "fails when recipe.yaml missing name field", %{tmp_dir: tmp} do
      recipe_dir = Path.join(tmp, "no_name_recipe")
      File.mkdir_p!(recipe_dir)
      File.write!(Path.join(recipe_dir, "recipe.yaml"), "version: \"1.0.0\"\n")
      File.write!(Path.join(recipe_dir, "pipeline.yaml"), "acts: []")

      assert {:error, reasons} = Publisher.validate_for_publish(recipe_dir)
      assert Enum.any?(reasons, &String.contains?(&1, "missing 'name'"))
    end

    test "fails when pipeline.yaml is missing", %{tmp_dir: tmp} do
      recipe_dir = Path.join(tmp, "no_pipeline_recipe")
      File.mkdir_p!(recipe_dir)
      File.write!(Path.join(recipe_dir, "recipe.yaml"), "name: test\nversion: \"1.0.0\"\n")

      assert {:error, reasons} = Publisher.validate_for_publish(recipe_dir)
      assert Enum.any?(reasons, &String.contains?(&1, "pipeline.yaml not found"))
    end

    test "fails when referenced prompt file is missing", %{tmp_dir: tmp} do
      recipe_dir = Path.join(tmp, "missing_prompt_recipe")
      File.mkdir_p!(recipe_dir)

      File.write!(Path.join(recipe_dir, "recipe.yaml"), "name: test\nversion: \"1.0.0\"\n")

      pipeline = """
      acts:
        - id: act1
          name: "Test Act"
          primary_space: problem
          steps:
            - id: step1
              name: "Test Step"
              space: problem
              space_slots:
                - problem
                - context
              prompt: prompts/nonexistent.md
      """

      File.write!(Path.join(recipe_dir, "pipeline.yaml"), pipeline)

      assert {:error, reasons} = Publisher.validate_for_publish(recipe_dir)
      assert Enum.any?(reasons, &String.contains?(&1, "prompt file not found"))
    end
  end

  describe "package/2" do
    test "creates a .tar.gz with correct contents", %{tmp_dir: tmp} do
      output_dir = Path.join(tmp, "output")
      File.mkdir_p!(output_dir)

      assert {:ok, archive_path} = Publisher.package(@webapp_recipe_dir, output_dir)
      assert String.ends_with?(archive_path, "webapp-0.1.0.tar.gz")
      assert File.exists?(archive_path)

      # Extract and verify contents
      extract_dir = Path.join(tmp, "extracted")
      File.mkdir_p!(extract_dir)

      :ok =
        :erl_tar.extract(
          String.to_charlist(archive_path),
          [:compressed, {:cwd, String.to_charlist(extract_dir)}]
        )

      assert File.exists?(Path.join(extract_dir, "recipe.yaml"))
      assert File.exists?(Path.join(extract_dir, "pipeline.yaml"))
      assert File.exists?(Path.join(extract_dir, "manifest.yaml"))
    end

    test "includes manifest.yaml with correct metadata", %{tmp_dir: tmp} do
      output_dir = Path.join(tmp, "output")
      File.mkdir_p!(output_dir)

      assert {:ok, archive_path} = Publisher.package(@webapp_recipe_dir, output_dir)

      extract_dir = Path.join(tmp, "extracted")
      File.mkdir_p!(extract_dir)

      :ok =
        :erl_tar.extract(
          String.to_charlist(archive_path),
          [:compressed, {:cwd, String.to_charlist(extract_dir)}]
        )

      manifest_path = Path.join(extract_dir, "manifest.yaml")
      assert File.exists?(manifest_path)

      {:ok, manifest} = Bropilot.Yaml.decode_file(manifest_path)
      assert manifest["name"] == "webapp"
      assert manifest["version"] == "0.1.0"
      assert is_list(manifest["files"])
      assert length(manifest["files"]) > 0
      assert is_binary(manifest["checksum"])
      assert String.length(manifest["checksum"]) == 64
    end

    test "archive includes prompt and schema files", %{tmp_dir: tmp} do
      output_dir = Path.join(tmp, "output")
      File.mkdir_p!(output_dir)

      assert {:ok, archive_path} = Publisher.package(@webapp_recipe_dir, output_dir)

      extract_dir = Path.join(tmp, "extracted")
      File.mkdir_p!(extract_dir)

      :ok =
        :erl_tar.extract(
          String.to_charlist(archive_path),
          [:compressed, {:cwd, String.to_charlist(extract_dir)}]
        )

      # Check prompts
      assert File.exists?(Path.join(extract_dir, "prompts/step1-basics.md"))

      # Check schemas
      assert File.exists?(
               Path.join(extract_dir, "schemas/problem/vibes.schema.yaml")
             )
    end

    test "fails to package invalid recipe", %{tmp_dir: tmp} do
      recipe_dir = Path.join(tmp, "invalid_recipe")
      File.mkdir_p!(recipe_dir)

      output_dir = Path.join(tmp, "output")
      File.mkdir_p!(output_dir)

      assert {:error, reasons} = Publisher.package(recipe_dir, output_dir)
      assert is_list(reasons)
      assert length(reasons) > 0
    end
  end
end

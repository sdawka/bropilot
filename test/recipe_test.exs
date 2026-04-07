defmodule Bropilot.RecipeTest do
  use ExUnit.Case

  alias Bropilot.Recipe.Registry

  @webapp_recipe_dir Path.join([__DIR__, "..", "priv", "recipes", "webapp"]) |> Path.expand()

  describe "Recipe.Registry" do
    test "loads default webapp recipe" do
      assert {:ok, recipe} = Registry.load(@webapp_recipe_dir)
      assert recipe.name == "webapp"
      assert recipe.version == "0.1.0"
    end

    test "webapp recipe has 4 work steps" do
      {:ok, recipe} = Registry.load(@webapp_recipe_dir)
      assert length(recipe.work_steps) == 4
    end

    test "webapp recipe has exploration lenses covering Problem and Solution" do
      {:ok, recipe} = Registry.load(@webapp_recipe_dir)

      assert is_list(recipe.exploration_lenses)
      assert length(recipe.exploration_lenses) > 0

      target_spaces =
        recipe.exploration_lenses
        |> Enum.flat_map(fn lens ->
          lens.targets
          |> Map.keys()
          |> Enum.filter(fn space ->
            slots = Map.get(lens.targets, space, [])
            length(slots) > 0
          end)
        end)
        |> Enum.uniq()
        |> Enum.sort()

      assert :problem in target_spaces
      assert :solution in target_spaces
    end

    test "webapp recipe work steps are all in :work space" do
      {:ok, recipe} = Registry.load(@webapp_recipe_dir)

      assert Enum.all?(recipe.work_steps, &(&1.space == :work))
    end

    test "webapp recipe has expected work step ids" do
      {:ok, recipe} = Registry.load(@webapp_recipe_dir)

      ids = Enum.map(recipe.work_steps, & &1.id)
      assert "snapshot" in ids
      assert "changes" in ids
      assert "tasks" in ids
      assert "codegen" in ids
    end

    test "webapp recipe validates against spaces" do
      {:ok, recipe} = Registry.load(@webapp_recipe_dir)
      assert :ok = Bropilot.Spaces.validate_recipe(recipe)
    end

    test "webapp recipe has commit_gate" do
      {:ok, recipe} = Registry.load(@webapp_recipe_dir)
      assert is_map(recipe.commit_gate)
    end

    test "webapp recipe has 2 phases" do
      {:ok, recipe} = Registry.load(@webapp_recipe_dir)
      assert length(recipe.phases) == 2
    end
  end
end

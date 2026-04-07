defmodule Bropilot.InitTest do
  use ExUnit.Case

  describe "Bropilot.init/1" do
    setup do
      tmp = System.tmp_dir!() |> Path.join("bropilot_init_test_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)
      on_exit(fn -> File.rm_rf!(tmp) end)
      {:ok, project_dir: tmp}
    end

    test "creates .bropilot directory", %{project_dir: dir} do
      assert {:ok, bropilot_dir} = Bropilot.init(dir)
      assert File.dir?(bropilot_dir)
    end

    test "writes spaces.lock", %{project_dir: dir} do
      {:ok, bropilot_dir} = Bropilot.init(dir)
      lock_path = Path.join(bropilot_dir, "spaces.lock")
      assert File.exists?(lock_path)

      content = File.read!(lock_path)
      assert String.contains?(content, "DO NOT EDIT")
      assert String.contains?(content, "problem")
      assert String.contains?(content, "solution")
      assert String.contains?(content, "work")
      assert String.contains?(content, "measurement")
      assert String.contains?(content, "knowledge")
    end

    test "copies recipe directory", %{project_dir: dir} do
      {:ok, bropilot_dir} = Bropilot.init(dir)
      recipe_dir = Path.join(bropilot_dir, "recipe")
      assert File.dir?(recipe_dir)
      assert File.exists?(Path.join(recipe_dir, "recipe.yaml"))
      assert File.exists?(Path.join(recipe_dir, "pipeline.yaml"))
    end

    test "scaffolds map with all space directories", %{project_dir: dir} do
      {:ok, bropilot_dir} = Bropilot.init(dir)
      map_dir = Path.join(bropilot_dir, "map")

      for space <- ~w(problem solution work measurement knowledge) do
        assert File.dir?(Path.join(map_dir, space)),
               "Expected map/#{space} directory to exist"
      end
    end

    test "scaffolds solution subdirs", %{project_dir: dir} do
      {:ok, bropilot_dir} = Bropilot.init(dir)
      map_dir = Path.join(bropilot_dir, "map")

      for sub <- ~w(domain flows architecture specs) do
        assert File.dir?(Path.join([map_dir, "solution", sub]))
      end
    end

    test "scaffolds measurement validation subdirs", %{project_dir: dir} do
      {:ok, bropilot_dir} = Bropilot.init(dir)
      map_dir = Path.join(bropilot_dir, "map")

      for sub <- ~w(problem solution work live) do
        assert File.dir?(Path.join([map_dir, "measurement", "validation", sub]))
      end
    end

    test "scaffolds knowledge decisions dir", %{project_dir: dir} do
      {:ok, bropilot_dir} = Bropilot.init(dir)
      assert File.dir?(Path.join([bropilot_dir, "map", "knowledge", "decisions"]))
    end
  end
end

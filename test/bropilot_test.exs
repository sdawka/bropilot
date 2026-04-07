defmodule BropilotTest do
  use ExUnit.Case

  alias Bropilot.Spaces
  alias Bropilot.Spaces.Space

  describe "Spaces" do
    test "all/0 returns 5 spaces" do
      assert length(Spaces.all()) == 5
    end

    test "ids/0 returns all space ids" do
      assert Spaces.ids() == [:problem, :solution, :work, :measurement, :knowledge]
    end

    test "primary_ids/0 returns non-cross-cutting spaces" do
      assert Spaces.primary_ids() == [:problem, :solution, :work]
    end

    test "each space has required_slots" do
      for space <- Spaces.all() do
        assert %Space{} = space
        assert is_list(space.required_slots)
        assert length(space.required_slots) > 0
      end
    end

    test "problem space has 5 required slots" do
      space = Spaces.definition(:problem)
      assert length(space.required_slots) == 5
      slot_ids = Enum.map(space.required_slots, & &1.id)
      assert :audience in slot_ids
      assert :problem in slot_ids
      assert :context in slot_ids
      assert :assumptions in slot_ids
      assert :hypotheses in slot_ids
    end

    test "solution space has 5 required slots" do
      space = Spaces.definition(:solution)
      assert length(space.required_slots) == 5
      slot_ids = Enum.map(space.required_slots, & &1.id)
      assert :vocabulary in slot_ids
      assert :domain in slot_ids
      assert :flows in slot_ids
      assert :architecture in slot_ids
      assert :specs in slot_ids
    end

    test "work space has versions slot" do
      space = Spaces.definition(:work)
      slot_ids = Enum.map(space.required_slots, & &1.id)
      assert :versions in slot_ids
    end

    test "measurement and knowledge are cross-cutting" do
      assert Spaces.definition(:measurement).cross_cutting? == true
      assert Spaces.definition(:knowledge).cross_cutting? == true
    end

    test "problem, solution, work are not cross-cutting" do
      assert Spaces.definition(:problem).cross_cutting? == false
      assert Spaces.definition(:solution).cross_cutting? == false
      assert Spaces.definition(:work).cross_cutting? == false
    end

    test "unknown space returns error" do
      assert {:error, {:unknown_space, :bogus}} = Spaces.definition(:bogus)
    end
  end

  describe "Spaces.validate_recipe/1" do
    test "valid recipe covering all primary spaces" do
      recipe = %{
        steps: [
          %{space: :problem},
          %{space: :solution},
          %{space: :work}
        ]
      }

      assert :ok = Spaces.validate_recipe(recipe)
    end

    test "recipe missing a primary space fails" do
      recipe = %{
        steps: [
          %{space: :problem},
          %{space: :work}
        ]
      }

      assert {:error, {:missing_spaces, [:solution]}} = Spaces.validate_recipe(recipe)
    end

    test "recipe with only cross-cutting spaces fails" do
      recipe = %{
        steps: [
          %{space: :measurement},
          %{space: :knowledge}
        ]
      }

      assert {:error, {:missing_spaces, missing}} = Spaces.validate_recipe(recipe)
      assert :problem in missing
      assert :solution in missing
      assert :work in missing
    end
  end

  describe "Spaces.generate_lock/0" do
    test "generates lock with all 5 spaces" do
      lock = Spaces.generate_lock()
      assert lock["version"] == "1.0.0"
      assert lock["immutable"] == true
      assert length(lock["spaces"]) == 5
    end

    test "lock space ids match defined spaces" do
      lock = Spaces.generate_lock()
      ids = Enum.map(lock["spaces"], & &1["id"])
      assert ids == ["problem", "solution", "work", "measurement", "knowledge"]
    end
  end

  describe "Spaces.validate_gate/2" do
    setup do
      tmp = System.tmp_dir!() |> Path.join("bropilot_test_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)
      on_exit(fn -> File.rm_rf!(tmp) end)
      {:ok, map_dir: tmp}
    end

    test "fails when slots are empty", %{map_dir: map_dir} do
      File.mkdir_p!(Path.join(map_dir, "problem"))
      assert {:error, {:unfilled_slots, missing}} = Spaces.validate_gate(map_dir, :problem)
      assert length(missing) == 5
    end

    test "passes when all file slots exist", %{map_dir: map_dir} do
      problem_dir = Path.join(map_dir, "problem")
      File.mkdir_p!(problem_dir)

      for slot <- [:audience, :problem, :context, :assumptions, :hypotheses] do
        File.write!(Path.join(problem_dir, "#{slot}.yaml"), "test: true")
      end

      assert :ok = Spaces.validate_gate(map_dir, :problem)
    end

    test "passes when directory slots exist", %{map_dir: map_dir} do
      solution_dir = Path.join(map_dir, "solution")
      File.mkdir_p!(solution_dir)

      File.write!(Path.join(solution_dir, "vocabulary.yaml"), "test: true")

      for dir <- [:domain, :flows, :architecture, :specs] do
        File.mkdir_p!(Path.join(solution_dir, Atom.to_string(dir)))
      end

      assert :ok = Spaces.validate_gate(map_dir, :solution)
    end
  end
end

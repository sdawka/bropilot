defmodule Bropilot.PipelineTest do
  use ExUnit.Case

  alias Bropilot.Pipeline.Engine

  @webapp_source Path.join([__DIR__, "..", "priv", "recipes", "webapp"]) |> Path.expand()

  defp setup_project do
    tmp = System.tmp_dir!() |> Path.join("bropilot_pipeline_test_#{:rand.uniform(1_000_000)}")
    File.mkdir_p!(tmp)

    bropilot_dir = Path.join(tmp, ".bropilot")
    recipe_dir = Path.join(bropilot_dir, "recipe")
    map_dir = Path.join(bropilot_dir, "map")

    File.mkdir_p!(recipe_dir)
    File.mkdir_p!(map_dir)

    File.cp!(Path.join(@webapp_source, "recipe.yaml"), Path.join(recipe_dir, "recipe.yaml"))
    File.cp!(Path.join(@webapp_source, "pipeline.yaml"), Path.join(recipe_dir, "pipeline.yaml"))

    for space <- ~w(problem solution work measurement knowledge) do
      File.mkdir_p!(Path.join(map_dir, space))
    end

    {tmp, map_dir}
  end

  defp fill_problem_slots(map_dir) do
    problem_dir = Path.join(map_dir, "problem")

    for slot <- ~w(audience problem context assumptions hypotheses) do
      File.write!(Path.join(problem_dir, "#{slot}.yaml"), "test: true")
    end
  end

  defp fill_solution_slots(map_dir) do
    solution_dir = Path.join(map_dir, "solution")
    File.write!(Path.join(solution_dir, "vocabulary.yaml"), "test: true")

    for dir <- ~w(domain flows architecture specs) do
      File.mkdir_p!(Path.join(solution_dir, dir))
    end
  end

  defp state_file(project_path),
    do: Path.join([project_path, ".bropilot", "pipeline_state.yaml"])

  describe "phase initialization" do
    setup do
      {project_path, map_dir} = setup_project()
      on_exit(fn -> File.rm_rf!(project_path) end)
      {:ok, project_path: project_path, map_dir: map_dir}
    end

    test "engine starts in :exploration phase", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)
      assert Engine.current_phase(pid) == :exploration
      assert Engine.current_step(pid) == :exploration
    end

    test "advance in :exploration returns {:error, :use_commit}", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)
      assert {:error, :use_commit} = Engine.advance(pid)
    end

    test "step_status reports all work steps as pending in exploration",
         %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)
      statuses = Engine.step_status(pid)
      assert map_size(statuses) > 0
      assert Enum.all?(Map.values(statuses), &(&1 == :pending))
    end
  end

  describe "commitment gate" do
    setup do
      {project_path, map_dir} = setup_project()
      on_exit(fn -> File.rm_rf!(project_path) end)
      {:ok, project_path: project_path, map_dir: map_dir}
    end

    test "commit fails when no slots filled", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)

      assert {:error, {:unfilled_slots, %{problem: p, solution: s}}} = Engine.commit(pid)
      assert length(p) > 0
      assert length(s) > 0
      assert Engine.current_phase(pid) == :exploration
    end

    test "commit fails with only problem filled", %{project_path: project_path, map_dir: map_dir} do
      {:ok, pid} = Engine.start_link(project_path: project_path)
      fill_problem_slots(map_dir)

      assert {:error, {:unfilled_slots, %{problem: [], solution: s}}} = Engine.commit(pid)
      assert length(s) > 0
    end

    test "commit succeeds when both slots filled, transitions to :work",
         %{project_path: project_path, map_dir: map_dir} do
      {:ok, pid} = Engine.start_link(project_path: project_path)
      fill_problem_slots(map_dir)
      fill_solution_slots(map_dir)

      assert {:ok, first_step} = Engine.commit(pid)
      assert first_step != nil
      assert first_step.space == :work
      assert Engine.current_phase(pid) == :work
    end

    test "commit fails if not in exploration", %{project_path: project_path, map_dir: map_dir} do
      {:ok, pid} = Engine.start_link(project_path: project_path)
      fill_problem_slots(map_dir)
      fill_solution_slots(map_dir)
      {:ok, _} = Engine.commit(pid)

      assert {:error, :not_in_exploration} = Engine.commit(pid)
    end
  end

  describe "work phase advancement" do
    setup do
      {project_path, map_dir} = setup_project()
      on_exit(fn -> File.rm_rf!(project_path) end)
      fill_problem_slots(map_dir)
      fill_solution_slots(map_dir)
      {:ok, pid} = Engine.start_link(project_path: project_path)
      {:ok, _} = Engine.commit(pid)
      {:ok, pid: pid, project_path: project_path}
    end

    test "advances sequentially through work steps and reaches :complete", %{pid: pid} do
      first = Engine.current_step(pid)
      assert first.space == :work

      results =
        Stream.repeatedly(fn -> Engine.advance(pid) end)
        |> Enum.reduce_while([], fn r, acc ->
          case r do
            {:ok, step} -> {:cont, [step | acc]}
            {:error, :pipeline_complete} -> {:halt, acc}
          end
        end)

      # We made it through all remaining steps
      assert is_list(results)
      assert Engine.current_phase(pid) == :complete
      assert Engine.current_step(pid) == :complete
    end

    test "advance after :complete returns :pipeline_complete", %{pid: pid} do
      Stream.repeatedly(fn -> Engine.advance(pid) end)
      |> Enum.reduce_while(nil, fn r, _ ->
        case r do
          {:ok, _} -> {:cont, nil}
          {:error, :pipeline_complete} -> {:halt, nil}
        end
      end)

      assert {:error, :pipeline_complete} = Engine.advance(pid)
    end

    test "mark_complete records completion", %{pid: pid} do
      step = Engine.current_step(pid)
      assert :ok = Engine.mark_complete(pid, step.id)
      statuses = Engine.step_status(pid)
      assert statuses[step.id] == :completed
    end
  end

  describe "persistence" do
    setup do
      {project_path, map_dir} = setup_project()
      on_exit(fn -> File.rm_rf!(project_path) end)
      {:ok, project_path: project_path, map_dir: map_dir}
    end

    test "persists phase, work_step_index, completed_steps", %{
      project_path: project_path,
      map_dir: map_dir
    } do
      {:ok, pid} = Engine.start_link(project_path: project_path)
      fill_problem_slots(map_dir)
      fill_solution_slots(map_dir)
      {:ok, _} = Engine.commit(pid)
      step = Engine.current_step(pid)
      Engine.mark_complete(pid, step.id)

      {:ok, data} = Bropilot.Yaml.decode_file(state_file(project_path))
      assert data["phase"] == "work"
      assert data["work_step_index"] == 0
      assert step.id in data["completed_steps"]
    end

    test "round-trip restores phase and index", %{project_path: project_path, map_dir: map_dir} do
      {:ok, pid} = Engine.start_link(project_path: project_path)
      fill_problem_slots(map_dir)
      fill_solution_slots(map_dir)
      {:ok, _} = Engine.commit(pid)
      {:ok, _} = Engine.advance(pid)
      GenServer.stop(pid)

      {:ok, pid2} = Engine.start_link(project_path: project_path)
      assert Engine.current_phase(pid2) == :work
      step = Engine.current_step(pid2)
      assert step != :exploration
      assert step.space == :work
    end

    test "missing state file defaults to exploration", %{project_path: project_path} do
      File.rm(state_file(project_path))
      {:ok, pid} = Engine.start_link(project_path: project_path)
      assert Engine.current_phase(pid) == :exploration
    end

    test "backward-compat: old current_step_index migrates without crash", %{
      project_path: project_path
    } do
      File.mkdir_p!(Path.dirname(state_file(project_path)))

      content =
        Bropilot.Yaml.encode(%{
          "current_step_index" => 0,
          "completed_steps" => ["step1"]
        })

      File.write!(state_file(project_path), content)

      {:ok, pid} = Engine.start_link(project_path: project_path)
      phase = Engine.current_phase(pid)
      assert phase in [:exploration, :work]
    end
  end
end

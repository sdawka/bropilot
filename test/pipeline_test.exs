defmodule Bropilot.PipelineTest do
  use ExUnit.Case

  alias Bropilot.Pipeline.Engine

  @webapp_source Path.join([__DIR__, "..", "priv", "recipes", "webapp"]) |> Path.expand()

  defp setup_project do
    tmp = System.tmp_dir!() |> Path.join("bropilot_pipeline_test_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)

    bropilot_dir = Path.join(tmp, ".bropilot")
    recipe_dir = Path.join(bropilot_dir, "recipe")
    map_dir = Path.join(bropilot_dir, "map")

    File.mkdir_p!(recipe_dir)
    File.mkdir_p!(map_dir)

    # Copy recipe files
    File.cp!(Path.join(@webapp_source, "recipe.yaml"), Path.join(recipe_dir, "recipe.yaml"))
    File.cp!(Path.join(@webapp_source, "pipeline.yaml"), Path.join(recipe_dir, "pipeline.yaml"))

    # Scaffold map space directories
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

  describe "Engine start and load" do
    setup do
      {project_path, _map_dir} = setup_project()
      on_exit(fn -> File.rm_rf!(project_path) end)
      {:ok, project_path: project_path}
    end

    test "starts and loads recipe", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)
      step = Engine.current_step(pid)
      assert step != nil
      assert step.id == "step1"
    end

    test "current_step returns step1 initially", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)
      step = Engine.current_step(pid)
      assert step.id == "step1"
      assert step.name == "The App Basics"
      assert step.space == :problem
    end
  end

  describe "mark_complete and advance" do
    setup do
      {project_path, map_dir} = setup_project()
      on_exit(fn -> File.rm_rf!(project_path) end)
      {:ok, project_path: project_path, map_dir: map_dir}
    end

    test "mark_complete + advance within same space works", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)

      assert :ok = Engine.mark_complete(pid, "step1")
      assert {:ok, step2} = Engine.advance(pid)
      assert step2.id == "step2"
      assert step2.space == :problem
    end

    test "step_status reflects completion", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)

      statuses = Engine.step_status(pid)
      assert statuses["step1"] == :in_progress
      assert statuses["step2"] == :pending

      Engine.mark_complete(pid, "step1")
      statuses = Engine.step_status(pid)
      assert statuses["step1"] == :completed
    end
  end

  describe "gate validation" do
    setup do
      {project_path, map_dir} = setup_project()
      on_exit(fn -> File.rm_rf!(project_path) end)
      {:ok, project_path: project_path, map_dir: map_dir}
    end

    test "blocks advancement when slots are empty", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)

      # Advance within problem space (step1 -> step2)
      Engine.mark_complete(pid, "step1")
      {:ok, _step2} = Engine.advance(pid)

      # Try to advance from problem to solution (step2 -> step3) without filling slots
      Engine.mark_complete(pid, "step2")
      assert {:error, {:unfilled_slots, _missing}} = Engine.advance(pid)
    end

    test "passes when slots are filled", %{project_path: project_path, map_dir: map_dir} do
      {:ok, pid} = Engine.start_link(project_path: project_path)

      # Advance to step2
      Engine.mark_complete(pid, "step1")
      {:ok, _step2} = Engine.advance(pid)

      # Fill problem slots and advance to solution space
      fill_problem_slots(map_dir)
      Engine.mark_complete(pid, "step2")
      assert {:ok, step3} = Engine.advance(pid)
      assert step3.id == "step3"
      assert step3.space == :solution
    end
  end

  describe "full pipeline traversal" do
    setup do
      {project_path, map_dir} = setup_project()
      on_exit(fn -> File.rm_rf!(project_path) end)
      {:ok, project_path: project_path, map_dir: map_dir}
    end

    test "traverses from step1 to step8", %{project_path: project_path, map_dir: map_dir} do
      {:ok, pid} = Engine.start_link(project_path: project_path)

      # Step 1 -> Step 2 (same space: problem)
      assert Engine.current_step(pid).id == "step1"
      Engine.mark_complete(pid, "step1")
      assert {:ok, step} = Engine.advance(pid)
      assert step.id == "step2"

      # Step 2 -> Step 3 (problem -> solution, needs gate)
      fill_problem_slots(map_dir)
      Engine.mark_complete(pid, "step2")
      assert {:ok, step} = Engine.advance(pid)
      assert step.id == "step3"
      assert step.space == :solution

      # Step 3 -> Step 4 (same space: solution)
      Engine.mark_complete(pid, "step3")
      assert {:ok, step} = Engine.advance(pid)
      assert step.id == "step4"

      # Step 4 -> Step 5 (solution -> work, needs gate)
      fill_solution_slots(map_dir)
      Engine.mark_complete(pid, "step4")
      assert {:ok, step} = Engine.advance(pid)
      assert step.id == "step5"
      assert step.space == :work

      # Step 5 -> Step 6 (same space: work)
      Engine.mark_complete(pid, "step5")
      assert {:ok, step} = Engine.advance(pid)
      assert step.id == "step6"

      # Step 6 -> Step 7 (same space: work)
      Engine.mark_complete(pid, "step6")
      assert {:ok, step} = Engine.advance(pid)
      assert step.id == "step7"

      # Step 7 -> Step 8 (same space: work)
      Engine.mark_complete(pid, "step7")
      assert {:ok, step} = Engine.advance(pid)
      assert step.id == "step8"

      # Past end
      Engine.mark_complete(pid, "step8")
      assert {:error, :pipeline_complete} = Engine.advance(pid)

      # All steps completed
      statuses = Engine.step_status(pid)

      for i <- 1..8 do
        assert statuses["step#{i}"] == :completed
      end
    end
  end

  describe "pipeline state persistence" do
    setup do
      {project_path, map_dir} = setup_project()
      on_exit(fn -> File.rm_rf!(project_path) end)
      {:ok, project_path: project_path, map_dir: map_dir}
    end

    @state_file "pipeline_state.yaml"

    defp state_file_path(project_path) do
      Path.join([project_path, ".bropilot", @state_file])
    end

    test "writes state file on advance", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)

      # State file should exist even on init (written on startup with all 8 step statuses)
      assert File.exists?(state_file_path(project_path))

      # Advance step1 -> step2
      Engine.mark_complete(pid, "step1")
      {:ok, _step2} = Engine.advance(pid)

      # State file should still exist
      assert File.exists?(state_file_path(project_path))

      # Read and verify contents
      {:ok, data} = Bropilot.Yaml.decode_file(state_file_path(project_path))
      assert data["current_step_index"] == 1
    end

    test "writes state file on mark_complete", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)

      Engine.mark_complete(pid, "step1")

      # State file should exist after mark_complete
      assert File.exists?(state_file_path(project_path))

      {:ok, data} = Bropilot.Yaml.decode_file(state_file_path(project_path))
      assert "step1" in data["completed_steps"]
    end

    test "persists current_step_index and completed_steps", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)

      Engine.mark_complete(pid, "step1")
      {:ok, _step2} = Engine.advance(pid)

      {:ok, data} = Bropilot.Yaml.decode_file(state_file_path(project_path))
      assert data["current_step_index"] == 1
      assert is_list(data["completed_steps"])
      assert "step1" in data["completed_steps"]
    end

    test "loads state on init and resumes from persisted position", %{project_path: project_path} do
      # Start engine, advance, then stop
      {:ok, pid} = Engine.start_link(project_path: project_path)
      Engine.mark_complete(pid, "step1")
      {:ok, _step2} = Engine.advance(pid)
      GenServer.stop(pid)

      # Start a new engine — it should resume from step2
      {:ok, pid2} = Engine.start_link(project_path: project_path)
      step = Engine.current_step(pid2)
      assert step.id == "step2"

      # Verify completed_steps are restored
      statuses = Engine.step_status(pid2)
      assert statuses["step1"] == :completed
      assert statuses["step2"] == :in_progress
    end

    test "missing state file defaults to step 0", %{project_path: project_path} do
      # Ensure no state file exists
      File.rm(state_file_path(project_path))

      {:ok, pid} = Engine.start_link(project_path: project_path)
      step = Engine.current_step(pid)
      assert step.id == "step1"

      statuses = Engine.step_status(pid)
      assert statuses["step1"] == :in_progress
    end

    test "corrupted state file defaults to step 0 with logged warning", %{project_path: project_path} do
      # Write invalid YAML to state file
      File.write!(state_file_path(project_path), "{{invalid yaml: [")

      {:ok, pid} = Engine.start_link(project_path: project_path)
      step = Engine.current_step(pid)
      assert step.id == "step1"

      statuses = Engine.step_status(pid)
      assert statuses["step1"] == :in_progress
    end

    test "state file with missing fields defaults to step 0", %{project_path: project_path} do
      # Write valid YAML but missing required fields
      File.write!(state_file_path(project_path), "some_other_key: true\n")

      {:ok, pid} = Engine.start_link(project_path: project_path)
      step = Engine.current_step(pid)
      assert step.id == "step1"
    end

    test "state file with invalid step index defaults to step 0", %{project_path: project_path} do
      # Write valid YAML with out-of-range step index
      content = Bropilot.Yaml.encode(%{
        "current_step_index" => 999,
        "completed_steps" => []
      })
      File.write!(state_file_path(project_path), content)

      {:ok, pid} = Engine.start_link(project_path: project_path)
      step = Engine.current_step(pid)
      assert step.id == "step1"
    end

    test "atomic write uses tmp file + rename", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)
      Engine.mark_complete(pid, "step1")
      {:ok, _step2} = Engine.advance(pid)

      # After write, no tmp file should remain
      bropilot_dir = Path.join(project_path, ".bropilot")
      tmp_files = bropilot_dir
        |> File.ls!()
        |> Enum.filter(&String.starts_with?(&1, "pipeline_state.yaml.tmp"))

      assert tmp_files == []

      # State file should exist and be valid
      assert File.exists?(state_file_path(project_path))
      {:ok, data} = Bropilot.Yaml.decode_file(state_file_path(project_path))
      assert is_integer(data["current_step_index"])
    end

    test "state persists completed steps correctly across multiple advances", %{
      project_path: project_path,
      map_dir: map_dir
    } do
      {:ok, pid} = Engine.start_link(project_path: project_path)

      # Advance through problem space
      Engine.mark_complete(pid, "step1")
      {:ok, _step2} = Engine.advance(pid)
      Engine.mark_complete(pid, "step2")
      fill_problem_slots(map_dir)
      {:ok, _step3} = Engine.advance(pid)

      GenServer.stop(pid)

      # Restart and verify
      {:ok, pid2} = Engine.start_link(project_path: project_path)
      step = Engine.current_step(pid2)
      assert step.id == "step3"

      statuses = Engine.step_status(pid2)
      assert statuses["step1"] == :completed
      assert statuses["step2"] == :completed
      assert statuses["step3"] == :in_progress
    end

    test "concurrent advance calls do not corrupt state file", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)
      Engine.mark_complete(pid, "step1")

      # Fire two advances in parallel — GenServer serializes them, but both should
      # write valid YAML
      task1 = Task.async(fn -> Engine.advance(pid) end)
      task2 = Task.async(fn -> Engine.advance(pid) end)

      result1 = Task.await(task1)
      result2 = Task.await(task2)

      # One should succeed, the other either succeeds to next step or gets pipeline_complete/error
      results = [result1, result2]
      assert Enum.any?(results, fn
        {:ok, _step} -> true
        _ -> false
      end)

      # State file must be valid YAML
      {:ok, data} = Bropilot.Yaml.decode_file(state_file_path(project_path))
      assert is_integer(data["current_step_index"])
      assert is_list(data["completed_steps"])
    end

    test "state file stored at .bropilot/pipeline_state.yaml", %{project_path: project_path} do
      {:ok, pid} = Engine.start_link(project_path: project_path)
      Engine.mark_complete(pid, "step1")

      expected_path = Path.join([project_path, ".bropilot", "pipeline_state.yaml"])
      assert File.exists?(expected_path)
    end
  end
end

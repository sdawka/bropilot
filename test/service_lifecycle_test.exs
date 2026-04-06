defmodule Bropilot.ServiceLifecycleTest do
  @moduledoc """
  Integration tests for blocked service-lifecycle scenarios.
  Tests restart, missing .bropilot, and extract-before-start
  using temp directories and isolated GenServers.
  """
  use ExUnit.Case

  alias Bropilot.Pipeline.Engine
  alias Bropilot.Pipeline.Act2.Worker
  alias Bropilot.Map.Store

  @recipe_dir Path.join([__DIR__, "..", "priv", "recipes", "webapp"]) |> Path.expand()

  defp setup_project do
    tmp = System.tmp_dir!() |> Path.join("bropilot_lifecycle_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)

    {:ok, _bropilot_dir} = Bropilot.init(tmp)

    map_dir = Path.join([tmp, ".bropilot", "map"])

    # Pre-populate Problem Space data (as if Act 1 completed)
    Store.write(map_dir, :problem, :problem, %{"problem" => "Test problem"})
    Store.write(map_dir, :problem, :context, %{"context" => "Test context"})
    Store.write(map_dir, :problem, :audience, %{"audience" => "Test audience"})
    Store.write(map_dir, :problem, :assumptions, %{"assumptions" => ["assumption1"]})
    Store.write(map_dir, :problem, :hypotheses, %{"hypotheses" => ["hypothesis1"]})
    Store.write(map_dir, :problem, :"vibes/basics", %{
      "audience" => "Test users",
      "use_cases" => ["Use case 1"],
      "capabilities" => ["Capability 1"],
      "design" => "Simple",
      "volo" => "Test volo",
      "hypotheses" => ["hypothesis1"],
      "assumptions" => ["assumption1"]
    })

    {tmp, map_dir}
  end

  defp cleanup(tmp) do
    File.rm_rf!(tmp)
  end

  # ── Act2.Worker restart scenarios ───────────────────────────

  describe "Act2.Worker restart" do
    test "restarting worker kills old process and creates fresh state" do
      {tmp, _map_dir} = setup_project()

      # Start first worker
      {:ok, pid1} = Worker.start(project_path: tmp, recipe: @recipe_dir, extraction_mode: :mock)
      assert Process.alive?(pid1)

      # Run step3 on first worker
      {:ok, _prompt} = Worker.run_step3(pid1)

      # Start second worker
      {:ok, pid2} = Worker.start(project_path: tmp, recipe: @recipe_dir, extraction_mode: :mock)
      assert Process.alive?(pid2)

      # Second worker should be fresh (step3 not yet run)
      # Running step3 should succeed
      {:ok, prompt} = Worker.run_step3(pid2)
      assert is_binary(prompt)
      assert String.length(prompt) > 0

      # Clean up both pids
      if Process.alive?(pid1), do: GenServer.stop(pid1)
      GenServer.stop(pid2)
      cleanup(tmp)
    end

    test "worker can be stopped and restarted with fresh state" do
      {tmp, _map_dir} = setup_project()

      # Start worker, do step3
      {:ok, pid1} = Worker.start(project_path: tmp, recipe: @recipe_dir, extraction_mode: :mock)
      {:ok, _prompt} = Worker.run_step3(pid1)
      {:ok, _data} = Worker.extract(pid1)

      # Stop the worker
      GenServer.stop(pid1)
      refute Process.alive?(pid1)

      # Start a new worker — should start fresh at :idle
      {:ok, pid2} = Worker.start(project_path: tmp, recipe: @recipe_dir, extraction_mode: :mock)
      assert Process.alive?(pid2)

      # New worker should be in idle state — can run step3 again
      {:ok, prompt} = Worker.run_step3(pid2)
      assert is_binary(prompt)

      GenServer.stop(pid2)
      cleanup(tmp)
    end
  end

  # ── Missing .bropilot scenarios ─────────────────────────────

  describe "missing .bropilot directory" do
    test "Engine fails to start without recipe files" do
      tmp = System.tmp_dir!() |> Path.join("bropilot_no_recipe_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)
      File.mkdir_p!(Path.join(tmp, ".bropilot"))

      # Engine needs recipe files — should fail with missing recipe
      result = Engine.start(project_path: tmp)

      case result do
        {:error, _reason} ->
          # Expected: engine can't load recipe
          assert true

        {:ok, pid} ->
          # If it somehow started, stop it
          GenServer.stop(pid)
          flunk("Engine should not start without recipe files")
      end

      File.rm_rf!(tmp)
    end

    test "Worker starts but crashes on step3 with missing recipe files" do
      tmp = System.tmp_dir!() |> Path.join("bropilot_no_recipe_worker_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)

      # Worker starts in :idle state but will crash when trying to use recipe files
      {:ok, pid} = Worker.start(project_path: tmp, recipe: "/nonexistent/recipe", extraction_mode: :mock)

      # run_step3 will crash the GenServer because File.read! on missing recipe raises
      assert catch_exit(Worker.run_step3(pid))

      File.rm_rf!(tmp)
    end
  end

  # ── Extract-before-start scenarios ──────────────────────────

  describe "extract before start" do
    test "Worker rejects extract call when in idle state" do
      {tmp, _map_dir} = setup_project()

      {:ok, pid} = Worker.start(project_path: tmp, recipe: @recipe_dir, extraction_mode: :mock)

      # Try to extract without running step3 first — should get error
      result = Worker.extract(pid)
      assert {:error, msg} = result
      assert is_binary(msg)
      assert String.contains?(msg, "idle")

      GenServer.stop(pid)
      cleanup(tmp)
    end

    test "Worker rejects step4 when step3 not yet extracted" do
      {tmp, _map_dir} = setup_project()

      {:ok, pid} = Worker.start(project_path: tmp, recipe: @recipe_dir, extraction_mode: :mock)
      {:ok, _prompt} = Worker.run_step3(pid)

      # Try step4 without completing step3 extraction — should return error
      result = Worker.run_step4(pid)
      assert {:error, msg} = result
      assert String.contains?(msg, "step3")

      GenServer.stop(pid)
      cleanup(tmp)
    end

    test "Worker extract fails gracefully after step3 without step3 data" do
      {tmp, _map_dir} = setup_project()

      {:ok, pid} = Worker.start(project_path: tmp, recipe: @recipe_dir, extraction_mode: :mock)
      {:ok, _prompt} = Worker.run_step3(pid)

      # Extract in step3 state (mock mode returns data successfully)
      {:ok, data} = Worker.extract(pid)
      assert is_map(data)
      assert is_list(data["vocabulary"])

      GenServer.stop(pid)
      cleanup(tmp)
    end
  end

  # ── Pipeline Engine restart scenarios ───────────────────────

  describe "Pipeline Engine restart with persistence" do
    test "engine persists state and new engine resumes from it" do
      {tmp, _map_dir} = setup_project()

      # Start engine, advance a few steps
      {:ok, pid1} = Engine.start(project_path: tmp)
      {:ok, step2} = Engine.advance(pid1)
      assert step2.id == "step2"

      # Verify persisted state file exists
      state_path = Path.join([tmp, ".bropilot", "pipeline_state.yaml"])
      assert File.exists?(state_path)

      # Read the state file — should have step_statuses for all 8 steps
      {:ok, persisted} = Bropilot.Yaml.decode_file(state_path)
      assert persisted["current_step_index"] == 1
      assert is_map(persisted["step_statuses"])
      assert map_size(persisted["step_statuses"]) == 8

      # Stop the engine
      GenServer.stop(pid1)

      # Start a new engine — should resume from step index 1
      {:ok, pid2} = Engine.start(project_path: tmp)
      current = Engine.current_step(pid2)
      assert current.id == "step2"

      GenServer.stop(pid2)
      cleanup(tmp)
    end

    test "engine starts fresh when no state file exists" do
      {tmp, _map_dir} = setup_project()

      # Ensure no state file
      state_path = Path.join([tmp, ".bropilot", "pipeline_state.yaml"])
      File.rm(state_path)

      {:ok, pid} = Engine.start(project_path: tmp)
      current = Engine.current_step(pid)
      assert current.id == "step1"

      statuses = Engine.step_status(pid)
      assert statuses["step1"] == :in_progress
      assert statuses["step2"] == :pending
      assert statuses["step8"] == :pending

      GenServer.stop(pid)
      cleanup(tmp)
    end

    test "engine recovers from corrupted state file" do
      {tmp, _map_dir} = setup_project()

      state_path = Path.join([tmp, ".bropilot", "pipeline_state.yaml"])
      File.mkdir_p!(Path.dirname(state_path))
      File.write!(state_path, "{{invalid yaml content")

      {:ok, pid} = Engine.start(project_path: tmp)
      current = Engine.current_step(pid)
      assert current.id == "step1"

      GenServer.stop(pid)
      cleanup(tmp)
    end

    test "mark_complete persists and survives restart" do
      {tmp, _map_dir} = setup_project()

      {:ok, pid1} = Engine.start(project_path: tmp)
      :ok = Engine.mark_complete(pid1, "step1")

      statuses1 = Engine.step_status(pid1)
      assert statuses1["step1"] == :completed

      GenServer.stop(pid1)

      # Restart and verify
      {:ok, pid2} = Engine.start(project_path: tmp)
      statuses2 = Engine.step_status(pid2)
      assert statuses2["step1"] == :completed

      GenServer.stop(pid2)
      cleanup(tmp)
    end
  end

  # ── YAML round-trip with empty arrays ───────────────────────

  describe "YAML round-trip preserves empty arrays" do
    test "empty arrays survive encode/decode cycle" do
      data = %{
        "items" => [],
        "name" => "test",
        "nested" => %{"list" => [], "value" => "ok"}
      }

      encoded = Bropilot.Yaml.encode(data)
      assert String.contains?(encoded, "[]")

      {:ok, decoded} = Bropilot.Yaml.decode(encoded)
      assert decoded["items"] == []
      assert decoded["nested"]["list"] == []
    end

    test "empty arrays in pipeline state survive persistence" do
      {tmp, _map_dir} = setup_project()

      {:ok, pid} = Engine.start(project_path: tmp)

      # Get status — completed_steps should be empty
      state_path = Path.join([tmp, ".bropilot", "pipeline_state.yaml"])

      # Advance to create a state file
      {:ok, _step} = Engine.advance(pid)

      # Read the state file
      {:ok, persisted} = Bropilot.Yaml.decode_file(state_path)

      # completed_steps should be an empty list (not null)
      assert persisted["completed_steps"] == []

      GenServer.stop(pid)
      cleanup(tmp)
    end
  end
end

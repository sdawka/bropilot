defmodule Bropilot.ExecutorTest do
  use ExUnit.Case

  alias Bropilot.Pipeline.Act3.Executor
  alias Bropilot.Pipeline.Act3.Snapshot
  alias Bropilot.Pipeline.Feedback

  setup do
    tmp = System.tmp_dir!() |> Path.join("bropilot_executor_test_#{:rand.uniform(100_000)}")
    map_dir = tmp
    File.mkdir_p!(Path.join([map_dir, "problem"]))
    File.mkdir_p!(Path.join([map_dir, "solution", "specs"]))
    File.mkdir_p!(Path.join([map_dir, "work", "versions"]))
    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, map_dir: map_dir}
  end

  defp populate_map(map_dir) do
    Bropilot.Yaml.encode_to_file(
      %{"name" => "developers", "pain" => "manual app building"},
      Path.join([map_dir, "problem", "audience.yaml"])
    )

    Bropilot.Yaml.encode_to_file(
      %{"statement" => "Building apps is tedious"},
      Path.join([map_dir, "problem", "problem.yaml"])
    )

    Bropilot.Yaml.encode_to_file(
      %{"terms" => ["spec", "pipeline", "snapshot"]},
      Path.join([map_dir, "solution", "vocabulary.yaml"])
    )

    Bropilot.Yaml.encode_to_file(
      %{"endpoints" => [%{"path" => "/api/v1/projects", "method" => "GET"}]},
      Path.join([map_dir, "solution", "specs", "api.yaml"])
    )
  end

  describe "Executor.run/2" do
    test "creates snapshot, generates plan, creates tasks", %{map_dir: map_dir} do
      populate_map(map_dir)

      assert {:ok, result} = Executor.run(map_dir, map_dir: map_dir)

      assert result.version == 1
      assert is_list(result.tasks)
      assert length(result.tasks) > 0
      assert is_map(result.summary)

      # Snapshot was created
      assert {:ok, _snap} = Snapshot.read_snapshot(map_dir, 1)

      # Tasks were written
      tasks_dir = Path.join([map_dir, "work", "versions", "v001", "tasks"])
      assert File.dir?(tasks_dir)
    end

    test "after run, knowledge/changelog.yaml has entries", %{map_dir: map_dir} do
      populate_map(map_dir)

      {:ok, _result} = Executor.run(map_dir, map_dir: map_dir)

      assert File.exists?(Feedback.changelog_path(map_dir))
      {:ok, data} = Bropilot.Yaml.decode_file(Feedback.changelog_path(map_dir))
      assert length(data["entries"]) > 0
    end

    test "after run, knowledge/xrefs.yaml exists", %{map_dir: map_dir} do
      populate_map(map_dir)

      {:ok, _result} = Executor.run(map_dir, map_dir: map_dir)

      assert File.exists?(Feedback.xrefs_path(map_dir))
      {:ok, data} = Bropilot.Yaml.decode_file(Feedback.xrefs_path(map_dir))
      assert is_list(data["xrefs"])
      assert length(data["xrefs"]) > 0
    end

    test "after run, version summary is written", %{map_dir: map_dir} do
      populate_map(map_dir)

      {:ok, result} = Executor.run(map_dir, map_dir: map_dir)

      assert result.summary["version"] == 1
      assert result.summary["tasks_completed"] > 0

      summary_path = Path.join([map_dir, "knowledge", "version_summary.yaml"])
      assert File.exists?(summary_path)
    end

    test "multiple runs increment versions and accumulate knowledge", %{map_dir: map_dir} do
      populate_map(map_dir)

      {:ok, r1} = Executor.run(map_dir, map_dir: map_dir)
      assert r1.version == 1

      # Modify the map for a second run
      Bropilot.Yaml.encode_to_file(
        %{"name" => "designers", "pain" => "complex tools"},
        Path.join([map_dir, "problem", "audience.yaml"])
      )

      {:ok, r2} = Executor.run(map_dir, map_dir: map_dir)
      assert r2.version == 2

      # Changelog should have entries from both runs
      {:ok, cl} = Bropilot.Yaml.decode_file(Feedback.changelog_path(map_dir))
      assert length(cl["entries"]) > length(r1.tasks)
    end

    test "accepts simulate_results option", %{map_dir: map_dir} do
      populate_map(map_dir)

      custom_result = fn _task -> {:ok, "custom output"} end

      {:ok, _result} = Executor.run(map_dir, map_dir: map_dir, simulate_results: custom_result)

      {:ok, cl} = Bropilot.Yaml.decode_file(Feedback.changelog_path(map_dir))
      assert Enum.all?(cl["entries"], &(&1["status"] == "completed"))
    end
  end

  describe "Executor.run_step/3" do
    test "step 5 / :snapshot creates a snapshot", %{map_dir: map_dir} do
      populate_map(map_dir)

      assert {:ok, 1} = Executor.run_step(map_dir, :snapshot, map_dir: map_dir)
      assert {:ok, _snap} = Snapshot.read_snapshot(map_dir, 1)
    end

    test "step 6 / :diff generates change plan", %{map_dir: map_dir} do
      populate_map(map_dir)
      {:ok, 1} = Snapshot.create_snapshot(map_dir)

      assert {:ok, changes} = Executor.run_step(map_dir, :diff, map_dir: map_dir, version: 1)
      assert is_list(changes)
      assert length(changes) > 0
    end

    test "step 7 / :tasks generates tasks", %{map_dir: map_dir} do
      populate_map(map_dir)
      {:ok, 1} = Snapshot.create_snapshot(map_dir)

      assert {:ok, tasks} = Executor.run_step(map_dir, :tasks, map_dir: map_dir, version: 1)
      assert is_list(tasks)
      assert length(tasks) > 0
    end

    test "step 8 / :feedback updates knowledge", %{map_dir: map_dir} do
      task = %{
        "id" => "task-001",
        "title" => "Test task",
        "description" => "A test",
        "related_specs" => ["solution.specs.test"],
        "version" => 1
      }

      assert :ok =
               Executor.run_step(map_dir, :feedback,
                 map_dir: map_dir,
                 task: task,
                 result: {:ok, "done"}
               )

      assert File.exists?(Feedback.changelog_path(map_dir))
    end

    test "step numbers (5,6,7,8) work same as atoms", %{map_dir: map_dir} do
      populate_map(map_dir)

      assert {:ok, 1} = Executor.run_step(map_dir, 5, map_dir: map_dir)

      assert {:ok, changes} = Executor.run_step(map_dir, 6, map_dir: map_dir, version: 1)
      assert is_list(changes)
    end
  end
end

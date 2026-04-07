defmodule Bropilot.Act3Test do
  use ExUnit.Case

  alias Bropilot.Pipeline.Act3.Snapshot
  alias Bropilot.Pipeline.Act3.Diff
  alias Bropilot.Pipeline.Act3.TaskGenerator

  setup do
    tmp = System.tmp_dir!() |> Path.join("bropilot_act3_test_#{:rand.uniform(100_000)}")
    map_dir = tmp
    File.mkdir_p!(Path.join([map_dir, "problem"]))
    File.mkdir_p!(Path.join([map_dir, "solution", "specs"]))
    File.mkdir_p!(Path.join([map_dir, "work", "versions"]))
    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, map_dir: map_dir}
  end

  # -- Helper --

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

  # -- Snapshot Tests --

  describe "Snapshot.create_snapshot/1" do
    test "reads map files and writes snapshot", %{map_dir: map_dir} do
      populate_map(map_dir)

      assert {:ok, 1} = Snapshot.create_snapshot(map_dir)

      {:ok, snapshot} = Snapshot.read_snapshot(map_dir, 1)
      assert snapshot["problem"]["audience"]["name"] == "developers"
      assert snapshot["problem"]["problem"]["statement"] == "Building apps is tedious"
      assert snapshot["solution"]["vocabulary"]["terms"] == ["spec", "pipeline", "snapshot"]
      assert snapshot["solution"]["specs"]["api"]["endpoints"] != nil
    end

    test "increments version number", %{map_dir: map_dir} do
      populate_map(map_dir)

      assert {:ok, 1} = Snapshot.create_snapshot(map_dir)
      assert {:ok, 2} = Snapshot.create_snapshot(map_dir)
      assert {:ok, 3} = Snapshot.create_snapshot(map_dir)
    end

    test "creates zero-padded version directories", %{map_dir: map_dir} do
      populate_map(map_dir)

      {:ok, 1} = Snapshot.create_snapshot(map_dir)

      assert File.dir?(Path.join([map_dir, "work", "versions", "v001"]))
      assert File.exists?(Path.join([map_dir, "work", "versions", "v001", "snapshot.yaml"]))
    end
  end

  describe "Snapshot.latest_version/1" do
    test "returns 0 when no versions exist", %{map_dir: map_dir} do
      assert Snapshot.latest_version(map_dir) == 0
    end

    test "returns correct version after snapshots", %{map_dir: map_dir} do
      populate_map(map_dir)

      Snapshot.create_snapshot(map_dir)
      assert Snapshot.latest_version(map_dir) == 1

      Snapshot.create_snapshot(map_dir)
      assert Snapshot.latest_version(map_dir) == 2
    end
  end

  describe "Snapshot.list_versions/1" do
    test "returns empty list when no versions", %{map_dir: map_dir} do
      assert Snapshot.list_versions(map_dir) == []
    end

    test "returns sorted version numbers", %{map_dir: map_dir} do
      populate_map(map_dir)

      Snapshot.create_snapshot(map_dir)
      Snapshot.create_snapshot(map_dir)
      Snapshot.create_snapshot(map_dir)

      assert Snapshot.list_versions(map_dir) == [1, 2, 3]
    end
  end

  # -- Diff Tests --

  describe "Diff.diff/2" do
    test "detects additions" do
      old = %{}
      new = %{"problem" => %{"audience" => %{"name" => "devs"}}}

      changes = Diff.diff(old, new)

      assert length(changes) == 1
      assert hd(changes).type == :added
      assert hd(changes).path == "problem"
    end

    test "detects modifications" do
      old = %{"problem" => %{"audience" => %{"name" => "devs"}}}
      new = %{"problem" => %{"audience" => %{"name" => "designers"}}}

      changes = Diff.diff(old, new)

      assert length(changes) == 1
      change = hd(changes)
      assert change.type == :modified
      assert change.path == "problem.audience.name"
      assert change.old_value == "devs"
      assert change.new_value == "designers"
    end

    test "detects removals" do
      old = %{"problem" => %{"audience" => %{"name" => "devs"}}}
      new = %{"problem" => %{}}

      changes = Diff.diff(old, new)

      assert length(changes) == 1
      change = hd(changes)
      assert change.type == :removed
      assert change.path == "problem.audience"
    end

    test "returns empty list for identical snapshots" do
      snapshot = %{
        "problem" => %{"audience" => %{"name" => "devs"}},
        "solution" => %{"vocabulary" => %{"terms" => ["a", "b"]}}
      }

      assert Diff.diff(snapshot, snapshot) == []
    end

    test "detects multiple changes" do
      old = %{
        "problem" => %{"audience" => %{"name" => "devs"}},
        "solution" => %{"vocabulary" => %{"terms" => ["a"]}}
      }

      new = %{
        "problem" => %{"audience" => %{"name" => "designers"}},
        "solution" => %{
          "vocabulary" => %{"terms" => ["a", "b"]},
          "specs" => %{"api" => %{"version" => "1"}}
        }
      }

      changes = Diff.diff(old, new)

      types = Enum.map(changes, & &1.type)
      assert :modified in types
      assert :added in types
    end

    test "detects list element changes" do
      old = %{"items" => ["a", "b", "c"]}
      new = %{"items" => ["a", "x", "c"]}

      changes = Diff.diff(old, new)

      assert length(changes) == 1
      change = hd(changes)
      assert change.type == :modified
      assert change.path == "items.1"
      assert change.old_value == "b"
      assert change.new_value == "x"
    end
  end

  describe "Diff.generate_change_plan/2" do
    test "writes changes.yaml for v001 against empty", %{map_dir: map_dir} do
      populate_map(map_dir)
      {:ok, 1} = Snapshot.create_snapshot(map_dir)

      assert {:ok, changes} = Diff.generate_change_plan(map_dir, 1)
      assert length(changes) > 0

      changes_path = Path.join([map_dir, "work", "versions", "v001", "changes.yaml"])
      assert File.exists?(changes_path)

      {:ok, data} = Bropilot.Yaml.decode_file(changes_path)
      assert is_list(data["changes"])
      assert length(data["changes"]) > 0
    end

    test "diffs v002 against v001", %{map_dir: map_dir} do
      populate_map(map_dir)
      {:ok, 1} = Snapshot.create_snapshot(map_dir)

      # Modify the map
      Bropilot.Yaml.encode_to_file(
        %{"name" => "designers", "pain" => "complex tools"},
        Path.join([map_dir, "problem", "audience.yaml"])
      )

      {:ok, 2} = Snapshot.create_snapshot(map_dir)

      assert {:ok, changes} = Diff.generate_change_plan(map_dir, 2)
      assert length(changes) > 0

      paths = Enum.map(changes, & &1.path)
      assert Enum.any?(paths, &String.starts_with?(&1, "problem.audience"))
    end
  end

  describe "Diff.summarize/1" do
    test "returns correct counts" do
      changes = [
        %{path: "problem.audience", type: :added, old_value: nil, new_value: %{}},
        %{path: "problem.context", type: :added, old_value: nil, new_value: %{}},
        %{path: "solution.vocab", type: :modified, old_value: "a", new_value: "b"},
        %{path: "solution.specs", type: :removed, old_value: %{}, new_value: nil}
      ]

      summary = Diff.summarize(changes)

      assert summary.added == 2
      assert summary.modified == 1
      assert summary.removed == 1
      assert summary.by_space == %{"problem" => 2, "solution" => 2}
    end

    test "returns zeros for empty changes" do
      summary = Diff.summarize([])

      assert summary.added == 0
      assert summary.modified == 0
      assert summary.removed == 0
      assert summary.by_space == %{}
    end
  end

  # -- TaskGenerator Tests --

  describe "TaskGenerator.generate_tasks/2" do
    test "creates tasks from changes" do
      changes = [
        %{path: "solution.specs.api", type: :added, old_value: nil, new_value: %{"v" => 1}},
        %{path: "problem.audience.name", type: :modified, old_value: "a", new_value: "b"}
      ]

      tasks = TaskGenerator.generate_tasks(changes)

      assert length(tasks) == 2

      first = Enum.find(tasks, &(&1.id == 1))
      assert first.title == "Implement solution.specs.api"
      assert first.status == :pending
      assert first.priority == :high
      assert is_list(first.definition_of_done)
      assert length(first.definition_of_done) > 0
      assert first.related_specs == ["solution.specs.api"]

      second = Enum.find(tasks, &(&1.id == 2))
      assert second.title == "Update problem.audience.name"
      assert second.priority == :medium
    end

    test "handles removal changes" do
      changes = [
        %{path: "solution.old_spec", type: :removed, old_value: %{"x" => 1}, new_value: nil}
      ]

      [task] = TaskGenerator.generate_tasks(changes)

      assert task.title == "Remove solution.old_spec"
      assert task.priority == :low
      assert task.context == %{"x" => 1}
    end
  end

  describe "TaskGenerator.write_tasks/3 and read_tasks/2" do
    test "writes and reads task files", %{map_dir: map_dir} do
      populate_map(map_dir)
      {:ok, 1} = Snapshot.create_snapshot(map_dir)

      tasks = [
        %{
          id: 1,
          title: "Implement API",
          description: "Build the API endpoint",
          context: %{"endpoint" => "/api"},
          definition_of_done: ["Tests pass"],
          dependencies: [],
          priority: :high,
          related_specs: ["solution.specs.api"],
          status: :pending
        },
        %{
          id: 2,
          title: "Update audience",
          description: "Update audience data",
          context: %{"name" => "devs"},
          definition_of_done: ["Spec matches"],
          dependencies: [],
          priority: :medium,
          related_specs: ["problem.audience"],
          status: :pending
        }
      ]

      assert :ok = TaskGenerator.write_tasks(tasks, map_dir, 1)

      tasks_dir = Path.join([map_dir, "work", "versions", "v001", "tasks"])
      assert File.exists?(Path.join(tasks_dir, "task-001.yaml"))
      assert File.exists?(Path.join(tasks_dir, "task-002.yaml"))

      {:ok, read_tasks} = TaskGenerator.read_tasks(map_dir, 1)
      assert length(read_tasks) == 2
      assert Enum.find(read_tasks, &(&1.id == 1)).title == "Implement API"
      assert Enum.find(read_tasks, &(&1.id == 2)).title == "Update audience"
    end
  end

  # -- Full Flow Test --

  describe "full flow" do
    test "populate map -> snapshot -> modify -> snapshot -> diff -> tasks", %{map_dir: map_dir} do
      # Step 1: Populate initial map
      populate_map(map_dir)

      # Step 2: Create first snapshot
      {:ok, 1} = Snapshot.create_snapshot(map_dir)
      {:ok, snap1} = Snapshot.read_snapshot(map_dir, 1)
      assert snap1["problem"]["audience"]["name"] == "developers"

      # Step 3: Generate change plan for v1 (against empty)
      {:ok, v1_changes} = Diff.generate_change_plan(map_dir, 1)
      assert length(v1_changes) > 0

      # All changes in v1 should be additions
      assert Enum.all?(v1_changes, &(&1.type == :added))

      # Step 4: Modify the map
      Bropilot.Yaml.encode_to_file(
        %{"name" => "product managers", "pain" => "no visibility"},
        Path.join([map_dir, "problem", "audience.yaml"])
      )

      # Add a new spec
      File.mkdir_p!(Path.join([map_dir, "solution", "specs"]))

      Bropilot.Yaml.encode_to_file(
        %{"schema" => "user", "fields" => ["id", "name", "email"]},
        Path.join([map_dir, "solution", "specs", "models.yaml"])
      )

      # Step 5: Create second snapshot
      {:ok, 2} = Snapshot.create_snapshot(map_dir)
      {:ok, snap2} = Snapshot.read_snapshot(map_dir, 2)
      assert snap2["problem"]["audience"]["name"] == "product managers"
      assert snap2["solution"]["specs"]["models"] != nil

      # Step 6: Generate change plan for v2
      {:ok, v2_changes} = Diff.generate_change_plan(map_dir, 2)
      assert length(v2_changes) > 0

      types = Enum.map(v2_changes, & &1.type) |> Enum.uniq()
      assert :modified in types or :added in types

      # Step 7: Summarize changes
      summary = Diff.summarize(v2_changes)
      assert summary.added + summary.modified + summary.removed == length(v2_changes)

      # Step 8: Generate and write tasks
      tasks = TaskGenerator.generate_tasks(v2_changes)
      assert length(tasks) > 0
      assert Enum.all?(tasks, &(&1.status == :pending))

      :ok = TaskGenerator.write_tasks(tasks, map_dir, 2)

      {:ok, read_tasks} = TaskGenerator.read_tasks(map_dir, 2)
      assert length(read_tasks) == length(tasks)

      # Verify versions
      assert Snapshot.list_versions(map_dir) == [1, 2]
      assert Snapshot.latest_version(map_dir) == 2
    end
  end
end

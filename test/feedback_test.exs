defmodule Bropilot.FeedbackTest do
  use ExUnit.Case

  alias Bropilot.Pipeline.Feedback

  setup do
    tmp = System.tmp_dir!() |> Path.join("bropilot_feedback_test_#{:rand.uniform(100_000)}")
    File.mkdir_p!(Path.join(tmp, "knowledge"))
    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, map_dir: tmp}
  end

  @sample_task %{
    "id" => "task-001",
    "title" => "Create User model",
    "description" => "Implement the User entity with authentication fields.",
    "context" => %{"endpoint" => "/api/users"},
    "definition_of_done" => [
      "User schema created",
      "Migration generated",
      "Tests pass"
    ],
    "related_specs" => ["solution.specs.user", "solution.specs.auth"],
    "status" => "pending",
    "version" => 1
  }

  describe "update_changelog/2" do
    test "appends entries with ISO 8601 timestamps", %{map_dir: map_dir} do
      entry = %{
        "task_id" => "task-001",
        "title" => "Create User model",
        "timestamp" => DateTime.utc_now() |> DateTime.to_iso8601(),
        "files_touched" => ["lib/user.ex"],
        "status" => "completed"
      }

      Feedback.update_changelog(map_dir, entry)

      {:ok, data} = Bropilot.Yaml.decode_file(Feedback.changelog_path(map_dir))
      assert length(data["entries"]) == 1
      assert hd(data["entries"])["task_id"] == "task-001"

      # Verify ISO 8601 format
      ts = hd(data["entries"])["timestamp"]
      assert {:ok, _, _} = DateTime.from_iso8601(ts)
    end

    test "multiple entries accumulate correctly", %{map_dir: map_dir} do
      entry1 = %{
        "task_id" => "task-001",
        "title" => "First task",
        "timestamp" => DateTime.utc_now() |> DateTime.to_iso8601(),
        "files_touched" => ["lib/a.ex"],
        "status" => "completed"
      }

      entry2 = %{
        "task_id" => "task-002",
        "title" => "Second task",
        "timestamp" => DateTime.utc_now() |> DateTime.to_iso8601(),
        "files_touched" => ["lib/b.ex"],
        "status" => "completed"
      }

      entry3 = %{
        "task_id" => "task-003",
        "title" => "Third task",
        "timestamp" => DateTime.utc_now() |> DateTime.to_iso8601(),
        "files_touched" => ["lib/c.ex"],
        "status" => "failed"
      }

      Feedback.update_changelog(map_dir, entry1)
      Feedback.update_changelog(map_dir, entry2)
      Feedback.update_changelog(map_dir, entry3)

      {:ok, data} = Bropilot.Yaml.decode_file(Feedback.changelog_path(map_dir))
      assert length(data["entries"]) == 3
      ids = Enum.map(data["entries"], & &1["task_id"])
      assert ids == ["task-001", "task-002", "task-003"]
    end
  end

  describe "update_xrefs/2" do
    test "creates mappings from specs to artifacts", %{map_dir: map_dir} do
      Feedback.update_xrefs(map_dir, @sample_task)

      {:ok, data} = Bropilot.Yaml.decode_file(Feedback.xrefs_path(map_dir))
      xrefs = data["xrefs"]
      assert length(xrefs) == 2

      first = Enum.find(xrefs, &(&1["spec_path"] == "solution.specs.user"))
      assert first["term"] == "Create User model"
      assert is_binary(first["artifact_path"])

      second = Enum.find(xrefs, &(&1["spec_path"] == "solution.specs.auth"))
      assert second["term"] == "Create User model"
    end

    test "deduplicates xrefs by {term, spec_path, artifact_path}", %{map_dir: map_dir} do
      Feedback.update_xrefs(map_dir, @sample_task)
      Feedback.update_xrefs(map_dir, @sample_task)

      {:ok, data} = Bropilot.Yaml.decode_file(Feedback.xrefs_path(map_dir))
      assert length(data["xrefs"]) == 2
    end
  end

  describe "update_glossary/2" do
    test "appends new terms", %{map_dir: map_dir} do
      terms = [
        %{"term" => "User", "definition" => "A person using the system"},
        %{"term" => "Auth", "definition" => "Authentication subsystem"}
      ]

      Feedback.update_glossary(map_dir, terms)

      {:ok, data} = Bropilot.Yaml.decode_file(Feedback.glossary_path(map_dir))
      assert length(data["terms"]) == 2
      names = Enum.map(data["terms"], & &1["term"])
      assert "Auth" in names
      assert "User" in names
    end

    test "deduplicates terms by name, keeping latest definition", %{map_dir: map_dir} do
      terms1 = [
        %{"term" => "User", "definition" => "Original definition"},
        %{"term" => "Auth", "definition" => "Auth v1"}
      ]

      terms2 = [
        %{"term" => "User", "definition" => "Updated definition"},
        %{"term" => "API", "definition" => "Application Programming Interface"}
      ]

      Feedback.update_glossary(map_dir, terms1)
      Feedback.update_glossary(map_dir, terms2)

      {:ok, data} = Bropilot.Yaml.decode_file(Feedback.glossary_path(map_dir))
      assert length(data["terms"]) == 3

      user_term = Enum.find(data["terms"], &(&1["term"] == "User"))
      assert user_term["definition"] == "Updated definition"
    end
  end

  describe "update_knowledge/3" do
    test "updates all three knowledge files", %{map_dir: map_dir} do
      result = {:ok, "codegen output"}

      Feedback.update_knowledge(map_dir, @sample_task, result)

      # Changelog was updated
      assert File.exists?(Feedback.changelog_path(map_dir))
      {:ok, cl} = Bropilot.Yaml.decode_file(Feedback.changelog_path(map_dir))
      assert length(cl["entries"]) == 1
      assert hd(cl["entries"])["task_id"] == "task-001"
      assert hd(cl["entries"])["status"] == "completed"

      # Xrefs were updated
      assert File.exists?(Feedback.xrefs_path(map_dir))
      {:ok, xr} = Bropilot.Yaml.decode_file(Feedback.xrefs_path(map_dir))
      assert length(xr["xrefs"]) == 2

      # Glossary was updated
      assert File.exists?(Feedback.glossary_path(map_dir))
      {:ok, gl} = Bropilot.Yaml.decode_file(Feedback.glossary_path(map_dir))
      assert length(gl["terms"]) > 0
    end

    test "records failed status for error results", %{map_dir: map_dir} do
      result = {:error, "something went wrong"}

      Feedback.update_knowledge(map_dir, @sample_task, result)

      {:ok, cl} = Bropilot.Yaml.decode_file(Feedback.changelog_path(map_dir))
      assert hd(cl["entries"])["status"] == "failed"
    end
  end

  describe "summarize_version/2" do
    test "produces correct stats", %{map_dir: map_dir} do
      # Add two changelog entries for version 1
      entry1 = %{
        "task_id" => "task-001",
        "title" => "Create User model",
        "timestamp" => DateTime.utc_now() |> DateTime.to_iso8601(),
        "files_touched" => ["lib/user.ex"],
        "status" => "completed",
        "version" => 1,
        "related_specs" => ["solution.specs.user"]
      }

      entry2 = %{
        "task_id" => "task-002",
        "title" => "Create Auth module",
        "timestamp" => DateTime.utc_now() |> DateTime.to_iso8601(),
        "files_touched" => ["lib/auth.ex"],
        "status" => "completed",
        "version" => 1,
        "related_specs" => ["solution.specs.auth"]
      }

      Feedback.update_changelog(map_dir, entry1)
      Feedback.update_changelog(map_dir, entry2)

      # Add xrefs
      xref_task = %{
        "id" => "task-001",
        "title" => "Create User model",
        "related_specs" => ["solution.specs.user"],
        "context" => %{"files" => ["lib/user.ex"]}
      }

      Feedback.update_xrefs(map_dir, xref_task)

      {:ok, summary} = Feedback.summarize_version(map_dir, 1)

      assert summary["version"] == 1
      assert summary["tasks_completed"] == 2
      assert summary["artifacts_produced"] >= 1
      assert summary["specs_implemented"] == 2

      # Verify ISO 8601 timestamp
      assert {:ok, _, _} = DateTime.from_iso8601(summary["timestamp"])

      # Verify file was written
      summary_path = Path.join([map_dir, "knowledge", "version_summary.yaml"])
      assert File.exists?(summary_path)
    end

    test "handles empty version with zero stats", %{map_dir: map_dir} do
      {:ok, summary} = Feedback.summarize_version(map_dir, 99)

      assert summary["tasks_completed"] == 0
      assert summary["artifacts_produced"] == 0
      assert summary["specs_implemented"] == 0
    end
  end

  describe "full flow: task completes -> knowledge space updated" do
    test "complete feedback loop", %{map_dir: map_dir} do
      task1 = %{
        "id" => "task-001",
        "title" => "Implement API endpoint",
        "description" => "Build the REST API for users.",
        "context" => %{"endpoint" => "/api/users"},
        "related_specs" => ["solution.specs.api"],
        "version" => 1
      }

      task2 = %{
        "id" => "task-002",
        "title" => "Add database schema",
        "description" => "Create the user table schema.",
        "context" => %{"files" => ["priv/migrations/001.exs"]},
        "related_specs" => ["solution.specs.schema"],
        "version" => 1
      }

      # Simulate completing both tasks
      Feedback.update_knowledge(map_dir, task1, {:ok, "api code"})
      Feedback.update_knowledge(map_dir, task2, {:ok, "schema code"})

      # Changelog has both entries
      {:ok, cl} = Bropilot.Yaml.decode_file(Feedback.changelog_path(map_dir))
      assert length(cl["entries"]) == 2

      # Xrefs has entries for both specs
      {:ok, xr} = Bropilot.Yaml.decode_file(Feedback.xrefs_path(map_dir))
      spec_paths = Enum.map(xr["xrefs"], & &1["spec_path"])
      assert "solution.specs.api" in spec_paths
      assert "solution.specs.schema" in spec_paths

      # Glossary has terms from both tasks
      {:ok, gl} = Bropilot.Yaml.decode_file(Feedback.glossary_path(map_dir))
      assert length(gl["terms"]) > 0

      # Summarize version
      {:ok, summary} = Feedback.summarize_version(map_dir, 1)
      assert summary["tasks_completed"] == 2
      assert summary["specs_implemented"] == 2
    end
  end
end

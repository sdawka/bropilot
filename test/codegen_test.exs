defmodule Bropilot.CodegenTest do
  use ExUnit.Case

  alias Bropilot.Task.Agent
  alias Bropilot.Pipeline.Act3.Executor
  alias Bropilot.Pipeline.Feedback

  setup do
    tmp = System.tmp_dir!() |> Path.join("bropilot_codegen_test_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)

    project_path = Path.join(tmp, "project")
    File.mkdir_p!(project_path)

    bropilot_dir = Path.join(project_path, ".bropilot")
    map_dir = Path.join(bropilot_dir, "map")
    File.mkdir_p!(Path.join([map_dir, "problem"]))
    File.mkdir_p!(Path.join([map_dir, "solution", "specs"]))
    File.mkdir_p!(Path.join([map_dir, "work", "versions"]))
    File.mkdir_p!(Path.join([map_dir, "knowledge"]))

    # Also create recipe dir so project is considered initialized
    File.mkdir_p!(Path.join(bropilot_dir, "recipe"))

    on_exit(fn -> File.rm_rf!(tmp) end)

    {:ok,
     tmp: tmp,
     project_path: project_path,
     bropilot_dir: bropilot_dir,
     map_dir: map_dir}
  end

  # -- Helper to build an LLM response containing file blocks --

  defp llm_response_with_files do
    """
    Here are the generated files:

    ```file:lib/app/user.ex
    defmodule App.User do
      defstruct [:id, :name, :email]
    end
    ```

    ```file:lib/app/user_service.ex
    defmodule App.UserService do
      alias App.User

      def create(attrs) do
        %User{id: 1, name: attrs[:name], email: attrs[:email]}
      end
    end
    ```

    ```file:test/app/user_test.exs
    defmodule App.UserTest do
      use ExUnit.Case
      alias App.User

      test "creates user struct" do
        user = %User{id: 1, name: "Alice", email: "alice@example.com"}
        assert user.name == "Alice"
      end
    end
    ```
    """
  end

  defp llm_response_with_nested_dirs do
    """
    ```file:lib/app/deeply/nested/module.ex
    defmodule App.Deeply.Nested.Module do
      def hello, do: "world"
    end
    ```
    """
  end

  defp malformed_llm_response do
    "I'm sorry, I can't generate code right now. Please try again later."
  end

  # -- Path traversal tests --

  describe "Bropilot.Codegen.Writer.validate_path/2" do
    test "accepts safe relative paths" do
      assert :ok = Bropilot.Codegen.Writer.validate_path("lib/app/user.ex", "/tmp/output")
    end

    test "accepts nested safe paths" do
      assert :ok = Bropilot.Codegen.Writer.validate_path("lib/app/deeply/nested/module.ex", "/tmp/output")
    end

    test "rejects path with ../ traversal" do
      assert {:error, {:path_traversal, msg}} =
               Bropilot.Codegen.Writer.validate_path("../../../etc/passwd", "/tmp/output")

      assert String.contains?(msg, "resolves outside output directory")
    end

    test "rejects path with embedded ../ traversal" do
      assert {:error, {:path_traversal, _}} =
               Bropilot.Codegen.Writer.validate_path("lib/../../outside.ex", "/tmp/output")
    end

    test "rejects path that resolves to the output dir itself (not a subpath)" do
      # Path.join("/tmp/output", ".") resolves to "/tmp/output" which is not under "/tmp/output/"
      assert {:error, {:path_traversal, _}} =
               Bropilot.Codegen.Writer.validate_path(".", "/tmp/output")
    end
  end

  describe "Bropilot.Codegen.Writer.write_files/2 path traversal" do
    test "rejects files with path traversal", %{tmp: tmp} do
      output_dir = Path.join(tmp, "output")
      files = [{"../../../etc/passwd", "malicious content"}]

      assert {:error, {:path_traversal, msg}} =
               Bropilot.Codegen.Writer.write_files(files, output_dir)

      assert String.contains?(msg, "resolves outside output directory")
      # No files should have been written
      refute File.exists?(Path.join(output_dir, "../../../etc/passwd"))
    end

    test "rejects mixed files when one has path traversal", %{tmp: tmp} do
      output_dir = Path.join(tmp, "output")

      files = [
        {"lib/safe.ex", "safe content"},
        {"../../escape.ex", "malicious content"}
      ]

      assert {:error, {:path_traversal, _}} =
               Bropilot.Codegen.Writer.write_files(files, output_dir)

      # Neither file should have been written (validation happens before any writes)
      refute File.dir?(output_dir)
    end
  end

  describe "Bropilot.Codegen.Writer.parse_and_write/2 path traversal" do
    test "rejects LLM response containing path traversal", %{tmp: tmp} do
      output_dir = Path.join(tmp, "output")

      response = """
      ```file:../../../etc/passwd
      root:x:0:0
      ```
      """

      assert {:error, {:path_traversal, _}} =
               Bropilot.Codegen.Writer.parse_and_write(response, output_dir)
    end
  end

  # -- CodegenWriter Tests --

  describe "Bropilot.Codegen.Writer.parse_files/1" do
    test "parses multiple file blocks from LLM response" do
      files = Bropilot.Codegen.Writer.parse_files(llm_response_with_files())
      assert length(files) == 3

      paths = Enum.map(files, fn {path, _content} -> path end)
      assert "lib/app/user.ex" in paths
      assert "lib/app/user_service.ex" in paths
      assert "test/app/user_test.exs" in paths
    end

    test "returns empty list for response with no file blocks" do
      files = Bropilot.Codegen.Writer.parse_files(malformed_llm_response())
      assert files == []
    end

    test "handles response with nested directory paths" do
      files = Bropilot.Codegen.Writer.parse_files(llm_response_with_nested_dirs())
      assert length(files) == 1
      [{path, _content}] = files
      assert path == "lib/app/deeply/nested/module.ex"
    end
  end

  describe "Bropilot.Codegen.Writer.write_files/2" do
    test "writes parsed files to output directory", %{tmp: tmp} do
      output_dir = Path.join(tmp, "output")
      files = Bropilot.Codegen.Writer.parse_files(llm_response_with_files())

      {:ok, written} = Bropilot.Codegen.Writer.write_files(files, output_dir)

      assert length(written) == 3
      assert File.exists?(Path.join(output_dir, "lib/app/user.ex"))
      assert File.exists?(Path.join(output_dir, "lib/app/user_service.ex"))
      assert File.exists?(Path.join(output_dir, "test/app/user_test.exs"))

      # Verify content
      {:ok, content} = File.read(Path.join(output_dir, "lib/app/user.ex"))
      assert String.contains?(content, "defmodule App.User")
    end

    test "creates intermediate directories (mkdir -p)", %{tmp: tmp} do
      output_dir = Path.join(tmp, "output")
      files = Bropilot.Codegen.Writer.parse_files(llm_response_with_nested_dirs())

      {:ok, written} = Bropilot.Codegen.Writer.write_files(files, output_dir)

      assert length(written) == 1
      path = Path.join(output_dir, "lib/app/deeply/nested/module.ex")
      assert File.exists?(path)
    end

    test "returns error for empty file list", %{tmp: tmp} do
      output_dir = Path.join(tmp, "output")
      assert {:error, :no_files} = Bropilot.Codegen.Writer.write_files([], output_dir)
    end
  end

  # -- Task.Agent with :llm mode and file writing --

  describe "Task.Agent with execution_mode :llm writes files" do
    test "writes files to output dir after LLM execution", %{project_path: project_path, map_dir: map_dir} do
      task = %{
        "id" => "task-codegen-001",
        "title" => "Create User module",
        "description" => "Implement User struct",
        "context" => "",
        "definition_of_done" => ["User struct created"],
        "dependencies" => [],
        "priority" => "high",
        "related_specs" => ["entities.user"],
        "status" => "pending"
      }

      response_fn = fn _messages, _opts -> {:ok, llm_response_with_files()} end

      {:ok, pid} =
        Agent.start_link(task,
          execution_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_fn],
          map_dir: map_dir,
          project_path: project_path
        )

      result = Agent.execute(pid)
      assert {:ok, _} = result

      # Verify files were written to project_path/output/task-codegen-001/
      output_dir = Path.join([project_path, "output", "task-codegen-001"])
      assert File.exists?(Path.join(output_dir, "lib/app/user.ex"))
      assert File.exists?(Path.join(output_dir, "lib/app/user_service.ex"))

      # Status should be completed
      assert Agent.get_status(pid) == :completed

      GenServer.stop(pid)
    end

    test "sets status to :failed when LLM call fails", %{project_path: project_path, map_dir: map_dir} do
      task = %{
        "id" => "task-fail-001",
        "title" => "Failing task",
        "description" => "This will fail",
        "context" => "",
        "definition_of_done" => ["Should fail"],
        "dependencies" => [],
        "priority" => "high",
        "related_specs" => [],
        "status" => "pending"
      }

      response_fn = fn _messages, _opts -> {:error, "API key invalid"} end

      {:ok, pid} =
        Agent.start_link(task,
          execution_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_fn],
          map_dir: map_dir,
          project_path: project_path
        )

      result = Agent.execute(pid)
      assert {:error, "API key invalid"} = result
      assert Agent.get_status(pid) == :failed

      # No partial files should exist
      output_dir = Path.join([project_path, "output", "task-fail-001"])
      refute File.dir?(output_dir)

      GenServer.stop(pid)
    end

    test "sets status to :failed when LLM returns malformed response (no file blocks)", %{
      project_path: project_path,
      map_dir: map_dir
    } do
      task = %{
        "id" => "task-malformed-001",
        "title" => "Malformed response task",
        "description" => "LLM returns no code blocks",
        "context" => "",
        "definition_of_done" => ["Should handle gracefully"],
        "dependencies" => [],
        "priority" => "high",
        "related_specs" => [],
        "status" => "pending"
      }

      response_fn = fn _messages, _opts -> {:ok, malformed_llm_response()} end

      {:ok, pid} =
        Agent.start_link(task,
          execution_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_fn],
          map_dir: map_dir,
          project_path: project_path
        )

      result = Agent.execute(pid)
      assert {:error, :no_files_generated} = result
      assert Agent.get_status(pid) == :failed

      GenServer.stop(pid)
    end

    test "records written files in task result", %{project_path: project_path, map_dir: map_dir} do
      task = %{
        "id" => "task-record-001",
        "title" => "Record files task",
        "description" => "Files should be recorded",
        "context" => "",
        "definition_of_done" => ["Files recorded"],
        "dependencies" => [],
        "priority" => "high",
        "related_specs" => ["api.init"],
        "status" => "pending"
      }

      response_fn = fn _messages, _opts -> {:ok, llm_response_with_files()} end

      {:ok, pid} =
        Agent.start_link(task,
          execution_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_fn],
          map_dir: map_dir,
          project_path: project_path
        )

      {:ok, result} = Agent.execute(pid)
      assert is_map(result)
      assert is_list(result.files_written)
      assert length(result.files_written) == 3
      assert "lib/app/user.ex" in result.files_written

      GenServer.stop(pid)
    end
  end

  # -- Multiple non-conflicting tasks --

  describe "multiple tasks write non-conflicting files" do
    test "two tasks produce separate output directories", %{project_path: project_path, map_dir: map_dir} do
      task_a = %{
        "id" => "task-a",
        "title" => "Task A",
        "description" => "Generates user module",
        "context" => "",
        "definition_of_done" => ["Done"],
        "dependencies" => [],
        "priority" => "high",
        "related_specs" => [],
        "status" => "pending"
      }

      task_b = %{
        "id" => "task-b",
        "title" => "Task B",
        "description" => "Generates auth module",
        "context" => "",
        "definition_of_done" => ["Done"],
        "dependencies" => [],
        "priority" => "high",
        "related_specs" => [],
        "status" => "pending"
      }

      response_a = fn _m, _o ->
        {:ok, "```file:lib/user.ex\ndefmodule User do\nend\n```"}
      end

      response_b = fn _m, _o ->
        {:ok, "```file:lib/auth.ex\ndefmodule Auth do\nend\n```"}
      end

      {:ok, pid_a} =
        Agent.start_link(task_a,
          execution_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_a],
          map_dir: map_dir,
          project_path: project_path
        )

      {:ok, pid_b} =
        Agent.start_link(task_b,
          execution_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_b],
          map_dir: map_dir,
          project_path: project_path
        )

      {:ok, _} = Agent.execute(pid_a)
      {:ok, _} = Agent.execute(pid_b)

      assert File.exists?(Path.join([project_path, "output", "task-a", "lib/user.ex"]))
      assert File.exists?(Path.join([project_path, "output", "task-b", "lib/auth.ex"]))

      # Ensure no cross-contamination
      refute File.exists?(Path.join([project_path, "output", "task-a", "lib/auth.ex"]))
      refute File.exists?(Path.join([project_path, "output", "task-b", "lib/user.ex"]))

      GenServer.stop(pid_a)
      GenServer.stop(pid_b)
    end
  end

  # -- Feedback records codegen artifacts --

  describe "Feedback records codegen artifacts" do
    test "update_knowledge records file paths from codegen result", %{map_dir: map_dir} do
      task = %{
        "id" => "task-cg-001",
        "title" => "Generate User CRUD",
        "description" => "Generate user module",
        "context" => %{
          "artifact_paths" => ["lib/app/user.ex", "lib/app/user_service.ex", "test/app/user_test.exs"]
        },
        "related_specs" => ["entities.user"],
        "version" => 1
      }

      codegen_result = {:ok, %{
        files_written: ["lib/app/user.ex", "lib/app/user_service.ex", "test/app/user_test.exs"],
        output_dir: "/tmp/output/task-cg-001"
      }}

      Feedback.update_knowledge(map_dir, task, codegen_result)

      # Changelog should have the entry
      {:ok, cl} = Bropilot.Yaml.decode_file(Feedback.changelog_path(map_dir))
      entry = hd(cl["entries"])
      assert entry["task_id"] == "task-cg-001"
      assert entry["status"] == "completed"
      assert is_list(entry["files_touched"])
      assert "lib/app/user.ex" in entry["files_touched"]
    end
  end

  # -- Codegen with no specs error --

  describe "codegen with no specs" do
    test "executor returns error when no spec files exist", %{project_path: project_path, map_dir: map_dir} do
      # Populate minimal map for snapshot (problem space only)
      Bropilot.Yaml.encode_to_file(
        %{"name" => "developers"},
        Path.join([map_dir, "problem", "audience.yaml"])
      )

      # Ensure solution/specs/ is empty
      specs_dir = Path.join([map_dir, "solution", "specs"])
      File.mkdir_p!(specs_dir)
      assert File.ls!(specs_dir) == []

      # Run executor — should return error about no specs
      result = Executor.run(project_path, map_dir: map_dir, execution_mode: :llm)

      assert {:error, reason} = result
      assert is_binary(reason)
      assert String.contains?(reason, "no specs")
    end

    test "executor returns error when specs directory doesn't exist", %{project_path: project_path, map_dir: map_dir} do
      # Populate minimal map for snapshot (problem space only)
      Bropilot.Yaml.encode_to_file(
        %{"name" => "developers"},
        Path.join([map_dir, "problem", "audience.yaml"])
      )

      # Remove specs dir entirely
      specs_dir = Path.join([map_dir, "solution", "specs"])
      File.rm_rf!(specs_dir)

      result = Executor.run(project_path, map_dir: map_dir, execution_mode: :llm)

      assert {:error, reason} = result
      assert is_binary(reason)
      assert String.contains?(reason, "no specs")
    end
  end

  # -- Pi backend integration --

  describe "Pi backend" do
    test "reports unavailable when pool is not started" do
      refute Bropilot.Codegen.PiBackend.available?()
    end

    test "execute returns error when pool is not started", %{tmp: tmp} do
      output_dir = Path.join(tmp, "pi_output")
      result = Bropilot.Codegen.PiBackend.execute("some prompt", output_dir)
      assert {:error, :pi_pool_unavailable} = result
    end

    test "Task.Agent with :pi mode falls back to :llm when pool unavailable", %{
      project_path: project_path,
      map_dir: map_dir
    } do
      task = %{
        "id" => "task-pi-fallback",
        "title" => "Pi fallback test",
        "description" => "Should fall back to LLM",
        "context" => "",
        "definition_of_done" => ["Done"],
        "dependencies" => [],
        "priority" => "high",
        "related_specs" => [],
        "status" => "pending"
      }

      response_fn = fn _m, _o ->
        {:ok, "```file:lib/fallback.ex\ndefmodule Fallback do\nend\n```"}
      end

      {:ok, pid} =
        Agent.start_link(task,
          execution_mode: :pi,
          llm_opts: [provider: :mock, response_fn: response_fn],
          map_dir: map_dir,
          project_path: project_path
        )

      # Should fall back to LLM and succeed
      {:ok, result} = Agent.execute(pid)
      assert is_map(result)
      assert "lib/fallback.ex" in result.files_written

      GenServer.stop(pid)
    end
  end

  # -- Executor with pi mode --

  describe "Executor with execution_mode :pi" do
    test "dispatches through Task.Agent and writes files (falls back to LLM when Pi pool unavailable)", %{
      project_path: project_path,
      map_dir: map_dir
    } do
      # Populate map with minimal data for snapshot+diff+tasks
      Bropilot.Yaml.encode_to_file(
        %{"name" => "developers", "pain" => "manual app building"},
        Path.join([map_dir, "problem", "audience.yaml"])
      )

      Bropilot.Yaml.encode_to_file(
        %{"endpoints" => [%{"path" => "/api/users", "method" => "GET"}]},
        Path.join([map_dir, "solution", "specs", "api.yaml"])
      )

      response_fn = fn _messages, _opts ->
        {:ok, "```file:lib/app/pi_users.ex\ndefmodule App.PiUsers do\n  def list, do: []\nend\n```"}
      end

      result =
        Executor.run(project_path,
          map_dir: map_dir,
          execution_mode: :pi,
          llm_opts: [provider: :mock, response_fn: response_fn]
        )

      assert {:ok, %{version: _, tasks: tasks, summary: _}} = result
      assert length(tasks) > 0

      # Verify files were written (pi falls back to llm since Pi.Pool isn't started)
      output_base = Path.join(project_path, "output")
      assert File.dir?(output_base)

      # At least one task output directory should contain files
      output_dirs = File.ls!(output_base)
      assert length(output_dirs) > 0
    end
  end

  # -- Executor with real codegen --

  describe "Executor with execution_mode :llm" do
    test "writes actual files via Task.Agent", %{project_path: project_path, map_dir: map_dir} do
      # Populate map with minimal data for snapshot+diff+tasks
      Bropilot.Yaml.encode_to_file(
        %{"name" => "developers", "pain" => "manual app building"},
        Path.join([map_dir, "problem", "audience.yaml"])
      )

      Bropilot.Yaml.encode_to_file(
        %{"endpoints" => [%{"path" => "/api/users", "method" => "GET"}]},
        Path.join([map_dir, "solution", "specs", "api.yaml"])
      )

      response_fn = fn _messages, _opts ->
        {:ok, "```file:lib/app/users.ex\ndefmodule App.Users do\n  def list, do: []\nend\n```"}
      end

      result =
        Executor.run(project_path,
          map_dir: map_dir,
          execution_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_fn]
        )

      assert {:ok, %{version: _, tasks: tasks, summary: _}} = result
      assert length(tasks) > 0

      # Verify files were written
      output_base = Path.join(project_path, "output")
      assert File.dir?(output_base)

      # At least one task output directory should contain files
      output_dirs = File.ls!(output_base)
      assert length(output_dirs) > 0
    end
  end
end

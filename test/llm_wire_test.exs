defmodule Bropilot.LLMWireTest do
  use ExUnit.Case

  alias Bropilot.Pipeline.Act1
  alias Bropilot.Pipeline.Act2
  alias Bropilot.Task.Agent

  @recipe_dir Path.join([__DIR__, "..", "priv", "recipes", "webapp"]) |> Path.expand()

  # ── Helpers ──────────────────────────────────────────────────

  defp setup_project do
    tmp = System.tmp_dir!() |> Path.join("bropilot_llm_wire_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)
    {:ok, _} = Bropilot.init(tmp)
    tmp
  end

  defp populate_problem_space(map_dir) do
    alias Bropilot.Map.Store

    Store.write(map_dir, :problem, :problem, %{
      "problem" => "Teams struggle to track tasks"
    })

    Store.write(map_dir, :problem, :context, %{
      "context" => "Existing tools are too complex"
    })

    Store.write(map_dir, :problem, :audience, %{
      "audience" => "Small teams"
    })

    Store.write(map_dir, :problem, :assumptions, %{
      "assumptions" => ["Teams communicate regularly"]
    })

    Store.write(map_dir, :problem, :hypotheses, %{
      "hypotheses" => ["Simple task management increases productivity"]
    })

    Store.write(map_dir, :problem, :"vibes/basics", %{
      "audience" => "Small teams",
      "use_cases" => ["Create tasks", "Assign tasks"],
      "capabilities" => ["Task CRUD", "User management"],
      "design" => "Clean and minimal",
      "volo" => "Task management made effortless",
      "hypotheses" => ["Simple task management increases productivity"],
      "assumptions" => ["Teams communicate regularly"]
    })

    File.write(
      Path.join(map_dir, "project.yaml"),
      Bropilot.Yaml.encode(%{"name" => "TodoApp", "purpose" => "Simple team task management"})
    )

    glossary_path = Path.join([map_dir, "knowledge", "glossary.yaml"])
    File.mkdir_p!(Path.dirname(glossary_path))

    Bropilot.Yaml.encode_to_file(
      %{
        "terms" => [
          %{
            "term" => "TodoApp",
            "definition" => "The application being built",
            "source_space" => "problem",
            "first_seen_step" => "step1"
          }
        ]
      },
      glossary_path
    )
  end

  # ── Act1 Worker with :llm extraction_mode ─────────────────

  describe "Act1 Worker with extraction_mode: :llm" do
    setup do
      tmp = setup_project()
      map_dir = Path.join([tmp, ".bropilot", "map"])
      on_exit(fn -> File.rm_rf!(tmp) end)
      {:ok, project_path: tmp, map_dir: map_dir}
    end

    test "step1 calls LLM and returns parsed data written to map", %{
      project_path: dir,
      map_dir: map_dir
    } do
      step1_yaml = """
      name: LLMApp
      purpose: An app built via LLM extraction
      problem: Users need automated data extraction
      context: Manual extraction is slow and error-prone
      glossary_terms:
        - term: LLMApp
          definition: The application under test
      """

      response_fn = fn _messages, _opts -> {:ok, step1_yaml} end

      {:ok, pid} =
        Act1.Worker.start_link(
          project_path: dir,
          recipe: @recipe_dir,
          extraction_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_fn]
        )

      {:ok, _prompt} = Act1.Worker.run_step1(pid)
      :ok = Act1.Worker.submit_input(pid, "I want an LLM-powered app")
      {:ok, data} = Act1.Worker.extract(pid)

      # Should return parsed map, not raw prompt text
      assert is_map(data)
      assert data["name"] == "LLMApp"
      assert data["purpose"] == "An app built via LLM extraction"
      assert data["problem"] == "Users need automated data extraction"

      # Should have written to map
      assert File.exists?(Path.join([map_dir, "problem", "problem.yaml"]))
      assert File.exists?(Path.join([map_dir, "problem", "context.yaml"]))
      assert File.exists?(Path.join(map_dir, "project.yaml"))
      assert File.exists?(Path.join([map_dir, "knowledge", "glossary.yaml"]))
    end

    test "step2 calls LLM and returns parsed data written to map", %{
      project_path: dir,
      map_dir: map_dir
    } do
      step1_yaml = """
      name: LLMApp
      purpose: Testing
      problem: Testing problem
      context: Testing context
      glossary_terms: []
      """

      step2_yaml = """
      audience: Developers and testers
      use_cases:
        - Automated testing
        - Data validation
      capabilities:
        - LLM integration
        - YAML parsing
      design: Developer-friendly CLI
      volo: Testing made intelligent
      hypotheses:
        - LLM can extract structured data reliably
      assumptions:
        - Users have API keys configured
      glossary_terms:
        - term: VOLO
          definition: Vision of Lovable Output
      """

      call_count = :counters.new(1, [:atomics])

      response_fn = fn _messages, _opts ->
        :counters.add(call_count, 1, 1)
        count = :counters.get(call_count, 1)

        if count <= 1 do
          {:ok, step1_yaml}
        else
          {:ok, step2_yaml}
        end
      end

      {:ok, pid} =
        Act1.Worker.start_link(
          project_path: dir,
          recipe: @recipe_dir,
          extraction_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_fn]
        )

      # Complete step1 first
      {:ok, _} = Act1.Worker.run_step1(pid)
      :ok = Act1.Worker.submit_input(pid, "LLM app for testing")
      {:ok, _step1_data} = Act1.Worker.extract(pid)

      # Run step2
      {:ok, _first_q} = Act1.Worker.run_step2(pid)

      for answer <- ["Automated testing", "Developers", "LLM integration", "CLI", "Simple", "Reliable"] do
        :ok = Act1.Worker.submit_input(pid, answer)
        Act1.Worker.next_question(pid)
      end

      {:ok, data} = Act1.Worker.extract(pid)

      assert is_map(data)
      assert data["audience"] == "Developers and testers"
      assert is_list(data["use_cases"])
      assert data["volo"] == "Testing made intelligent"

      # Should have written step2 map files
      assert File.exists?(Path.join([map_dir, "problem", "audience.yaml"]))
      assert File.exists?(Path.join([map_dir, "problem", "assumptions.yaml"]))
      assert File.exists?(Path.join([map_dir, "problem", "hypotheses.yaml"]))
      assert File.exists?(Path.join([map_dir, "problem", "vibes", "basics.yaml"]))
    end
  end

  # ── Act2 Worker with :llm extraction_mode ─────────────────

  describe "Act2 Worker with extraction_mode: :llm" do
    setup do
      tmp = setup_project()
      map_dir = Path.join([tmp, ".bropilot", "map"])
      populate_problem_space(map_dir)
      on_exit(fn -> File.rm_rf!(tmp) end)
      {:ok, project_path: tmp, map_dir: map_dir}
    end

    test "step3 calls LLM and returns parsed domain data", %{
      project_path: dir,
      map_dir: map_dir
    } do
      # Return a minimal but valid domain model YAML
      domain_yaml = Bropilot.Yaml.encode(Bropilot.Pipeline.Act2.Extractor.mock_domain_data())

      response_fn = fn _messages, _opts -> {:ok, domain_yaml} end

      {:ok, pid} =
        Act2.Worker.start_link(
          project_path: dir,
          recipe: @recipe_dir,
          extraction_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_fn]
        )

      {:ok, _prompt} = Act2.Worker.run_step3(pid)
      {:ok, data} = Act2.Worker.extract(pid)

      assert is_map(data)
      assert is_list(data["entities"])
      assert is_list(data["vocabulary"])
      assert is_list(data["relationships"])

      # Verify domain files were written
      assert File.exists?(Path.join([map_dir, "solution", "vocabulary.yaml"]))
      assert File.exists?(Path.join([map_dir, "solution", "domain", "entities.yaml"]))
      assert File.exists?(Path.join([map_dir, "solution", "domain", "relationships.yaml"]))
      assert File.exists?(Path.join([map_dir, "solution", "flows", "user-flows.yaml"]))
      assert File.exists?(Path.join([map_dir, "solution", "flows", "system-flows.yaml"]))
      assert File.exists?(Path.join([map_dir, "solution", "architecture", "components.yaml"]))
      assert File.exists?(Path.join([map_dir, "solution", "architecture", "dependencies.yaml"]))
    end

    test "step4 calls LLM and returns parsed specs data", %{
      project_path: dir,
      map_dir: map_dir
    } do
      domain_yaml = Bropilot.Yaml.encode(Bropilot.Pipeline.Act2.Extractor.mock_domain_data())
      specs_yaml = Bropilot.Yaml.encode(Bropilot.Pipeline.Act2.Extractor.mock_specs_data())

      call_count = :counters.new(1, [:atomics])

      response_fn = fn _messages, _opts ->
        :counters.add(call_count, 1, 1)
        count = :counters.get(call_count, 1)

        if count <= 1 do
          {:ok, domain_yaml}
        else
          {:ok, specs_yaml}
        end
      end

      {:ok, pid} =
        Act2.Worker.start_link(
          project_path: dir,
          recipe: @recipe_dir,
          extraction_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_fn]
        )

      # Complete step3 first
      {:ok, _prompt} = Act2.Worker.run_step3(pid)
      {:ok, _step3_data} = Act2.Worker.extract(pid)

      # Now step4
      {:ok, _prompt} = Act2.Worker.run_step4(pid)
      {:ok, data} = Act2.Worker.extract(pid)

      assert is_map(data)
      assert is_list(data["api"])
      assert is_list(data["behaviours"])
      assert is_list(data["entities"])
      assert is_list(data["modules"])

      # Verify all 11 spec files were written
      spec_files =
        ~w(api behaviours constraints entities modules events externals views components streams infra)

      for spec <- spec_files do
        path = Path.join([map_dir, "solution", "specs", "#{spec}.yaml"])
        assert File.exists?(path), "Expected #{path} to exist"
      end
    end
  end

  # ── Task.Agent with :llm execution_mode ────────────────────

  describe "Task.Agent with execution_mode: :llm" do
    @sample_task %{
      "id" => "task-llm-001",
      "title" => "Create User model",
      "description" => "Implement the User entity with authentication fields.",
      "context" => "The User entity is central to the app.",
      "definition_of_done" => [
        "User schema created",
        "Migration file generated",
        "Unit tests pass"
      ],
      "dependencies" => [],
      "priority" => "high",
      "related_specs" => ["specs/entities/user.yaml"],
      "status" => "pending"
    }

    test "calls LLM and writes generated files" do
      response_fn = fn messages, _opts ->
        # The user message should contain the built prompt
        user_msg = Enum.find(messages, &(&1.role == "user"))
        assert String.contains?(user_msg.content, "Create User model")
        {:ok, "Generated code for User model:\n\n```file:lib/app/user.ex\ndefmodule App.User do\n  defstruct [:id, :name, :email]\nend\n```"}
      end

      tmp = System.tmp_dir!() |> Path.join("bropilot_llm_wire_test_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)

      {:ok, pid} =
        Agent.start_link(@sample_task,
          execution_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_fn],
          project_path: tmp
        )

      {:ok, result} = Agent.execute(pid)

      assert is_map(result)
      assert is_list(result.files_written)
      assert "lib/app/user.ex" in result.files_written
      assert Agent.get_status(pid) == :completed

      GenServer.stop(pid)
      File.rm_rf!(tmp)
    end

    test "returns error when LLM call fails" do
      response_fn = fn _messages, _opts -> {:error, :timeout} end

      {:ok, pid} =
        Agent.start_link(@sample_task,
          execution_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_fn]
        )

      assert {:error, :timeout} = Agent.execute(pid)
      assert Agent.get_status(pid) == :failed

      GenServer.stop(pid)
    end

    test "prompt_only mode still works as before (default)" do
      {:ok, pid} = Agent.start_link(@sample_task)
      {:ok, prompt} = Agent.execute(pid)

      assert is_binary(prompt)
      assert String.contains?(prompt, "Create User model")
      assert Agent.get_status(pid) == :completed

      GenServer.stop(pid)
    end
  end
end

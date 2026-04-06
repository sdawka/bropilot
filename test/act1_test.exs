defmodule Bropilot.Act1Test do
  use ExUnit.Case

  alias Bropilot.Pipeline.Act1.{Worker, Extractor}

  @recipe_dir Path.join([__DIR__, "..", "priv", "recipes", "webapp"]) |> Path.expand()

  setup do
    tmp = System.tmp_dir!() |> Path.join("bropilot_act1_test_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)

    # Init a project so the map directory structure exists
    {:ok, _bropilot_dir} = Bropilot.init(tmp)

    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, project_path: tmp, map_dir: Path.join([tmp, ".bropilot", "map"])}
  end

  # ── Extractor ──────────────────────────────────────────────

  describe "Extractor.build_step1_prompt/2" do
    test "combines recipe prompt with user input" do
      prompt = Extractor.build_step1_prompt("# Step 1 Prompt", "I want to build a todo app")
      assert String.contains?(prompt, "# Step 1 Prompt")
      assert String.contains?(prompt, "I want to build a todo app")
      assert String.contains?(prompt, "name")
      assert String.contains?(prompt, "purpose")
    end
  end

  describe "Extractor.build_step2_prompt/3" do
    test "combines recipe prompt with Q&A pairs" do
      questions = ["What do you want?", "Who is it for?", "How does it work?"]
      answers = ["A todo app", "Developers", "Web based"]

      prompt = Extractor.build_step2_prompt("# Step 2 Prompt", questions, answers)

      assert String.contains?(prompt, "# Step 2 Prompt")
      assert String.contains?(prompt, "Q: What do you want?")
      assert String.contains?(prompt, "A: A todo app")
      assert String.contains?(prompt, "Q: Who is it for?")
      assert String.contains?(prompt, "A: Developers")
      assert String.contains?(prompt, "audience")
      assert String.contains?(prompt, "volo")
    end
  end

  describe "Extractor.parse_step1_output/1" do
    test "parses valid YAML string" do
      yaml = "name: MyApp\npurpose: A great app"
      assert {:ok, %{"name" => "MyApp", "purpose" => "A great app"}} = Extractor.parse_step1_output(yaml)
    end
  end

  describe "Extractor.parse_step2_output/1" do
    test "parses valid YAML string" do
      yaml = "audience: Developers\nvolo: Make it simple"
      assert {:ok, %{"audience" => "Developers", "volo" => "Make it simple"}} = Extractor.parse_step2_output(yaml)
    end
  end

  # ── Worker Step 1 ──────────────────────────────────────────

  describe "Worker step1" do
    test "starts and returns step1 prompt", %{project_path: dir} do
      {:ok, pid} = Worker.start_link(project_path: dir, recipe: @recipe_dir)
      {:ok, prompt} = Worker.run_step1(pid)

      assert is_binary(prompt)
      assert String.contains?(prompt, "App Basics")
    end

    test "accepts input and writes to map via mock extraction", %{project_path: dir, map_dir: map_dir} do
      {:ok, pid} = Worker.start_link(project_path: dir, recipe: @recipe_dir)
      {:ok, _prompt} = Worker.run_step1(pid)
      :ok = Worker.submit_input(pid, "I want to build a todo app for teams")
      {:ok, data} = Worker.extract(pid)

      assert data["name"] == "TodoApp"
      assert data["purpose"]
      assert data["problem"]
      assert data["context"]

      # Verify map files were written
      assert File.exists?(Path.join([map_dir, "problem", "problem.yaml"]))
      assert File.exists?(Path.join([map_dir, "problem", "context.yaml"]))
      assert File.exists?(Path.join(map_dir, "project.yaml"))

      # Verify glossary was written
      assert File.exists?(Path.join([map_dir, "knowledge", "glossary.yaml"]))
    end
  end

  # ── Worker Step 2 ──────────────────────────────────────────

  describe "Worker step2" do
    setup %{project_path: dir} do
      {:ok, pid} = Worker.start_link(project_path: dir, recipe: @recipe_dir)
      {:ok, _} = Worker.run_step1(pid)
      :ok = Worker.submit_input(pid, "I want to build a todo app")
      {:ok, _} = Worker.extract(pid)
      {:ok, pid: pid}
    end

    test "returns first question from pipeline", %{pid: pid} do
      {:ok, first_q} = Worker.run_step2(pid)
      assert is_binary(first_q)
      assert first_q == "What do you wanna make?"
    end

    test "walks through all 6 questions", %{pid: pid} do
      {:ok, q1} = Worker.run_step2(pid)
      assert is_binary(q1)

      # Answer question 1, get question 2
      :ok = Worker.submit_input(pid, "A todo app for teams")
      {:ok, q2} = Worker.next_question(pid)
      assert is_binary(q2)
      assert q2 != q1

      # Answer question 2, get question 3
      :ok = Worker.submit_input(pid, "Team members who need task tracking")
      {:ok, q3} = Worker.next_question(pid)
      assert is_binary(q3)

      # Answer question 3, get question 4
      :ok = Worker.submit_input(pid, "They create and assign tasks together")
      {:ok, q4} = Worker.next_question(pid)
      assert is_binary(q4)

      # Answer question 4, get question 5
      :ok = Worker.submit_input(pid, "Real-time collaboration is key")
      {:ok, q5} = Worker.next_question(pid)
      assert is_binary(q5)

      # Answer question 5, get question 6
      :ok = Worker.submit_input(pid, "Keep it simple and focused")
      {:ok, q6} = Worker.next_question(pid)
      assert is_binary(q6)

      # Answer question 6, no more questions
      :ok = Worker.submit_input(pid, "Teams need to communicate about tasks")
      assert {:ok, :no_more_questions} = Worker.next_question(pid)
    end

    test "extracts and writes all step2 slots", %{pid: pid, project_path: dir} do
      {:ok, _} = Worker.run_step2(pid)

      answers = [
        "A todo app",
        "Teams and managers",
        "Manage and track tasks",
        "Collaboration is the essence",
        "Simplify the UI",
        "Teams communicate regularly"
      ]

      for answer <- answers do
        :ok = Worker.submit_input(pid, answer)
        Worker.next_question(pid)
      end

      {:ok, data} = Worker.extract(pid)

      assert data["audience"]
      assert is_list(data["use_cases"])
      assert is_list(data["capabilities"])
      assert data["volo"]

      map_dir = Path.join([dir, ".bropilot", "map"])
      assert File.exists?(Path.join([map_dir, "problem", "audience.yaml"]))
      assert File.exists?(Path.join([map_dir, "problem", "assumptions.yaml"]))
      assert File.exists?(Path.join([map_dir, "problem", "hypotheses.yaml"]))
      assert File.exists?(Path.join([map_dir, "problem", "vibes", "basics.yaml"]))
    end
  end

  # ── Full Pipeline ──────────────────────────────────────────

  describe "full Act 1 pipeline" do
    test "fills all Problem Space slots after both steps", %{project_path: dir, map_dir: map_dir} do
      {:ok, pid} = Worker.start_link(project_path: dir, recipe: @recipe_dir)

      # Step 1
      {:ok, _prompt} = Worker.run_step1(pid)
      :ok = Worker.submit_input(pid, "A todo app for productive teams")
      {:ok, _step1_data} = Worker.extract(pid)

      # Step 2
      {:ok, _first_q} = Worker.run_step2(pid)

      for answer <- ["Todo app", "Teams", "Task management", "Collaboration", "Simple UI", "Trust"] do
        :ok = Worker.submit_input(pid, answer)
        Worker.next_question(pid)
      end

      {:ok, _step2_data} = Worker.extract(pid)

      # All Problem Space slots should be filled
      assert File.exists?(Path.join([map_dir, "problem", "problem.yaml"]))
      assert File.exists?(Path.join([map_dir, "problem", "context.yaml"]))
      assert File.exists?(Path.join([map_dir, "problem", "audience.yaml"]))
      assert File.exists?(Path.join([map_dir, "problem", "assumptions.yaml"]))
      assert File.exists?(Path.join([map_dir, "problem", "hypotheses.yaml"]))

      # Vibes file should exist
      assert File.exists?(Path.join([map_dir, "problem", "vibes", "basics.yaml"]))

      # Project file should exist
      assert File.exists?(Path.join(map_dir, "project.yaml"))

      # Glossary should have terms from both steps
      assert File.exists?(Path.join([map_dir, "knowledge", "glossary.yaml"]))
      {:ok, glossary} = Bropilot.Yaml.decode_file(Path.join([map_dir, "knowledge", "glossary.yaml"]))
      assert length(glossary["terms"]) == 2
    end
  end
end

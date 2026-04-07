defmodule Bropilot.Pipeline.Exploration.WorkerTest do
  use ExUnit.Case, async: false

  alias Bropilot.Pipeline.Exploration.Worker

  @webapp_source Path.join([__DIR__, "..", "priv", "recipes", "webapp"]) |> Path.expand()

  defp setup_project do
    tmp =
      System.tmp_dir!()
      |> Path.join("bropilot_exploration_test_#{:rand.uniform(1_000_000_000)}")

    File.mkdir_p!(tmp)

    bropilot_dir = Path.join(tmp, ".bropilot")
    recipe_dir = Path.join(bropilot_dir, "recipe")
    map_dir = Path.join(bropilot_dir, "map")

    File.mkdir_p!(recipe_dir)
    File.mkdir_p!(map_dir)

    if File.exists?(Path.join(@webapp_source, "recipe.yaml")) do
      File.cp!(Path.join(@webapp_source, "recipe.yaml"), Path.join(recipe_dir, "recipe.yaml"))
    end

    if File.exists?(Path.join(@webapp_source, "pipeline.yaml")) do
      File.cp!(Path.join(@webapp_source, "pipeline.yaml"), Path.join(recipe_dir, "pipeline.yaml"))
    end

    for space <- ~w(problem solution work measurement knowledge) do
      File.mkdir_p!(Path.join(map_dir, space))
    end

    {tmp, map_dir}
  end

  setup do
    {project_path, map_dir} = setup_project()
    on_exit(fn -> File.rm_rf!(project_path) end)
    {:ok, pid} = Worker.start_link(project_path: project_path, mode: :mock)
    {:ok, pid: pid, project_path: project_path, map_dir: map_dir}
  end

  test "submit_message appends to messages list", %{pid: pid} do
    :ok = Worker.submit_message(pid, "hello world")
    msgs = Worker.messages(pid)
    assert length(msgs) == 1
    assert hd(msgs).text == "hello world"
    assert hd(msgs).role == :user
  end

  test "append_buffer accumulates additively", %{pid: pid} do
    :ok = Worker.append_buffer(pid, "foo ")
    :ok = Worker.append_buffer(pid, "bar")
    assert Worker.get_buffer(pid) == "foo bar"
  end

  test "extract in mock mode writes problem and solution slots", %{pid: pid, map_dir: map_dir} do
    :ok = Worker.submit_message(pid, "I want to build a todo app")
    {:ok, result} = Worker.extract(pid)

    assert is_map(result.problem)
    assert is_map(result.solution)
    assert length(result.written_slots) > 0

    assert File.exists?(Path.join([map_dir, "problem", "problem.yaml"]))
    assert File.exists?(Path.join([map_dir, "problem", "audience.yaml"]))
    assert File.exists?(Path.join([map_dir, "solution", "vocabulary.yaml"]))
    assert File.exists?(Path.join([map_dir, "solution", "domain", "entities.yaml"]))
  end

  test "readiness reflects filled vs empty slots", %{pid: pid} do
    pre = Worker.readiness(pid)
    assert pre.problem.filled == []
    assert length(pre.problem.empty) > 0

    :ok = Worker.submit_message(pid, "go")
    {:ok, _} = Worker.extract(pid)

    post = Worker.readiness(pid)
    assert :problem in post.problem.filled
    assert :audience in post.problem.filled
    assert :vocabulary in post.solution.filled
  end

  test "auto_extract? toggle controls automatic extraction", %{pid: pid, map_dir: map_dir} do
    :ok = Worker.submit_message(pid, "first message")
    refute File.exists?(Path.join([map_dir, "problem", "problem.yaml"]))

    :ok = Worker.set_auto_extract(pid, true)
    assert Worker.auto_extract?(pid) == true

    Worker.submit_message(pid, "second message")
    assert File.exists?(Path.join([map_dir, "problem", "problem.yaml"]))
  end

  test "multiple extractions are idempotent", %{pid: pid, map_dir: map_dir} do
    :ok = Worker.submit_message(pid, "build something")
    {:ok, _} = Worker.extract(pid)
    {:ok, _} = Worker.extract(pid)
    {:ok, _} = Worker.extract(pid)

    assert File.exists?(Path.join([map_dir, "problem", "problem.yaml"]))
    assert File.exists?(Path.join([map_dir, "solution", "vocabulary.yaml"]))
  end

  test "mark_lens_visited and lenses_visited round-trip", %{pid: pid} do
    assert Worker.lenses_visited(pid) |> MapSet.size() == 0
    :ok = Worker.mark_lens_visited(pid, :problem_lens)
    :ok = Worker.mark_lens_visited(pid, :solution_lens)
    visited = Worker.lenses_visited(pid)
    assert MapSet.member?(visited, :problem_lens)
    assert MapSet.member?(visited, :solution_lens)
  end

  test "buffer is cleared after extract", %{pid: pid} do
    :ok = Worker.append_buffer(pid, "some context")
    :ok = Worker.submit_message(pid, "message")
    {:ok, _} = Worker.extract(pid)
    assert Worker.get_buffer(pid) == ""
  end

  test "extract on empty conversation returns ok with no written slots", %{pid: pid} do
    {:ok, result} = Worker.extract(pid)
    assert result.problem == %{}
    assert result.solution == %{}
    assert result.written_slots == []
  end
end

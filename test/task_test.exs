defmodule Bropilot.TaskTest do
  use ExUnit.Case

  alias Bropilot.Task.Agent
  alias Bropilot.Task.Supervisor, as: TaskSup

  @sample_task %{
    "id" => "task-001",
    "title" => "Create User model",
    "description" => "Implement the User entity with authentication fields.",
    "context" => "The User entity is central to the app. Needs email, password_hash, name.",
    "definition_of_done" => [
      "User schema created with email, password_hash, name fields",
      "Migration file generated",
      "Unit tests pass"
    ],
    "dependencies" => [],
    "priority" => "high",
    "related_specs" => ["specs/entities/user.yaml"],
    "status" => "pending"
  }

  describe "Task.Agent" do
    test "starts with task data and is in_progress" do
      {:ok, pid} = Agent.start_link(@sample_task)
      assert Agent.get_status(pid) == :in_progress
      assert Agent.get_result(pid) == nil
      GenServer.stop(pid)
    end

    test "execute returns prompt with task content" do
      {:ok, pid} = Agent.start_link(@sample_task)
      assert {:ok, prompt} = Agent.execute(pid)
      assert is_binary(prompt)
      assert String.contains?(prompt, "Create User model")
      assert String.contains?(prompt, "User entity is central")
      assert String.contains?(prompt, "Unit tests pass")
      assert String.contains?(prompt, "specs/entities/user.yaml")
      GenServer.stop(pid)
    end

    test "status is :completed after successful execute" do
      {:ok, pid} = Agent.start_link(@sample_task)
      {:ok, _prompt} = Agent.execute(pid)
      assert Agent.get_status(pid) == :completed
      GenServer.stop(pid)
    end

    test "result is available after execute" do
      {:ok, pid} = Agent.start_link(@sample_task)
      {:ok, prompt} = Agent.execute(pid)
      assert {:ok, ^prompt} = Agent.get_result(pid)
      GenServer.stop(pid)
    end

    test "prompt includes definition of done items numbered" do
      {:ok, pid} = Agent.start_link(@sample_task)
      {:ok, prompt} = Agent.execute(pid)
      assert String.contains?(prompt, "1. User schema created")
      assert String.contains?(prompt, "2. Migration file generated")
      assert String.contains?(prompt, "3. Unit tests pass")
      GenServer.stop(pid)
    end
  end

  describe "Task.Supervisor" do
    setup do
      {:ok, sup} = TaskSup.start_link(name: :"test_task_sup_#{:rand.uniform(100_000)}")
      {:ok, sup: sup}
    end

    test "dispatches a single task", %{sup: sup} do
      assert {:ok, pid} = TaskSup.dispatch(@sample_task, supervisor: sup)
      assert is_pid(pid)
      assert Process.alive?(pid)
      assert Agent.get_status(pid) == :in_progress
    end

    test "status reports all task states", %{sup: sup} do
      task_a = %{@sample_task | "id" => "task-a"}
      task_b = %{@sample_task | "id" => "task-b"}

      {:ok, pid_a} = TaskSup.dispatch(task_a, supervisor: sup)
      {:ok, pid_b} = TaskSup.dispatch(task_b, supervisor: sup)

      statuses = TaskSup.status(supervisor: sup)
      assert Map.has_key?(statuses, "task-a")
      assert Map.has_key?(statuses, "task-b")
      assert statuses["task-a"] == :in_progress
      assert statuses["task-b"] == :in_progress

      Agent.execute(pid_a)
      statuses = TaskSup.status(supervisor: sup)
      assert statuses["task-a"] == :completed
      assert statuses["task-b"] == :in_progress

      GenServer.stop(pid_a)
      GenServer.stop(pid_b)
    end

    test "dispatch_all starts tasks without deps", %{sup: sup} do
      task_a = %{@sample_task | "id" => "task-a", "dependencies" => []}
      task_b = %{@sample_task | "id" => "task-b", "dependencies" => []}

      result = TaskSup.dispatch_all([task_a, task_b], supervisor: sup)
      assert is_map(result)
      assert Map.has_key?(result, "task-a")
      assert Map.has_key?(result, "task-b")

      statuses = TaskSup.status(supervisor: sup)
      assert statuses["task-a"] == :in_progress
      assert statuses["task-b"] == :in_progress
    end

    test "dispatch_all respects dependency ordering", %{sup: sup} do
      task_a = %{@sample_task | "id" => "task-a", "dependencies" => []}
      task_b = %{@sample_task | "id" => "task-b", "dependencies" => ["task-a"]}
      task_c = %{@sample_task | "id" => "task-c", "dependencies" => ["task-b"]}

      # dispatch out of order to verify topological sort
      result = TaskSup.dispatch_all([task_c, task_b, task_a], supervisor: sup)

      assert is_map(result)
      assert Map.has_key?(result, "task-a")
      assert Map.has_key?(result, "task-b")
      assert Map.has_key?(result, "task-c")
    end
  end

  describe "Task.Supervisor.topological_sort/1" do
    test "tasks with no deps maintain order" do
      tasks = [
        %{"id" => "t1", "dependencies" => []},
        %{"id" => "t2", "dependencies" => []},
        %{"id" => "t3", "dependencies" => []}
      ]

      sorted = TaskSup.topological_sort(tasks)
      ids = Enum.map(sorted, & &1["id"])
      assert ids == ["t1", "t2", "t3"]
    end

    test "task with dep comes after its dependency" do
      tasks = [
        %{"id" => "t2", "dependencies" => ["t1"]},
        %{"id" => "t1", "dependencies" => []}
      ]

      sorted = TaskSup.topological_sort(tasks)
      ids = Enum.map(sorted, & &1["id"])
      assert ids == ["t1", "t2"]
    end

    test "diamond dependency graph" do
      tasks = [
        %{"id" => "d", "dependencies" => ["b", "c"]},
        %{"id" => "c", "dependencies" => ["a"]},
        %{"id" => "b", "dependencies" => ["a"]},
        %{"id" => "a", "dependencies" => []}
      ]

      sorted = TaskSup.topological_sort(tasks)
      ids = Enum.map(sorted, & &1["id"])

      # a must come before b and c; b and c must come before d
      assert Enum.find_index(ids, &(&1 == "a")) < Enum.find_index(ids, &(&1 == "b"))
      assert Enum.find_index(ids, &(&1 == "a")) < Enum.find_index(ids, &(&1 == "c"))
      assert Enum.find_index(ids, &(&1 == "b")) < Enum.find_index(ids, &(&1 == "d"))
      assert Enum.find_index(ids, &(&1 == "c")) < Enum.find_index(ids, &(&1 == "d"))
    end
  end
end

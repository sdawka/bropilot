defmodule Bropilot.Task.Supervisor do
  @moduledoc """
  DynamicSupervisor for task agents.
  Dispatches tasks respecting dependency order using topological sort.
  Tasks with no dependencies start immediately; tasks with deps wait
  until all deps are completed.
  """

  use DynamicSupervisor

  alias Bropilot.Task.Agent

  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    DynamicSupervisor.start_link(__MODULE__, opts, name: name)
  end

  @impl true
  def init(_opts) do
    DynamicSupervisor.init(strategy: :one_for_one)
  end

  @doc """
  Dispatches a single task as a transient Task.Agent child.
  Returns {:ok, pid} or {:error, reason}.
  """
  def dispatch(task, opts \\ []) do
    sup = Keyword.get(opts, :supervisor, __MODULE__)

    spec = %{
      id: Map.get(task, "id", System.unique_integer([:positive])),
      start: {Agent, :start_link, [task, []]},
      restart: :transient
    }

    DynamicSupervisor.start_child(sup, spec)
  end

  @doc """
  Dispatches all tasks respecting dependency order.
  Tasks with no deps start immediately. Tasks with deps wait
  until all deps are completed.

  Returns a map of task_id => pid for all started agents.
  """
  def dispatch_all(tasks, opts \\ []) do
    ordered = topological_sort(tasks)
    do_dispatch_ordered(ordered, %{}, opts)
  end

  @doc """
  Returns a map of task_id => status for all running/completed agents.
  """
  def status(opts \\ []) do
    sup = Keyword.get(opts, :supervisor, __MODULE__)

    DynamicSupervisor.which_children(sup)
    |> Enum.reduce(%{}, fn {_id, pid, _type, _modules}, acc ->
      if is_pid(pid) and Process.alive?(pid) do
        try do
          status = Agent.get_status(pid)
          # Extract task id from state via sys
          case :sys.get_state(pid) do
            %Agent{task: task} ->
              task_id = Map.get(task, "id", inspect(pid))
              Map.put(acc, task_id, status)

            _ ->
              acc
          end
        catch
          _, _ -> acc
        end
      else
        acc
      end
    end)
  end

  # --- Private ---

  defp do_dispatch_ordered([], dispatched, _opts), do: dispatched

  defp do_dispatch_ordered([task | rest], dispatched, opts) do
    case dispatch(task, opts) do
      {:ok, pid} ->
        task_id = Map.get(task, "id")
        dispatched = Map.put(dispatched, task_id, pid)
        do_dispatch_ordered(rest, dispatched, opts)

      {:error, reason} ->
        {:error, {Map.get(task, "id"), reason}}
    end
  end

  @doc """
  Topological sort of tasks based on their dependencies.
  Tasks with no dependencies come first.
  """
  def topological_sort(tasks) do
    task_map = Map.new(tasks, fn t -> {Map.get(t, "id"), t} end)
    ids = Map.keys(task_map)

    {sorted, _visited} =
      Enum.reduce(ids, {[], MapSet.new()}, fn id, {sorted, visited} ->
        visit(id, task_map, sorted, visited, MapSet.new())
      end)

    Enum.reverse(sorted)
  end

  defp visit(id, task_map, sorted, visited, in_stack) do
    cond do
      MapSet.member?(visited, id) ->
        {sorted, visited}

      MapSet.member?(in_stack, id) ->
        # Circular dependency — skip to avoid infinite loop
        {sorted, visited}

      true ->
        task = Map.get(task_map, id)
        deps = if task, do: Map.get(task, "dependencies", []) || [], else: []
        in_stack = MapSet.put(in_stack, id)

        {sorted, visited} =
          Enum.reduce(deps, {sorted, visited}, fn dep_id, {s, v} ->
            visit(dep_id, task_map, s, v, in_stack)
          end)

        visited = MapSet.put(visited, id)

        if task do
          {[task | sorted], visited}
        else
          {sorted, visited}
        end
    end
  end
end

defmodule Bropilot.Pipeline.Act3.Executor do
  @moduledoc """
  Orchestrates the full Act 3 flow: snapshot → diff → task generation → feedback.

  Replaces the need to call each Act 3 module separately.
  """

  alias Bropilot.Pipeline.Act3.Snapshot
  alias Bropilot.Pipeline.Act3.Diff
  alias Bropilot.Pipeline.Act3.TaskGenerator
  alias Bropilot.Pipeline.Feedback

  @doc """
  Runs the complete Act 3 pipeline:
    1. Creates a snapshot (step 5)
    2. Generates a change plan / diff (step 6)
    3. Generates tasks from changes (step 7)
    4. For each completed task, dispatches to Task.Agent for codegen (step 8)
    5. After all tasks, calls Feedback.summarize_version

  Options:
    - `:version` – override the version (otherwise auto-incremented via snapshot)
    - `:execution_mode` – `:llm` for real codegen, `:prompt_only` (default) for prompt generation
    - `:llm_opts` – options to pass to LLM provider (e.g., `[provider: :mock, response_fn: fn]`)
    - `:simulate_results` – a function (task -> result) to simulate task completion
      (only used when execution_mode is :prompt_only). Defaults to `fn _task -> {:ok, "completed"} end`

  Returns `{:ok, %{version: v, tasks: tasks, summary: summary}}` or `{:error, reason}`.
  """
  def run(project_path, opts \\ []) do
    map_dir = resolve_map_dir(project_path, opts)
    execution_mode = Keyword.get(opts, :execution_mode, :prompt_only)

    with {:ok, version} <- Snapshot.create_snapshot(map_dir),
         {:ok, changes} <- Diff.generate_change_plan(map_dir, version),
         tasks <- TaskGenerator.generate_tasks(changes),
         :ok <- check_specs_exist(map_dir, tasks),
         :ok <- TaskGenerator.write_tasks(tasks, map_dir, version) do
      case execution_mode do
        :llm ->
          execute_tasks_with_llm(tasks, project_path, map_dir, version, opts)

        :pi ->
          execute_tasks_with_codegen(tasks, project_path, map_dir, version, :pi, opts)

        :mock ->
          execute_tasks_with_generator(tasks, project_path, map_dir, version, opts)

        _ ->
          execute_tasks_simulated(tasks, map_dir, version, opts)
      end
    end
  end

  defp check_specs_exist(map_dir, _tasks) do
    specs_dir = Path.join([map_dir, "solution", "specs"])

    if File.dir?(specs_dir) do
      yaml_files =
        specs_dir
        |> File.ls!()
        |> Enum.filter(&(String.ends_with?(&1, ".yaml") or String.ends_with?(&1, ".yml")))

      if yaml_files == [] do
        {:error, "no specs to generate from — run Act 2 domain modeling first"}
      else
        :ok
      end
    else
      {:error, "no specs to generate from — run Act 2 domain modeling first"}
    end
  end

  defp execute_tasks_with_generator(tasks, project_path, map_dir, version, _opts) do
    output_dir = Path.join([project_path, "output", "v#{version}"])
    File.mkdir_p!(output_dir)

    try do
      {:ok, gen_result} = Bropilot.Generator.generate_all(map_dir, output_dir)

      files_written =
        gen_result
        |> Map.values()
        |> Enum.map(&Path.relative_to(&1, project_path))

      # Create mock task results for knowledge/traceability
      task_results =
        Enum.map(tasks, fn task ->
          task_map = task_struct_to_map(task, version)
          result = {:ok, %{files_written: files_written, output_dir: output_dir}}
          {task, task_map, result}
        end)

      Enum.each(task_results, fn {_task, task_map, result} ->
        Feedback.update_knowledge(map_dir, task_map, result)
      end)

      record_traceability_links(task_results, map_dir, project_path)

      {:ok, summary} = Feedback.summarize_version(map_dir, version)
      {:ok, %{version: version, tasks: tasks, summary: summary, files_written: files_written}}
    rescue
      e -> {:error, Exception.message(e)}
    end
  end

  defp execute_tasks_simulated(tasks, map_dir, version, opts) do
    result_fn = Keyword.get(opts, :simulate_results, fn _task -> {:ok, "completed"} end)

    Enum.each(tasks, fn task ->
      result = result_fn.(task)
      task_map = task_struct_to_map(task, version)
      Feedback.update_knowledge(map_dir, task_map, result)
    end)

    {:ok, summary} = Feedback.summarize_version(map_dir, version)
    {:ok, %{version: version, tasks: tasks, summary: summary, files_written: []}}
  end

  defp execute_tasks_with_codegen(tasks, project_path, map_dir, version, mode, opts) do
    llm_opts = Keyword.get(opts, :llm_opts, [])

    task_results =
      Enum.map(tasks, fn task ->
        task_map = task_struct_to_map(task, version)

        {:ok, pid} =
          Bropilot.Task.Agent.start_link(task_map,
            execution_mode: mode,
            llm_opts: llm_opts,
            map_dir: map_dir,
            project_path: project_path
          )

        result = Bropilot.Task.Agent.execute(pid)
        GenServer.stop(pid)

        {task, task_map, result}
      end)

    # Update knowledge for all tasks (successful and failed)
    Enum.each(task_results, fn {_task, task_map, result} ->
      Feedback.update_knowledge(map_dir, task_map, result)
    end)

    # Record traceability links for all codegen tasks
    record_traceability_links(task_results, map_dir, project_path)

    # Collect files written across all tasks
    files_written = collect_files_written(task_results)

    {:ok, summary} = Feedback.summarize_version(map_dir, version)
    {:ok, %{version: version, tasks: tasks, summary: summary, files_written: files_written}}
  end

  defp execute_tasks_with_llm(tasks, project_path, map_dir, version, opts) do
    llm_opts = Keyword.get(opts, :llm_opts, [])

    task_results =
      Enum.map(tasks, fn task ->
        task_map = task_struct_to_map(task, version)

        {:ok, pid} =
          Bropilot.Task.Agent.start_link(task_map,
            execution_mode: :llm,
            llm_opts: llm_opts,
            map_dir: map_dir,
            project_path: project_path
          )

        result = Bropilot.Task.Agent.execute(pid)
        GenServer.stop(pid)

        {task, task_map, result}
      end)

    # Update knowledge for all tasks (successful and failed)
    Enum.each(task_results, fn {_task, task_map, result} ->
      Feedback.update_knowledge(map_dir, task_map, result)
    end)

    # Record traceability links for all codegen tasks
    record_traceability_links(task_results, map_dir, project_path)

    # Collect files written across all tasks
    files_written = collect_files_written(task_results)

    {:ok, summary} = Feedback.summarize_version(map_dir, version)
    {:ok, %{version: version, tasks: tasks, summary: summary, files_written: files_written}}
  end

  defp record_traceability_links(task_results, map_dir, project_path) do
    batch =
      Enum.map(task_results, fn {_task, task_map, result} ->
        {task_map, result}
      end)

    Bropilot.Traceability.AutoLinker.record_links_batch(map_dir, batch, project_path)
  rescue
    _ -> :ok
  end

  defp collect_files_written(task_results) do
    Enum.flat_map(task_results, fn
      {_task, _task_map, {:ok, %{files_written: files, output_dir: dir}}} ->
        Enum.map(files, fn f -> Path.join(dir, f) end)

      _ ->
        []
    end)
  end

  @doc """
  Runs individual steps of the Act 3 pipeline.

  Supported steps:
    - `5` or `:snapshot` – create a snapshot
    - `6` or `:diff` – generate change plan (requires version)
    - `7` or `:tasks` – generate tasks (requires version)
    - `8` or `:feedback` – update knowledge (requires version, task, result)

  Options:
    - `:version` – version number (required for steps 6, 7, 8)
    - `:task` – task map (required for step 8)
    - `:result` – task result (required for step 8)
  """
  def run_step(project_path, step, opts \\ [])

  def run_step(project_path, step, opts) when step in [5, :snapshot] do
    map_dir = resolve_map_dir(project_path, opts)
    Snapshot.create_snapshot(map_dir)
  end

  def run_step(project_path, step, opts) when step in [6, :diff] do
    map_dir = resolve_map_dir(project_path, opts)
    version = Keyword.fetch!(opts, :version)
    Diff.generate_change_plan(map_dir, version)
  end

  def run_step(project_path, step, opts) when step in [7, :tasks] do
    map_dir = resolve_map_dir(project_path, opts)
    version = Keyword.fetch!(opts, :version)

    {:ok, changes} = Diff.generate_change_plan(map_dir, version)
    tasks = TaskGenerator.generate_tasks(changes)
    :ok = TaskGenerator.write_tasks(tasks, map_dir, version)
    {:ok, tasks}
  end

  def run_step(project_path, step, opts) when step in [8, :feedback] do
    map_dir = resolve_map_dir(project_path, opts)
    task = Keyword.fetch!(opts, :task)
    result = Keyword.fetch!(opts, :result)
    Feedback.update_knowledge(map_dir, task, result)
  end

  # -- Private --

  defp resolve_map_dir(_project_path, opts) do
    case Keyword.get(opts, :map_dir) do
      nil -> raise ArgumentError, "map_dir is required in opts"
      dir -> dir
    end
  end

  defp task_struct_to_map(task, version) when is_map(task) do
    %{
      "id" => Map.get(task, :id) || Map.get(task, "id"),
      "title" => Map.get(task, :title) || Map.get(task, "title", ""),
      "description" => Map.get(task, :description) || Map.get(task, "description", ""),
      "context" => Map.get(task, :context) || Map.get(task, "context", %{}),
      "related_specs" => Map.get(task, :related_specs) || Map.get(task, "related_specs", []),
      "definition_of_done" =>
        Map.get(task, :definition_of_done) || Map.get(task, "definition_of_done", []),
      "dependencies" => Map.get(task, :dependencies) || Map.get(task, "dependencies", []),
      "priority" =>
        to_string(Map.get(task, :priority) || Map.get(task, "priority", "medium")),
      "status" =>
        to_string(Map.get(task, :status) || Map.get(task, "status", "pending")),
      "version" => version
    }
  end
end

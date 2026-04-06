defmodule Bropilot.Task.Agent do
  @moduledoc """
  GenServer for a single codegen task.
  Holds task data, status, and result. Builds the codegen prompt
  from task context + definition_of_done + the step8 prompt template.
  """

  use GenServer

  defstruct [:task, :status, :result, :map_dir, :project_path, execution_mode: :prompt_only, llm_opts: []]

  @step8_prompt_path Path.join([:code.priv_dir(:bropilot), "recipes", "webapp", "prompts", "step8-codegen.md"])

  # --- Client API ---

  def start_link(task, opts \\ []) do
    {task_opts, gen_opts} = Keyword.split(opts, [:execution_mode, :llm_opts, :map_dir, :project_path])
    GenServer.start_link(__MODULE__, {task, task_opts}, gen_opts)
  end

  def execute(pid) do
    GenServer.call(pid, :execute)
  end

  def get_status(pid) do
    GenServer.call(pid, :get_status)
  end

  def get_result(pid) do
    GenServer.call(pid, :get_result)
  end

  # --- Server Callbacks ---

  @impl true
  def init({task, opts}) do
    execution_mode = Keyword.get(opts, :execution_mode, :prompt_only)
    llm_opts = Keyword.get(opts, :llm_opts, [])
    map_dir = Keyword.get(opts, :map_dir)
    project_path = Keyword.get(opts, :project_path)

    {:ok,
     %__MODULE__{
       task: task,
       status: :in_progress,
       result: nil,
       map_dir: map_dir,
       project_path: project_path,
       execution_mode: execution_mode,
       llm_opts: llm_opts
     }}
  end

  @impl true
  def handle_call(:execute, _from, %{execution_mode: :llm} = state) do
    {:ok, prompt} = build_prompt(state.task)

    messages = [%{role: "user", content: prompt}]

    case Bropilot.LLM.chat(messages, state.llm_opts) do
      {:ok, response} ->
        task_id = Map.get(state.task, "id", "unknown")
        output_dir = resolve_output_dir(state.project_path, task_id)

        case Bropilot.Codegen.Writer.parse_and_write(response, output_dir) do
          {:ok, codegen_result} ->
            # Enrich task context with the files that were written
            enriched_task = enrich_task_with_artifacts(state.task, codegen_result)
            result = {:ok, codegen_result}
            new_state = %{state | status: :completed, result: result}
            maybe_update_knowledge(state.map_dir, enriched_task, result)
            maybe_record_traceability(state.map_dir, state.task, result, state.project_path)
            notify_supervisor(state.task)
            {:reply, result, new_state}

          {:error, :no_files} ->
            new_state = %{state | status: :failed, result: {:error, :no_files_generated}}
            {:reply, {:error, :no_files_generated}, new_state}

          {:error, reason} ->
            new_state = %{state | status: :failed, result: {:error, reason}}
            {:reply, {:error, reason}, new_state}
        end

      {:error, reason} ->
        new_state = %{state | status: :failed, result: {:error, reason}}
        {:reply, {:error, reason}, new_state}
    end
  end

  @impl true
  def handle_call(:execute, _from, %{execution_mode: :pi} = state) do
    {:ok, prompt} = build_prompt(state.task)
    task_id = Map.get(state.task, "id", "unknown")
    output_dir = resolve_output_dir(state.project_path, task_id)

    case Bropilot.Codegen.PiBackend.execute(prompt, output_dir) do
      {:ok, codegen_result} ->
        enriched_task = enrich_task_with_artifacts(state.task, codegen_result)
        result = {:ok, codegen_result}
        new_state = %{state | status: :completed, result: result}
        maybe_update_knowledge(state.map_dir, enriched_task, result)
        maybe_record_traceability(state.map_dir, state.task, result, state.project_path)
        notify_supervisor(state.task)
        {:reply, result, new_state}

      {:error, :pi_pool_unavailable} ->
        # Fallback: use LLM when Pi pool is not available
        handle_call(:execute, nil, %{state | execution_mode: :llm})

      {:error, reason} ->
        new_state = %{state | status: :failed, result: {:error, reason}}
        {:reply, {:error, reason}, new_state}
    end
  end

  @impl true
  def handle_call(:execute, _from, state) do
    {:ok, prompt} = build_prompt(state.task)
    result = {:ok, prompt}
    new_state = %{state | status: :completed, result: result}
    maybe_update_knowledge(state.map_dir, state.task, result)
    notify_supervisor(state.task)
    {:reply, result, new_state}
  end

  @impl true
  def handle_call(:get_status, _from, state) do
    {:reply, state.status, state}
  end

  @impl true
  def handle_call(:get_result, _from, state) do
    {:reply, state.result, state}
  end

  # --- Private ---

  defp build_prompt(task) do
    template = load_step8_template()

    context = Map.get(task, "context", "")
    title = Map.get(task, "title", "")
    description = Map.get(task, "description", "")

    context_str = format_context(context)

    dod =
      task
      |> Map.get("definition_of_done", [])
      |> Enum.with_index(1)
      |> Enum.map(fn {item, i} -> "#{i}. #{item}" end)
      |> Enum.join("\n")

    related =
      task
      |> Map.get("related_specs", [])
      |> Enum.join(", ")

    prompt = """
    # Task: #{title}

    ## Description
    #{description}

    ## Context
    #{context_str}

    ## Definition of Done
    #{dod}

    ## Related Specs
    #{related}

    ---

    #{template}
    """

    {:ok, String.trim(prompt)}
  end

  defp format_context(context) when is_binary(context), do: context
  defp format_context(context) when is_map(context), do: inspect(context, pretty: true)
  defp format_context(context) when is_list(context), do: Enum.join(context, "\n")
  defp format_context(context), do: to_string(context)

  defp load_step8_template do
    case File.read(@step8_prompt_path) do
      {:ok, content} -> content
      {:error, _} -> "Execute the codegen task as specified above."
    end
  end

  defp maybe_update_knowledge(nil, _task, _result), do: :ok

  defp maybe_update_knowledge(map_dir, task, result) do
    Bropilot.Pipeline.Feedback.update_knowledge(map_dir, task, result)
  rescue
    _ -> :ok
  end

  defp maybe_record_traceability(nil, _task, _result, _project_path), do: :ok

  defp maybe_record_traceability(map_dir, task, result, project_path) do
    Bropilot.Traceability.AutoLinker.record_links(map_dir, task, result, project_path)
  rescue
    _ -> :ok
  end

  defp notify_supervisor(task) do
    task_id = Map.get(task, "id")

    if task_id do
      send(Bropilot.Task.Supervisor, {:task_completed, task_id})
    end
  catch
    _, _ -> :ok
  end

  defp resolve_output_dir(nil, task_id), do: Path.join(["output", to_string(task_id)])
  defp resolve_output_dir(project_path, task_id), do: Path.join([project_path, "output", to_string(task_id)])

  defp enrich_task_with_artifacts(task, %{files_written: files, output_dir: dir}) do
    context = Map.get(task, "context", %{}) || %{}

    context =
      if is_map(context) do
        Map.merge(context, %{
          "artifact_paths" => files,
          "output_dir" => dir
        })
      else
        %{"artifact_paths" => files, "output_dir" => dir, "original_context" => context}
      end

    Map.put(task, "context", context)
  end
end

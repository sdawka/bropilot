defmodule Bropilot.Pipeline.Engine do
  @moduledoc """
  Phase-based pipeline execution engine.

  Phases:
    - :exploration  — free-form, fills Problem and Solution slots concurrently
    - :work         — sequential work steps (snapshot, diff, tasks, codegen)
    - :complete     — pipeline finished

  The single commitment gate transitions :exploration -> :work and validates
  that both Problem and Solution slots are filled.
  """

  use GenServer

  require Logger

  alias Bropilot.Recipe.Registry
  alias Bropilot.Spaces

  @state_filename "pipeline_state.yaml"

  # -- Public API --

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts)
  def start(opts), do: GenServer.start(__MODULE__, opts)

  def current_step(pid), do: GenServer.call(pid, :current_step)
  def current_phase(pid), do: GenServer.call(pid, :current_phase)
  def advance(pid), do: GenServer.call(pid, :advance)
  def commit(pid), do: GenServer.call(pid, :commit)
  def step_status(pid), do: GenServer.call(pid, :step_status)
  def mark_complete(pid, step_id), do: GenServer.call(pid, {:mark_complete, step_id})

  # -- GenServer callbacks --

  @impl true
  def init(opts) do
    project_path = Keyword.fetch!(opts, :project_path)
    recipe_dir = Path.join([project_path, ".bropilot", "recipe"])

    case Registry.load(recipe_dir) do
      {:ok, recipe} ->
        {phase, work_index, completed} = load_persisted_state(project_path, recipe)

        state = %{
          project_path: project_path,
          recipe: recipe,
          phase: phase,
          work_step_index: work_index,
          completed_steps: completed
        }

        persist_state(state)
        {:ok, state}

      {:error, reason} ->
        {:stop, reason}
    end
  end

  @impl true
  def handle_call(:current_phase, _from, state), do: {:reply, state.phase, state}

  @impl true
  def handle_call(:current_step, _from, state) do
    reply =
      case state.phase do
        :exploration -> :exploration
        :complete -> :complete
        :work -> Enum.at(work_steps(state.recipe), state.work_step_index)
      end

    {:reply, reply, state}
  end

  @impl true
  def handle_call(:advance, _from, state) do
    case state.phase do
      :exploration ->
        {:reply, {:error, :use_commit}, state}

      :complete ->
        {:reply, {:error, :pipeline_complete}, state}

      :work ->
        steps = work_steps(state.recipe)
        next_index = state.work_step_index + 1

        cond do
          next_index >= length(steps) ->
            new_state = %{state | phase: :complete}
            persist_state(new_state)
            {:reply, {:error, :pipeline_complete}, new_state}

          true ->
            new_state = %{state | work_step_index: next_index}
            persist_state(new_state)
            {:reply, {:ok, Enum.at(steps, next_index)}, new_state}
        end
    end
  end

  @impl true
  def handle_call(:commit, _from, state) do
    if state.phase != :exploration do
      {:reply, {:error, :not_in_exploration}, state}
    else
      map_dir = Path.join([state.project_path, ".bropilot", "map"])

      case Spaces.validate_commitment_gate(map_dir) do
        :ok ->
          new_state = %{state | phase: :work, work_step_index: 0}
          persist_state(new_state)
          first = Enum.at(work_steps(state.recipe), 0)
          {:reply, {:ok, first}, new_state}

        {:error, _} = err ->
          {:reply, err, state}
      end
    end
  end

  @impl true
  def handle_call(:step_status, _from, state) do
    steps = work_steps(state.recipe)

    statuses =
      steps
      |> Enum.with_index()
      |> Enum.map(fn {step, index} ->
        status =
          cond do
            MapSet.member?(state.completed_steps, step.id) ->
              :completed

            state.phase == :work and index == state.work_step_index ->
              :in_progress

            true ->
              :pending
          end

        {step.id, status}
      end)
      |> Map.new()

    {:reply, statuses, state}
  end

  @impl true
  def handle_call({:mark_complete, step_id}, _from, state) do
    new_state = %{state | completed_steps: MapSet.put(state.completed_steps, step_id)}
    persist_state(new_state)
    {:reply, :ok, new_state}
  end

  # -- Helpers --

  defp work_steps(recipe) do
    Map.get(recipe, :work_steps) || Enum.filter(recipe.steps, &(&1.space == :work))
  end

  defp exploration_step_count(recipe) do
    case Map.get(recipe, :work_steps) do
      nil -> Enum.count(recipe.steps, &(&1.space != :work))
      _ -> 0
    end
  end

  defp state_file_path(project_path) do
    Path.join([project_path, ".bropilot", @state_filename])
  end

  defp persist_state(state) do
    path = state_file_path(state.project_path)
    tmp_path = path <> ".tmp.#{:rand.uniform(1_000_000)}"

    steps = work_steps(state.recipe)

    step_statuses =
      steps
      |> Enum.with_index()
      |> Enum.map(fn {step, index} ->
        status =
          cond do
            MapSet.member?(state.completed_steps, step.id) -> "completed"
            state.phase == :work and index == state.work_step_index -> "in_progress"
            true -> "pending"
          end

        {step.id, status}
      end)
      |> Map.new()

    data = %{
      "phase" => Atom.to_string(state.phase),
      "work_step_index" => state.work_step_index,
      "completed_steps" => MapSet.to_list(state.completed_steps) |> Enum.sort(),
      "step_statuses" => step_statuses
    }

    content = Bropilot.Yaml.encode(data)
    File.mkdir_p!(Path.dirname(path))

    case File.write(tmp_path, content) do
      :ok ->
        File.rename!(tmp_path, path)

      {:error, reason} ->
        Logger.warning("Failed to persist pipeline state: #{inspect(reason)}")
        File.rm(tmp_path)
    end
  end

  defp load_persisted_state(project_path, recipe) do
    path = state_file_path(project_path)

    case File.exists?(path) do
      false ->
        {:exploration, 0, MapSet.new()}

      true ->
        case Bropilot.Yaml.decode_file(path) do
          {:ok, data} when is_map(data) ->
            parse_persisted_data(data, recipe)

          _ ->
            Logger.warning("Pipeline state file at #{path} unreadable, defaulting to exploration")
            {:exploration, 0, MapSet.new()}
        end
    end
  end

  defp parse_persisted_data(data, recipe) do
    steps = work_steps(recipe)
    max_work = length(steps)

    completed =
      (Map.get(data, "completed_steps") || [])
      |> Enum.filter(&is_binary/1)
      |> MapSet.new()

    cond do
      Map.has_key?(data, "phase") ->
        phase =
          case Map.get(data, "phase") do
            "exploration" -> :exploration
            "work" -> :work
            "complete" -> :complete
            _ -> :exploration
          end

        work_index = Map.get(data, "work_step_index", 0)

        work_index =
          if is_integer(work_index) and work_index >= 0 and
               (max_work == 0 or work_index < max_work),
             do: work_index,
             else: 0

        {phase, work_index, completed}

      Map.has_key?(data, "current_step_index") ->
        # Backward-compat: migrate old format
        old_index = Map.get(data, "current_step_index")
        explore_count = exploration_step_count(recipe)

        cond do
          not is_integer(old_index) ->
            Logger.warning("Old pipeline state has invalid index, defaulting to exploration")
            {:exploration, 0, completed}

          old_index < explore_count ->
            {:exploration, 0, completed}

          true ->
            work_index = old_index - explore_count

            if max_work > 0 and work_index < max_work do
              {:work, work_index, completed}
            else
              Logger.warning("Old pipeline state ambiguous, defaulting to exploration")
              {:exploration, 0, completed}
            end
        end

      true ->
        {:exploration, 0, completed}
    end
  end
end

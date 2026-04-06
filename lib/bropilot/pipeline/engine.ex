defmodule Bropilot.Pipeline.Engine do
  @moduledoc """
  Pipeline execution engine. Holds the current position in the recipe pipeline,
  tracks step completion, and enforces space-gate validation when crossing
  space boundaries.

  State is persisted to `.bropilot/pipeline_state.yaml` on every advance and
  mark_complete call so the pipeline resumes after server restart.
  """

  use GenServer

  require Logger

  alias Bropilot.Recipe.Registry
  alias Bropilot.Spaces

  @state_filename "pipeline_state.yaml"

  # -- Public API --

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts)
  end

  @doc "Starts an unlinked engine (not tied to the caller's lifecycle)."
  def start(opts) do
    GenServer.start(__MODULE__, opts)
  end

  def current_step(pid) do
    GenServer.call(pid, :current_step)
  end

  def advance(pid) do
    GenServer.call(pid, :advance)
  end

  def step_status(pid) do
    GenServer.call(pid, :step_status)
  end

  def mark_complete(pid, step_id) do
    GenServer.call(pid, {:mark_complete, step_id})
  end

  # -- GenServer callbacks --

  @impl true
  def init(opts) do
    project_path = Keyword.fetch!(opts, :project_path)
    recipe_dir = Path.join([project_path, ".bropilot", "recipe"])

    case Registry.load(recipe_dir) do
      {:ok, recipe} ->
        {step_index, completed} = load_persisted_state(project_path, length(recipe.steps))

        state = %{
          project_path: project_path,
          recipe: recipe,
          current_step_index: step_index,
          completed_steps: completed
        }

        {:ok, state}

      {:error, reason} ->
        {:stop, reason}
    end
  end

  @impl true
  def handle_call(:current_step, _from, state) do
    step = Enum.at(state.recipe.steps, state.current_step_index)
    {:reply, step, state}
  end

  @impl true
  def handle_call(:advance, _from, state) do
    current_step = Enum.at(state.recipe.steps, state.current_step_index)
    next_index = state.current_step_index + 1
    next_step = Enum.at(state.recipe.steps, next_index)

    cond do
      next_step == nil ->
        {:reply, {:error, :pipeline_complete}, state}

      current_step.space != next_step.space ->
        map_dir = Path.join([state.project_path, ".bropilot", "map"])

        case Spaces.validate_gate(map_dir, current_step.space) do
          :ok ->
            new_state = %{state | current_step_index: next_index}
            persist_state(new_state)
            {:reply, {:ok, next_step}, new_state}

          {:error, _reason} = error ->
            {:reply, error, state}
        end

      true ->
        new_state = %{state | current_step_index: next_index}
        persist_state(new_state)
        {:reply, {:ok, next_step}, new_state}
    end
  end

  @impl true
  def handle_call(:step_status, _from, state) do
    statuses =
      state.recipe.steps
      |> Enum.with_index()
      |> Enum.map(fn {step, index} ->
        status =
          cond do
            MapSet.member?(state.completed_steps, step.id) -> :completed
            index == state.current_step_index -> :in_progress
            true -> :pending
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

  # -- Persistence helpers --

  defp state_file_path(project_path) do
    Path.join([project_path, ".bropilot", @state_filename])
  end

  @doc false
  defp persist_state(state) do
    path = state_file_path(state.project_path)
    tmp_path = path <> ".tmp.#{:rand.uniform(1_000_000)}"

    step_statuses =
      state.recipe.steps
      |> Enum.with_index()
      |> Enum.map(fn {step, index} ->
        status =
          cond do
            MapSet.member?(state.completed_steps, step.id) -> "completed"
            index == state.current_step_index -> "in_progress"
            true -> "pending"
          end

        {step.id, status}
      end)
      |> Map.new()

    data = %{
      "current_step_index" => state.current_step_index,
      "completed_steps" => MapSet.to_list(state.completed_steps) |> Enum.sort(),
      "step_statuses" => step_statuses
    }

    content = Bropilot.Yaml.encode(data)

    # Atomic write: write to tmp file, then rename
    File.mkdir_p!(Path.dirname(path))

    case File.write(tmp_path, content) do
      :ok ->
        File.rename!(tmp_path, path)

      {:error, reason} ->
        Logger.warning("Failed to persist pipeline state: #{inspect(reason)}")
        # Clean up tmp file if it exists
        File.rm(tmp_path)
    end
  end

  defp load_persisted_state(project_path, max_steps) do
    path = state_file_path(project_path)

    case File.exists?(path) do
      false ->
        {0, MapSet.new()}

      true ->
        case Bropilot.Yaml.decode_file(path) do
          {:ok, data} when is_map(data) ->
            parse_persisted_data(data, max_steps)

          {:ok, _} ->
            Logger.warning(
              "Pipeline state file at #{path} has unexpected format, defaulting to step 0"
            )

            {0, MapSet.new()}

          {:error, reason} ->
            Logger.warning(
              "Failed to read pipeline state from #{path}: #{inspect(reason)}, defaulting to step 0"
            )

            {0, MapSet.new()}
        end
    end
  end

  defp parse_persisted_data(data, max_steps) do
    step_index = Map.get(data, "current_step_index")
    completed = Map.get(data, "completed_steps")

    cond do
      not is_integer(step_index) ->
        Logger.warning("Pipeline state has invalid current_step_index, defaulting to step 0")
        {0, MapSet.new()}

      step_index < 0 or step_index >= max_steps ->
        Logger.warning(
          "Pipeline state has out-of-range step index #{step_index}, defaulting to step 0"
        )

        {0, MapSet.new()}

      not is_list(completed) and not is_nil(completed) ->
        Logger.warning("Pipeline state has invalid completed_steps, defaulting to step 0")
        {0, MapSet.new()}

      true ->
        completed_set =
          (completed || [])
          |> Enum.filter(&is_binary/1)
          |> MapSet.new()

        {step_index, completed_set}
    end
  end
end

defmodule Bropilot.Recipe.Registry do
  @moduledoc """
  Loads, validates, and caches recipe definitions.
  Ensures every recipe maps its steps to the immutable spaces.
  """

  use GenServer

  alias Bropilot.Spaces

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def load(recipe_dir) do
    GenServer.call(__MODULE__, {:load, recipe_dir})
  end

  def get do
    GenServer.call(__MODULE__, :get)
  end

  @impl true
  def init(_opts) do
    {:ok, %{recipe: nil}}
  end

  @impl true
  def handle_call({:load, recipe_dir}, _from, state) do
    case do_load(recipe_dir) do
      {:ok, recipe} ->
        case validate(recipe) do
          :ok -> {:reply, {:ok, recipe}, %{state | recipe: recipe}}
          error -> {:reply, error, state}
        end

      error ->
        {:reply, error, state}
    end
  end

  @impl true
  def handle_call(:get, _from, state) do
    {:reply, state.recipe, state}
  end

  defp do_load(recipe_dir) do
    with {:ok, meta} <- Bropilot.Yaml.decode_file(Path.join(recipe_dir, "recipe.yaml")),
         {:ok, pipeline} <- Bropilot.Yaml.decode_file(Path.join(recipe_dir, "pipeline.yaml")) do
      base = %{
        name: meta["name"],
        version: meta["version"],
        description: meta["description"],
        dir: recipe_dir
      }

      recipe =
        cond do
          is_list(pipeline["phases"]) ->
            parse_phases(pipeline, base)

          true ->
            parse_acts(pipeline, base)
        end

      {:ok, recipe}
    end
  end

  defp parse_phases(pipeline, base) do
    phases = pipeline["phases"] || []
    exploration = Enum.find(phases, fn p -> p["id"] == "exploration" end) || %{}
    work = Enum.find(phases, fn p -> p["id"] == "work" end) || %{}

    lenses =
      (exploration["lenses"] || [])
      |> Enum.map(&parse_lens/1)

    work_steps =
      (work["steps"] || [])
      |> Enum.map(&parse_step/1)

    commit_gate = parse_commit_gate(exploration["commit_gate"])

    Map.merge(base, %{
      phases: phases,
      exploration_lenses: lenses,
      work_steps: work_steps,
      commit_gate: commit_gate,
      steps: work_steps
    })
  end

  defp parse_lens(lens) do
    targets = lens["targets"] || %{}

    %{
      id: lens["id"],
      name: lens["name"],
      description: lens["description"],
      prompt: lens["prompt"],
      targets: %{
        problem: Enum.map(targets["problem"] || [], &String.to_atom/1),
        solution: Enum.map(targets["solution"] || [], &String.to_atom/1)
      },
      knowledge_contributes:
        Enum.map(lens["knowledge_contributes"] || [], &String.to_atom/1),
      measurement_contributes:
        Enum.map(lens["measurement_contributes"] || [], &String.to_atom/1),
      questions: lens["questions"],
      guiding_questions: lens["guiding_questions"]
    }
  end

  defp parse_step(step) do
    %{
      id: step["id"],
      name: step["name"],
      space: String.to_atom(step["space"]),
      space_slots: Enum.map(step["space_slots"] || [], &String.to_atom/1),
      knowledge_contributes:
        Enum.map(step["knowledge_contributes"] || [], &String.to_atom/1),
      measurement_contributes:
        Enum.map(step["measurement_contributes"] || [], &String.to_atom/1)
    }
  end

  defp parse_commit_gate(nil), do: nil

  defp parse_commit_gate(gate) do
    %{
      validates: Enum.map(gate["validates"] || [], &String.to_atom/1),
      description: gate["description"]
    }
  end

  defp parse_acts(pipeline, base) do
    steps =
      pipeline
      |> Map.get("acts", [])
      |> Enum.flat_map(fn act ->
        act
        |> Map.get("steps", [])
        |> Enum.map(&parse_step/1)
      end)

    work_steps = Enum.filter(steps, fn s -> s.space == :work end)

    Map.merge(base, %{
      acts: pipeline["acts"],
      steps: steps,
      work_steps: work_steps,
      exploration_lenses: [],
      commit_gate: nil
    })
  end

  defp validate(recipe) do
    Spaces.validate_recipe(recipe)
  end
end

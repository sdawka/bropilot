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
      steps =
        pipeline
        |> Map.get("acts", [])
        |> Enum.flat_map(fn act ->
          act
          |> Map.get("steps", [])
          |> Enum.map(fn step ->
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
          end)
        end)

      {:ok,
       %{
         name: meta["name"],
         version: meta["version"],
         description: meta["description"],
         acts: pipeline["acts"],
         steps: steps,
         dir: recipe_dir
       }}
    end
  end

  defp validate(recipe) do
    Spaces.validate_recipe(recipe)
  end
end

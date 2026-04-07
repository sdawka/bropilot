defmodule Bropilot.Spaces do
  @moduledoc """
  The immutable abstract layer. Defines the 5 fundamental spaces that any
  app-building process must traverse. No recipe can add, remove, or rename these.

  Spaces:
    - Problem:     Why we're building. The mess before the solution.
    - Solution:    What the thing is. The model, language, architecture.
    - Work:        How and when things get built.
    - Measurement: How we know if we're right. Spans all other spaces.
    - Knowledge:   The self-referential documentation layer.
  """

  alias Bropilot.Spaces.Space

  @space_ids [:problem, :solution, :work, :measurement, :knowledge]
  @primary_space_ids [:problem, :solution, :work]

  def all, do: Enum.map(@space_ids, &definition/1)
  def ids, do: @space_ids
  def primary_ids, do: @primary_space_ids

  def definition(:problem) do
    %Space{
      id: :problem,
      name: "Problem Space",
      description: "Understanding what exists, who suffers, and why it matters.",
      governs: "Why we're building. The mess before the solution.",
      cross_cutting?: false,
      required_slots: [
        %{id: :audience, name: "Audience", type: :file, required: true},
        %{id: :problem, name: "Problem", type: :file, required: true},
        %{id: :context, name: "Context", type: :file, required: true},
        %{id: :assumptions, name: "Assumptions", type: :file, required: true},
        %{id: :hypotheses, name: "Hypotheses", type: :file, required: true}
      ]
    }
  end

  def definition(:solution) do
    %Space{
      id: :solution,
      name: "Solution Space",
      description: "Designing what to build and how it hangs together.",
      governs: "What the thing is. The model, the language, the architecture.",
      cross_cutting?: false,
      required_slots: [
        %{id: :vocabulary, name: "Vocabulary", type: :file, required: true},
        %{id: :domain, name: "Domain", type: :directory, required: true},
        %{id: :flows, name: "Flows", type: :directory, required: true},
        %{id: :architecture, name: "Architecture", type: :directory, required: true},
        %{id: :specs, name: "Specifications", type: :directory, required: true}
      ]
    }
  end

  def definition(:work) do
    %Space{
      id: :work,
      name: "Work Space",
      description: "Turning specs into real artifacts through ordered, tracked tasks.",
      governs: "How and when things get built.",
      cross_cutting?: false,
      required_slots: [
        %{id: :versions, name: "Versions", type: :directory, required: true}
      ]
    }
  end

  def definition(:measurement) do
    %Space{
      id: :measurement,
      name: "Measurement Space",
      description: "How we know if we're right. Validation, testing, analytics.",
      governs: "Verification across all other spaces. Spans the entire pipeline.",
      cross_cutting?: true,
      required_slots: [
        %{id: :validation, name: "Validation", type: :directory, required: true}
      ]
    }
  end

  def definition(:knowledge) do
    %Space{
      id: :knowledge,
      name: "Knowledge Space",
      description: "The self-referential documentation layer.",
      governs: "The evolving shared understanding. Feeds back into all other spaces.",
      cross_cutting?: true,
      required_slots: [
        %{id: :glossary, name: "Glossary", type: :file, required: true},
        %{id: :decisions, name: "Decisions", type: :directory, required: true},
        %{id: :changelog, name: "Changelog", type: :file, required: true},
        %{id: :xrefs, name: "Cross-References", type: :file, required: true}
      ]
    }
  end

  def definition(id), do: {:error, {:unknown_space, id}}

  @doc """
  Validates that a recipe covers all primary spaces.
  Every recipe must have at least one step mapped to each primary space.
  Measurement and Knowledge are cross-cutting and fed via secondary contributions.
  """
  def validate_recipe(recipe) do
    lenses = Map.get(recipe, :exploration_lenses, [])

    cond do
      # New format: has non-empty exploration lenses
      is_list(lenses) and lenses != [] ->
        validate_new_recipe(recipe)

      # Old format fallback: validate against recipe.steps
      true ->
        primary_spaces =
          recipe.steps
          |> Enum.map(& &1.space)
          |> Enum.uniq()

        missing = @primary_space_ids -- primary_spaces

        case missing do
          [] -> :ok
          ids -> {:error, {:missing_spaces, ids}}
        end
    end
  end

  defp validate_new_recipe(recipe) do
    lenses = recipe.exploration_lenses || []
    work_steps = recipe.work_steps || []

    has_problem? =
      Enum.any?(lenses, fn lens ->
        targets = Map.get(lens, :targets, %{})
        Map.has_key?(targets, :problem)
      end)

    has_solution? =
      Enum.any?(lenses, fn lens ->
        targets = Map.get(lens, :targets, %{})
        Map.has_key?(targets, :solution)
      end)

    has_work? = Enum.any?(work_steps, &(&1.space == :work))

    missing =
      []
      |> then(fn acc -> if has_problem?, do: acc, else: [:problem | acc] end)
      |> then(fn acc -> if has_solution?, do: acc, else: [:solution | acc] end)
      |> then(fn acc -> if has_work?, do: acc, else: [:work | acc] end)

    case missing do
      [] -> :ok
      ids -> {:error, {:missing_spaces, Enum.reverse(ids)}}
    end
  end

  @doc """
  Validates the single commitment gate: both Problem and Solution slots
  must be filled before transitioning to Work phase.
  """
  def validate_commitment_gate(map_path) do
    problem_result = validate_gate(map_path, :problem)
    solution_result = validate_gate(map_path, :solution)

    case {problem_result, solution_result} do
      {:ok, :ok} ->
        :ok

      _ ->
        problem_missing =
          case problem_result do
            {:error, {:unfilled_slots, slots}} -> slots
            :ok -> []
          end

        solution_missing =
          case solution_result do
            {:error, {:unfilled_slots, slots}} -> slots
            :ok -> []
          end

        {:error, {:unfilled_slots, %{problem: problem_missing, solution: solution_missing}}}
    end
  end

  @doc """
  Validates that a map has the required slots filled for a given space
  before advancing to the next space.
  """
  def validate_gate(map_path, from_space) do
    space = definition(from_space)

    missing =
      space.required_slots
      |> Enum.filter(& &1.required)
      |> Enum.reject(fn slot ->
        path = Path.join([map_path, Atom.to_string(from_space), Atom.to_string(slot.id)])

        case slot.type do
          :file -> File.exists?(path <> ".yaml") or File.exists?(path <> ".yml")
          :directory -> File.dir?(path)
        end
      end)

    case missing do
      [] -> :ok
      slots -> {:error, {:unfilled_slots, Enum.map(slots, & &1.id)}}
    end
  end

  @doc """
  Generates the spaces.lock content -- a YAML representation of all space contracts.
  This file is written to .bropilot/spaces.lock and should never be edited.
  """
  def generate_lock do
    spaces =
      Enum.map(@space_ids, fn id ->
        space = definition(id)

        %{
          "id" => Atom.to_string(space.id),
          "name" => space.name,
          "description" => space.description,
          "governs" => space.governs,
          "cross_cutting" => space.cross_cutting?,
          "required_slots" =>
            Enum.map(space.required_slots, fn slot ->
              %{
                "id" => Atom.to_string(slot.id),
                "name" => slot.name,
                "type" => Atom.to_string(slot.type),
                "required" => slot.required
              }
            end)
        }
      end)

    %{
      "version" => "1.0.0",
      "generated_by" => "bropilot",
      "immutable" => true,
      "warning" => "DO NOT EDIT. This file is generated by Bropilot core.",
      "spaces" => spaces
    }
  end
end

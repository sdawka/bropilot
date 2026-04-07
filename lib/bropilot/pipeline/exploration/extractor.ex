defmodule Bropilot.Pipeline.Exploration.Extractor do
  @moduledoc """
  Coordinator that orchestrates extraction across both Problem and Solution
  spaces from a freeform conversation. Reuses the pure functions from
  `Bropilot.Pipeline.Act1.Extractor` and `Bropilot.Pipeline.Act2.Extractor`.
  """

  alias Bropilot.Pipeline.Act1.Extractor, as: Act1Extractor
  alias Bropilot.Pipeline.Act2.Extractor, as: Act2Extractor
  alias Bropilot.Storage

  @doc """
  Run extraction across both Problem and Solution spaces from conversation history.

  ## Options
    * `:mode` — `:mock` (default) or `:llm`
    * `:llm_opts` — keyword list passed to `Bropilot.LLM.extract_yaml/2`

  Returns `{:ok, %{problem: map, solution: map, written_slots: [atom]}}` or
  `{:error, reason}`.
  """
  def extract_all(conversation, recipe, map_dir, opts \\ []) do
    mode = Keyword.get(opts, :mode, :mock)
    llm_opts = Keyword.get(opts, :llm_opts, [])

    text = conversation_to_text(conversation)

    if String.trim(text) == "" do
      {:ok, %{problem: %{}, solution: %{}, written_slots: []}}
    else
      with {:ok, problem_data} <- extract_problem(text, recipe, mode, llm_opts) do
        problem_written = write_problem(map_dir, problem_data)

        case extract_solution(text, recipe, map_dir, mode, llm_opts) do
          {:ok, solution_data} ->
            solution_written = write_solution(map_dir, solution_data)

            {:ok,
             %{
               problem: problem_data,
               solution: solution_data,
               written_slots: problem_written ++ solution_written
             }}

          error ->
            error
        end
      end
    end
  end

  # -- Conversation formatting --

  defp conversation_to_text(text) when is_binary(text), do: text

  defp conversation_to_text(messages) when is_list(messages) do
    messages
    |> Enum.map(fn
      %{role: role, text: text} -> "#{role}: #{text}"
      %{"role" => role, "text" => text} -> "#{role}: #{text}"
      bin when is_binary(bin) -> bin
    end)
    |> Enum.join("\n")
  end

  defp conversation_to_text(_), do: ""

  # -- Problem extraction --

  defp extract_problem(_text, _recipe, :mock, _llm_opts) do
    with {:ok, step1} <- mock_problem_step1(),
         {:ok, step2} <- mock_problem_step2() do
      {:ok, Map.merge(step1, step2)}
    end
  end

  defp extract_problem(text, recipe, :llm, llm_opts) do
    step1_recipe_prompt = read_prompt(recipe, "prompts/step1-basics.md")
    step2_recipe_prompt = read_prompt(recipe, "prompts/step2-gory-detail.md")

    step1_prompt = Act1Extractor.build_step1_prompt(step1_recipe_prompt, text)

    with {:ok, step1} <- Bropilot.LLM.extract_yaml(step1_prompt, llm_opts) do
      step2_prompt = Act1Extractor.build_step2_prompt(step2_recipe_prompt, ["Tell us more"], [text])

      case Bropilot.LLM.extract_yaml(step2_prompt, llm_opts) do
        {:ok, step2} -> {:ok, Map.merge(step1, step2)}
        error -> error
      end
    end
  end

  defp mock_problem_step1 do
    # Mirror Act1.Worker.extract_mock(:step1) inline (keeping deterministic
    # mock without depending on Worker module).
    {:ok,
     %{
       "name" => "TodoApp",
       "purpose" => "A task management application for teams",
       "problem" => "Users struggle to manage tasks and collaborate within shared workspaces",
       "context" => "Current task management tools are insufficient for team collaboration",
       "glossary_terms" => [
         %{"term" => "TodoApp", "definition" => "The application being built"}
       ]
     }}
  end

  defp mock_problem_step2 do
    {:ok,
     %{
       "audience" => "Users who need task management and workspace collaboration tools",
       "use_cases" => ["Create and assign tasks", "Organize work in workspaces", "Track task completion"],
       "capabilities" => ["Task management", "Workspace collaboration", "User authentication"],
       "design" => "Clean and minimal interface",
       "volo" => "Task management made effortless",
       "hypotheses" => ["Users want simpler task management workflows"],
       "assumptions" => ["Users know basic task management concepts"]
     }}
  end

  # -- Solution extraction --

  defp extract_solution(_text, _recipe, _map_dir, :mock, _llm_opts) do
    domain = Act2Extractor.mock_domain_data()
    specs = Act2Extractor.mock_specs_data()
    {:ok, Map.merge(domain, %{"specs" => specs})}
  end

  defp extract_solution(text, recipe, map_dir, :llm, llm_opts) do
    step3_recipe_prompt = read_prompt(recipe, "prompts/step3-big-picture.md")
    step4_recipe_prompt = read_prompt(recipe, "prompts/step4-specs.md")

    problem_data = read_problem_data(map_dir)
    step3_prompt = Act2Extractor.build_step3_prompt(step3_recipe_prompt, problem_data, [text])

    with {:ok, domain} <- Bropilot.LLM.extract_yaml(step3_prompt, llm_opts) do
      step4_prompt = Act2Extractor.build_step4_prompt(step4_recipe_prompt, domain)

      case Bropilot.LLM.extract_yaml(step4_prompt, llm_opts) do
        {:ok, specs} -> {:ok, Map.merge(domain, %{"specs" => specs})}
        error -> error
      end
    end
  end

  defp read_prompt(recipe, rel) when is_binary(recipe) do
    path = Path.join(recipe, rel)
    if File.exists?(path), do: File.read!(path), else: ""
  end

  defp read_prompt(_, _), do: ""

  defp read_problem_data(map_dir) do
    [:problem, :context, :audience, :assumptions, :hypotheses]
    |> Enum.reduce(%{}, fn slot, acc ->
      case Storage.read(map_dir, :problem, slot) do
        {:ok, data} -> Map.put(acc, Atom.to_string(slot), data)
        _ -> acc
      end
    end)
  end

  # -- Map writers --

  defp write_problem(map_dir, data) do
    File.mkdir_p!(Path.join(map_dir, "problem"))

    written = []

    written =
      maybe_write(map_dir, :problem, :problem, data["problem"], "problem", written)

    written =
      maybe_write(map_dir, :problem, :context, data["context"], "context", written)

    written =
      maybe_write(map_dir, :problem, :audience, data["audience"], "audience", written)

    written =
      maybe_write_list(map_dir, :problem, :assumptions, data["assumptions"], "assumptions", written)

    written =
      maybe_write_list(map_dir, :problem, :hypotheses, data["hypotheses"], "hypotheses", written)

    if data["name"] || data["purpose"] do
      File.write!(
        Path.join(map_dir, "project.yaml"),
        Bropilot.Yaml.encode(%{"name" => data["name"], "purpose" => data["purpose"]})
      )
    end

    Enum.reverse(written)
  end

  defp write_solution(map_dir, data) do
    File.mkdir_p!(Path.join(map_dir, "solution"))

    written = []

    written =
      if data["vocabulary"] do
        Storage.write(map_dir, :solution, :vocabulary, %{"terms" => data["vocabulary"]})
        [:vocabulary | written]
      else
        written
      end

    written =
      if data["entities"] do
        Storage.write(map_dir, :solution, :"domain/entities", %{"entities" => data["entities"]})
        [:"domain/entities" | written]
      else
        written
      end

    written =
      if data["relationships"] do
        Storage.write(map_dir, :solution, :"domain/relationships", %{
          "relationships" => data["relationships"]
        })

        [:"domain/relationships" | written]
      else
        written
      end

    written =
      if data["user_flows"] do
        Storage.write(map_dir, :solution, :"flows/user-flows", %{"flows" => data["user_flows"]})
        [:"flows/user-flows" | written]
      else
        written
      end

    written =
      if data["system_flows"] do
        Storage.write(map_dir, :solution, :"flows/system-flows", %{"flows" => data["system_flows"]})
        [:"flows/system-flows" | written]
      else
        written
      end

    written =
      if data["architecture_components"] do
        Storage.write(map_dir, :solution, :"architecture/components", %{
          "components" => data["architecture_components"]
        })

        [:"architecture/components" | written]
      else
        written
      end

    written =
      if data["architecture_dependencies"] do
        Storage.write(map_dir, :solution, :"architecture/dependencies", %{
          "dependencies" => data["architecture_dependencies"]
        })

        [:"architecture/dependencies" | written]
      else
        written
      end

    written =
      case data["specs"] do
        nil ->
          written

        specs when is_map(specs) ->
          spec_keys = ~w(api behaviours constraints entities modules events externals views components streams infra)

          Enum.reduce(spec_keys, written, fn k, acc ->
            if specs[k] do
              Storage.write(map_dir, :solution, :"specs/#{k}", %{k => specs[k]})
              [:"specs/#{k}" | acc]
            else
              acc
            end
          end)
      end

    Enum.reverse(written)
  end

  defp maybe_write(_map_dir, _space, _slot, nil, _key, written), do: written
  defp maybe_write(_map_dir, _space, _slot, "", _key, written), do: written

  defp maybe_write(map_dir, space, slot, value, key, written) do
    Storage.write(map_dir, space, slot, %{key => value})
    [slot | written]
  end

  defp maybe_write_list(_map_dir, _space, _slot, nil, _key, written), do: written
  defp maybe_write_list(_map_dir, _space, _slot, [], _key, written), do: written

  defp maybe_write_list(map_dir, space, slot, value, key, written) do
    Storage.write(map_dir, space, slot, %{key => value})
    [slot | written]
  end
end

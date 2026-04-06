defmodule Bropilot.Pipeline.Act2.Worker do
  @moduledoc """
  GenServer that orchestrates Act 2 (Domain Modeling + Spec Expansion).
  Walks through Step 3 (big picture domain model) and Step 4 (specs expansion),
  reading Problem Space data and producing Solution Space artifacts.

  ## States

    - `:idle` — just started, no step running
    - `:step3` — step3 prompt built, awaiting extraction
    - `:step3_done` — step3 extracted and written to map
    - `:step4` — step4 prompt built, awaiting extraction
    - `:complete` — both steps extracted and written
  """

  use GenServer

  alias Bropilot.Pipeline.Act2.Extractor
  alias Bropilot.Storage

  defstruct [
    :project_path,
    :recipe,
    :map_dir,
    :step3_prompt,
    :step3_data,
    :step4_prompt,
    :step4_data,
    :domain_input,
    step: :idle,
    extraction_mode: :mock,
    llm_opts: []
  ]

  # -- Client API --

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts)
  end

  @doc "Starts an unlinked worker (not tied to the caller's lifecycle)."
  def start(opts) do
    GenServer.start(__MODULE__, opts)
  end

  @doc "Start step 3 (domain model). Returns `{:ok, prompt_text}`."
  def run_step3(pid) do
    GenServer.call(pid, :run_step3)
  end

  @doc "Start step 4 (specs expansion). Returns `{:ok, prompt_text}`."
  def run_step4(pid) do
    GenServer.call(pid, :run_step4)
  end

  @doc "Submit the user's domain description text."
  def submit_input(pid, text) do
    GenServer.call(pid, {:submit_input, text})
  end

  @doc "Submit LLM extraction output as a YAML string. Parses and writes to map."
  def submit_extraction(pid, yaml_string) do
    GenServer.call(pid, {:submit_extraction, yaml_string})
  end

  @doc "Run extraction for the current step. Writes results to the map."
  def extract(pid) do
    GenServer.call(pid, :extract)
  end

  # -- Server Callbacks --

  @impl true
  def init(opts) do
    project_path = Keyword.fetch!(opts, :project_path)
    recipe = Keyword.fetch!(opts, :recipe)
    extraction_mode = Keyword.get(opts, :extraction_mode, :mock)
    llm_opts = Keyword.get(opts, :llm_opts, [])
    map_dir = Path.join([project_path, ".bropilot", "map"])

    {:ok,
     %__MODULE__{
       project_path: project_path,
       recipe: recipe,
       map_dir: map_dir,
       extraction_mode: extraction_mode,
       llm_opts: llm_opts
     }}
  end

  @impl true
  def handle_call(:run_step3, _from, %{step: :idle} = state) do
    prompt_path = Path.join(state.recipe, "prompts/step3-big-picture.md")
    recipe_prompt = File.read!(prompt_path)

    # Read pipeline.yaml for guiding questions
    {:ok, pipeline} = Bropilot.Yaml.decode_file(Path.join(state.recipe, "pipeline.yaml"))

    guiding_questions =
      pipeline["acts"]
      |> Enum.find(&(&1["id"] == "act2"))
      |> Map.get("steps", [])
      |> Enum.find(&(&1["id"] == "step3"))
      |> Map.get("guiding_questions", [])

    # Read all Problem Space data from the map
    problem_data = read_problem_data(state.map_dir)

    prompt = Extractor.build_step3_prompt(recipe_prompt, problem_data, guiding_questions)

    {:reply, {:ok, prompt}, %{state | step: :step3, step3_prompt: prompt}}
  end

  @impl true
  def handle_call(:run_step4, _from, %{step: :step3_done} = state) do
    prompt_path = Path.join(state.recipe, "prompts/step4-specs.md")
    recipe_prompt = File.read!(prompt_path)

    # Read domain model data from the map
    domain_data = read_domain_data(state.map_dir)

    prompt = Extractor.build_step4_prompt(recipe_prompt, domain_data)

    {:reply, {:ok, prompt}, %{state | step: :step4, step4_prompt: prompt}}
  end

  @impl true
  def handle_call({:submit_input, text}, _from, %{step: :step3} = state) do
    {:reply, :ok, %{state | domain_input: text}}
  end

  @impl true
  def handle_call({:submit_extraction, yaml_string}, _from, %{step: :step3} = state) do
    case Extractor.parse_domain_output(yaml_string) do
      {:ok, data} ->
        write_step3(state.map_dir, data)
        {:reply, {:ok, data}, %{state | step: :step3_done, step3_data: data}}

      error ->
        {:reply, error, state}
    end
  end

  @impl true
  def handle_call({:submit_extraction, yaml_string}, _from, %{step: :step4} = state) do
    case Extractor.parse_specs_output(yaml_string) do
      {:ok, data} ->
        write_step4(state.map_dir, data)
        {:reply, {:ok, data}, %{state | step: :complete, step4_data: data}}

      error ->
        {:reply, error, state}
    end
  end

  @impl true
  def handle_call(:extract, _from, %{step: :step3} = state) do
    case do_extract(:step3, state) do
      {:ok, data} when is_map(data) ->
        write_step3(state.map_dir, data)
        {:reply, {:ok, data}, %{state | step: :step3_done, step3_data: data}}

      {:ok, prompt_text} when is_binary(prompt_text) ->
        # LLM mode: return prompt, no map writes yet
        {:reply, {:ok, prompt_text}, %{state | step: :step3_done}}

      error ->
        {:reply, error, state}
    end
  end

  @impl true
  def handle_call(:extract, _from, %{step: :step4} = state) do
    case do_extract(:step4, state) do
      {:ok, data} when is_map(data) ->
        write_step4(state.map_dir, data)
        {:reply, {:ok, data}, %{state | step: :complete, step4_data: data}}

      {:ok, prompt_text} when is_binary(prompt_text) ->
        # LLM mode: return prompt, no map writes yet
        {:reply, {:ok, prompt_text}, %{state | step: :complete}}

      error ->
        {:reply, error, state}
    end
  end

  # Catch-all for run_step3 in unexpected states
  @impl true
  def handle_call(:run_step3, _from, state) do
    {:reply, {:error, "cannot run step3 in state #{state.step}"}, state}
  end

  # Catch-all for run_step4 in unexpected states
  @impl true
  def handle_call(:run_step4, _from, state) do
    {:reply, {:error, "cannot run step4 in state #{state.step} — step3 extraction must complete first"}, state}
  end

  # Catch-all for extract in unexpected states
  @impl true
  def handle_call(:extract, _from, state) do
    {:reply, {:error, "cannot extract in state #{state.step}"}, state}
  end

  # -- Extraction Functions --

  defp do_extract(step, state) do
    case state.extraction_mode do
      :mock -> extract_mock(step)
      :llm -> extract_with_llm(step, state)
    end
  end

  @doc """
  Returns hardcoded structured data for testing without an LLM.
  """
  def extract_mock(:step3), do: {:ok, Extractor.mock_domain_data()}
  def extract_mock(:step4), do: {:ok, Extractor.mock_specs_data()}

  @doc """
  Sends the already-built prompt to the LLM via
  `Bropilot.LLM.extract_yaml/2`. Returns `{:ok, parsed_map}` or
  `{:error, reason}`.
  """
  def extract_with_llm(:step3, state) do
    Bropilot.LLM.extract_yaml(state.step3_prompt, state.llm_opts)
  end

  def extract_with_llm(:step4, state) do
    Bropilot.LLM.extract_yaml(state.step4_prompt, state.llm_opts)
  end

  # -- Map Readers --

  defp read_problem_data(map_dir) do
    slots = [
      {:problem, "problem"},
      {:context, "context"},
      {:audience, "audience"},
      {:assumptions, "assumptions"},
      {:hypotheses, "hypotheses"},
      {:"vibes/basics", "vibes/basics"}
    ]

    Enum.reduce(slots, %{}, fn {slot, key}, acc ->
      case Storage.read(map_dir, :problem, slot) do
        {:ok, data} -> Map.put(acc, key, data)
        _ -> acc
      end
    end)
  end

  defp read_domain_data(map_dir) do
    vocab =
      case Storage.read(map_dir, :solution, :vocabulary) do
        {:ok, data} -> data
        _ -> %{}
      end

    domain =
      case Storage.read(map_dir, :solution, :domain) do
        {:ok, data} -> data
        _ -> %{}
      end

    flows =
      case Storage.read(map_dir, :solution, :flows) do
        {:ok, data} -> data
        _ -> %{}
      end

    arch =
      case Storage.read(map_dir, :solution, :architecture) do
        {:ok, data} -> data
        _ -> %{}
      end

    %{
      "vocabulary" => vocab,
      "domain" => domain,
      "flows" => flows,
      "architecture" => arch
    }
  end

  # -- Map Writers --

  defp write_step3(map_dir, data) do
    # vocabulary.yaml at map/solution/vocabulary.yaml
    Storage.write(map_dir, :solution, :vocabulary, %{"terms" => data["vocabulary"]})

    # domain/entities.yaml
    Storage.write(map_dir, :solution, :"domain/entities", %{"entities" => data["entities"]})

    # domain/relationships.yaml
    Storage.write(map_dir, :solution, :"domain/relationships", %{
      "relationships" => data["relationships"]
    })

    # flows/user-flows.yaml
    Storage.write(map_dir, :solution, :"flows/user-flows", %{"flows" => data["user_flows"]})

    # flows/system-flows.yaml
    Storage.write(map_dir, :solution, :"flows/system-flows", %{"flows" => data["system_flows"]})

    # architecture/components.yaml
    Storage.write(map_dir, :solution, :"architecture/components", %{
      "components" => data["architecture_components"]
    })

    # architecture/dependencies.yaml
    Storage.write(map_dir, :solution, :"architecture/dependencies", %{
      "dependencies" => data["architecture_dependencies"]
    })

    # Append to glossary
    write_glossary_terms(map_dir, data["glossary_terms"], "step3")

    # Write decisions
    write_decisions(map_dir, data["decisions"], "step3")
  end

  defp write_step4(map_dir, data) do
    # Write each of the 11 spec files
    spec_files =
      ~w(api behaviours constraints entities modules events externals views components streams infra)

    for spec <- spec_files do
      Storage.write(map_dir, :solution, :"specs/#{spec}", %{spec => data[spec]})
    end

    # Append to glossary
    write_glossary_terms(map_dir, data["glossary_terms"], "step4")

    # Write decisions
    write_decisions(map_dir, data["decisions"], "step4")
  end

  defp write_glossary_terms(_map_dir, nil, _step_id), do: :ok
  defp write_glossary_terms(_map_dir, [], _step_id), do: :ok

  defp write_glossary_terms(map_dir, terms, step_id) do
    glossary_path = Path.join([map_dir, "knowledge", "glossary.yaml"])

    existing =
      if File.exists?(glossary_path) do
        case Bropilot.Yaml.decode_file(glossary_path) do
          {:ok, %{"terms" => existing_terms}} -> existing_terms
          _ -> []
        end
      else
        []
      end

    new_terms =
      Enum.map(terms, fn t ->
        %{
          "term" => t["term"],
          "definition" => t["definition"],
          "source_space" => "solution",
          "first_seen_step" => step_id
        }
      end)

    all_terms = existing ++ new_terms
    File.mkdir_p!(Path.dirname(glossary_path))
    Bropilot.Yaml.encode_to_file(%{"terms" => all_terms}, glossary_path)
  end

  defp write_decisions(_map_dir, nil, _step_id), do: :ok
  defp write_decisions(_map_dir, [], _step_id), do: :ok

  defp write_decisions(map_dir, decisions, step_id) do
    decisions_dir = Path.join([map_dir, "knowledge", "decisions"])
    File.mkdir_p!(decisions_dir)

    Enum.each(decisions, fn decision ->
      slug =
        decision["title"]
        |> String.downcase()
        |> String.replace(~r/[^a-z0-9]+/, "-")
        |> String.trim("-")

      path = Path.join(decisions_dir, "#{slug}.yaml")

      Bropilot.Yaml.encode_to_file(
        Map.put(decision, "source_step", step_id),
        path
      )
    end)
  end
end

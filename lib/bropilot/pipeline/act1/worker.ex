defmodule Bropilot.Pipeline.Act1.Worker do
  @moduledoc """
  GenServer that orchestrates Act 1 (Vibe Collection).
  Walks through Step 1 (basics) and Step 2 (gory detail),
  collecting user input and extracting structured data into the map.

  ## States

    - `:idle` — just started, no step running
    - `:step1` — step1 prompt returned, awaiting user input
    - `:step1_done` — step1 extracted and written to map
    - `:step2` — walking through step2 questions
    - `:complete` — both steps extracted and written
  """

  use GenServer

  alias Bropilot.Pipeline.Act1.Extractor
  alias Bropilot.Storage

  defstruct [
    :project_path,
    :recipe,
    :map_dir,
    :step1_prompt,
    :step1_input,
    :step1_data,
    :step2_prompt,
    :step2_data,
    step: :idle,
    step2_questions: [],
    step2_answers: [],
    step2_question_index: 0,
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

  @doc "Start step 1. Returns `{:ok, prompt_text}`."
  def run_step1(pid) do
    GenServer.call(pid, :run_step1)
  end

  @doc "Start step 2. Returns `{:ok, first_question}`."
  def run_step2(pid) do
    GenServer.call(pid, :run_step2)
  end

  @doc "Submit freeform text from the user."
  def submit_input(pid, text) do
    GenServer.call(pid, {:submit_input, text})
  end

  @doc "Get the next step2 question. Returns `{:ok, question}` or `{:ok, :no_more_questions}`."
  def next_question(pid) do
    GenServer.call(pid, :next_question)
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
  def handle_call(:run_step1, _from, %{step: :idle} = state) do
    prompt_path = Path.join(state.recipe, "prompts/step1-basics.md")
    prompt = File.read!(prompt_path)
    {:reply, {:ok, prompt}, %{state | step: :step1, step1_prompt: prompt}}
  end

  @impl true
  def handle_call(:run_step2, _from, %{step: :step1_done} = state) do
    prompt_path = Path.join(state.recipe, "prompts/step2-gory-detail.md")
    prompt = File.read!(prompt_path)

    {:ok, pipeline} = Bropilot.Yaml.decode_file(Path.join(state.recipe, "pipeline.yaml"))

    questions =
      pipeline["acts"]
      |> Enum.find(&(&1["id"] == "act1"))
      |> Map.get("steps", [])
      |> Enum.find(&(&1["id"] == "step2"))
      |> Map.get("questions", [])

    first_question = List.first(questions)

    {:reply, {:ok, first_question},
     %{state | step: :step2, step2_prompt: prompt, step2_questions: questions, step2_question_index: 0, step2_answers: []}}
  end

  @impl true
  def handle_call({:submit_input, text}, _from, %{step: :step1} = state) do
    {:reply, :ok, %{state | step1_input: text}}
  end

  @impl true
  def handle_call({:submit_input, text}, _from, %{step: :step2} = state) do
    answers = state.step2_answers ++ [text]
    new_index = state.step2_question_index + 1
    {:reply, :ok, %{state | step2_answers: answers, step2_question_index: new_index}}
  end

  @impl true
  def handle_call(:next_question, _from, %{step: :step2} = state) do
    idx = state.step2_question_index

    if idx < length(state.step2_questions) do
      question = Enum.at(state.step2_questions, idx)
      {:reply, {:ok, question}, state}
    else
      {:reply, {:ok, :no_more_questions}, state}
    end
  end

  @impl true
  def handle_call(:extract, _from, %{step: :step1, step1_input: input} = state)
      when not is_nil(input) do
    case do_extract(:step1, state) do
      {:ok, data} when is_map(data) ->
        write_step1(state.map_dir, data)
        {:reply, {:ok, data}, %{state | step: :step1_done, step1_data: data}}

      {:ok, prompt_text} when is_binary(prompt_text) ->
        # LLM mode: return prompt, no map writes yet
        {:reply, {:ok, prompt_text}, %{state | step: :step1_done}}

      error ->
        {:reply, error, state}
    end
  end

  @impl true
  def handle_call(:extract, _from, %{step: :step2} = state) do
    case do_extract(:step2, state) do
      {:ok, data} when is_map(data) ->
        write_step2(state.map_dir, data)
        {:reply, {:ok, data}, %{state | step: :complete, step2_data: data}}

      {:ok, prompt_text} when is_binary(prompt_text) ->
        {:reply, {:ok, prompt_text}, %{state | step: :complete}}

      error ->
        {:reply, error, state}
    end
  end

  # Catch-all for extract in unexpected states
  @impl true
  def handle_call(:extract, _from, state) do
    {:reply, {:error, "cannot extract in state #{state.step} — submit input first"}, state}
  end

  # -- Extraction Functions --

  defp do_extract(step, state) do
    case state.extraction_mode do
      :mock -> extract_mock(step, state)
      :llm -> extract_with_llm(step, state)
    end
  end

  @doc """
  Builds the full extraction prompt and sends it to the LLM via
  `Bropilot.LLM.extract_yaml/2`. Returns `{:ok, parsed_map}` or
  `{:error, reason}`.
  """
  def extract_with_llm(:step1, state) do
    prompt = Extractor.build_step1_prompt(state.step1_prompt, state.step1_input)
    Bropilot.LLM.extract_yaml(prompt, state.llm_opts)
  end

  def extract_with_llm(:step2, state) do
    prompt =
      Extractor.build_step2_prompt(
        state.step2_prompt,
        state.step2_questions,
        state.step2_answers
      )

    Bropilot.LLM.extract_yaml(prompt, state.llm_opts)
  end

  @doc """
  Returns hardcoded structured data for testing without an LLM.
  """
  def extract_mock(:step1, _state) do
    {:ok,
     %{
       "name" => "TestApp",
       "purpose" => "A test application for demonstration",
       "problem" => "Testing is hard and time-consuming",
       "context" => "Current testing tools are insufficient for modern workflows",
       "glossary_terms" => [
         %{"term" => "TestApp", "definition" => "The application being built"}
       ]
     }}
  end

  def extract_mock(:step2, _state) do
    {:ok,
     %{
       "audience" => "Developers who need better testing tools",
       "use_cases" => ["Run unit tests quickly", "Generate test reports"],
       "capabilities" => ["Test execution", "Report generation"],
       "design" => "Clean and minimal interface",
       "volo" => "Testing made effortless",
       "hypotheses" => ["Developers want simpler testing workflows"],
       "assumptions" => ["Users know basic testing concepts"],
       "glossary_terms" => [
         %{"term" => "VOLO", "definition" => "Vision of Lovable Output"}
       ]
     }}
  end

  # -- Map Writers --

  defp write_step1(map_dir, data) do
    Storage.write(map_dir, :problem, :problem, %{"problem" => data["problem"]})
    Storage.write(map_dir, :problem, :context, %{"context" => data["context"]})

    # project.yaml at map root
    File.write(
      Path.join(map_dir, "project.yaml"),
      Bropilot.Yaml.encode(%{"name" => data["name"], "purpose" => data["purpose"]})
    )

    write_glossary_terms(map_dir, data["glossary_terms"], "step1")
  end

  defp write_step2(map_dir, data) do
    Storage.write(map_dir, :problem, :audience, %{"audience" => data["audience"]})
    Storage.write(map_dir, :problem, :assumptions, %{"assumptions" => data["assumptions"]})
    Storage.write(map_dir, :problem, :hypotheses, %{"hypotheses" => data["hypotheses"]})

    Storage.write(map_dir, :problem, :"vibes/basics", %{
      "audience" => data["audience"],
      "use_cases" => data["use_cases"],
      "capabilities" => data["capabilities"],
      "design" => data["design"],
      "volo" => data["volo"],
      "hypotheses" => data["hypotheses"],
      "assumptions" => data["assumptions"]
    })

    write_glossary_terms(map_dir, data["glossary_terms"], "step2")
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
          "source_space" => "problem",
          "first_seen_step" => step_id
        }
      end)

    all_terms = existing ++ new_terms
    File.mkdir_p!(Path.dirname(glossary_path))
    Bropilot.Yaml.encode_to_file(%{"terms" => all_terms}, glossary_path)
  end
end

defmodule Bropilot.Pipeline.Exploration.Worker do
  @moduledoc """
  GenServer for the merged Exploration phase. Holds a freeform conversation
  buffer and orchestrates extraction across both Problem and Solution spaces
  via `Bropilot.Pipeline.Exploration.Extractor`.
  """

  use GenServer

  alias Bropilot.Pipeline.Exploration.Extractor
  alias Bropilot.Spaces

  defstruct [
    :project_path,
    :recipe,
    :map_dir,
    messages: [],
    buffer: "",
    auto_extract?: false,
    extraction_count: 0,
    lenses_visited: nil,
    extraction_mode: :mock,
    llm_opts: []
  ]

  # -- Client API --

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts)

  def submit_message(pid, text), do: GenServer.call(pid, {:submit_message, text})
  def append_buffer(pid, text), do: GenServer.call(pid, {:append_buffer, text})
  def clear_buffer(pid), do: GenServer.call(pid, :clear_buffer)
  def get_buffer(pid), do: GenServer.call(pid, :get_buffer)
  def extract(pid), do: GenServer.call(pid, :extract)
  def set_auto_extract(pid, bool), do: GenServer.call(pid, {:set_auto_extract, bool})
  def auto_extract?(pid), do: GenServer.call(pid, :auto_extract?)
  def readiness(pid), do: GenServer.call(pid, :readiness)
  def mark_lens_visited(pid, lens_id), do: GenServer.call(pid, {:mark_lens_visited, lens_id})
  def lenses_visited(pid), do: GenServer.call(pid, :lenses_visited)
  def messages(pid), do: GenServer.call(pid, :messages)
  def state(pid), do: GenServer.call(pid, :state)

  # -- Server --

  @impl true
  def init(opts) do
    project_path = Keyword.fetch!(opts, :project_path)
    mode = Keyword.get(opts, :mode, :mock)
    llm_opts = Keyword.get(opts, :llm_opts, [])

    map_dir = Path.join([project_path, ".bropilot", "map"])
    File.mkdir_p!(map_dir)

    recipe_dir = Path.join([project_path, ".bropilot", "recipe"])

    recipe =
      case load_recipe(recipe_dir) do
        {:ok, r} -> r
        _ -> recipe_dir
      end

    {:ok,
     %__MODULE__{
       project_path: project_path,
       recipe: recipe,
       map_dir: map_dir,
       extraction_mode: mode,
       llm_opts: llm_opts,
       lenses_visited: MapSet.new()
     }}
  end

  defp load_recipe(recipe_dir) do
    if Process.whereis(Bropilot.Recipe.Registry) do
      try do
        Bropilot.Recipe.Registry.load(recipe_dir)
      catch
        _, _ -> :error
      end
    else
      :error
    end
  end

  @impl true
  def handle_call({:submit_message, text}, _from, state) do
    msg = %{role: :user, text: text, at: DateTime.utc_now()}
    new_state = %{state | messages: state.messages ++ [msg]}

    if state.auto_extract? do
      case do_extract(new_state) do
        {:ok, result, st2} -> {:reply, {:ok, result}, st2}
        {:error, reason, st2} -> {:reply, {:error, reason}, st2}
      end
    else
      {:reply, :ok, new_state}
    end
  end

  def handle_call({:append_buffer, text}, _from, state) do
    {:reply, :ok, %{state | buffer: state.buffer <> text}}
  end

  def handle_call(:clear_buffer, _from, state) do
    {:reply, :ok, %{state | buffer: ""}}
  end

  def handle_call(:get_buffer, _from, state) do
    {:reply, state.buffer, state}
  end

  def handle_call(:extract, _from, state) do
    case do_extract(state) do
      {:ok, result, st2} -> {:reply, {:ok, result}, st2}
      {:error, reason, st2} -> {:reply, {:error, reason}, st2}
    end
  end

  def handle_call({:set_auto_extract, bool}, _from, state) do
    {:reply, :ok, %{state | auto_extract?: bool}}
  end

  def handle_call(:auto_extract?, _from, state), do: {:reply, state.auto_extract?, state}

  def handle_call(:readiness, _from, state) do
    {:reply, compute_readiness(state.map_dir), state}
  end

  def handle_call({:mark_lens_visited, lens_id}, _from, state) do
    {:reply, :ok, %{state | lenses_visited: MapSet.put(state.lenses_visited, lens_id)}}
  end

  def handle_call(:lenses_visited, _from, state) do
    {:reply, state.lenses_visited, state}
  end

  def handle_call(:messages, _from, state), do: {:reply, state.messages, state}
  def handle_call(:state, _from, state), do: {:reply, state, state}

  # -- Internal --

  defp do_extract(state) do
    text = format_messages(state.messages) <> maybe_buffer(state.buffer)

    case Extractor.extract_all(text, state.recipe, state.map_dir,
           mode: state.extraction_mode,
           llm_opts: state.llm_opts
         ) do
      {:ok, result} ->
        new_state = %{
          state
          | buffer: "",
            extraction_count: state.extraction_count + 1
        }

        {:ok, result, new_state}

      {:error, reason} ->
        {:error, reason, state}
    end
  end

  defp format_messages([]), do: ""

  defp format_messages(messages) do
    messages
    |> Enum.map(fn %{role: role, text: text} -> "#{role}: #{text}" end)
    |> Enum.join("\n")
  end

  defp maybe_buffer(""), do: ""
  defp maybe_buffer(buf), do: "\n" <> buf

  defp compute_readiness(map_dir) do
    %{
      problem: slot_status(map_dir, :problem),
      solution: slot_status(map_dir, :solution)
    }
  end

  defp slot_status(map_dir, space_id) do
    space = Spaces.definition(space_id)

    {filled, empty} =
      space.required_slots
      |> Enum.split_with(fn slot ->
        path = Path.join([map_dir, Atom.to_string(space_id), Atom.to_string(slot.id)])

        case slot.type do
          :file -> File.exists?(path <> ".yaml") or File.exists?(path <> ".yml")
          :directory -> File.dir?(path)
        end
      end)

    %{
      filled: Enum.map(filled, & &1.id),
      empty: Enum.map(empty, & &1.id)
    }
  end
end

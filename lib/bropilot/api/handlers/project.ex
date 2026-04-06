defmodule Bropilot.Api.Handlers.Project do
  @moduledoc """
  Handlers for project, spaces, recipe, and map endpoints.
  """

  import Bropilot.Api.Router, only: [json: 3]

  alias Bropilot.Spaces
  alias Bropilot.Map.Store
  alias Bropilot.Recipe.Registry

  def init_project(conn) do
    project_path = File.cwd!()
    bropilot_dir = Path.join(project_path, ".bropilot")

    if File.dir?(bropilot_dir) do
      # Already initialized -- just ensure pipeline engine is running
      ensure_pipeline_engine(project_path)
      json(conn, 200, %{ok: true, data: %{status: "already_initialized", path: bropilot_dir}})
    else
      case Bropilot.init(project_path) do
        {:ok, dir} ->
          ensure_pipeline_engine(project_path)
          json(conn, 200, %{ok: true, data: %{status: "initialized", path: dir}})

        {:error, reason} ->
          json(conn, 500, %{ok: false, error: inspect(reason)})
      end
    end
  end

  def get_project(conn) do
    bropilot_dir = bropilot_dir()

    with {:ok, bropilot_dir} <- ensure_project(bropilot_dir) do
      map_dir = Path.join(bropilot_dir, "map")
      project_path = Path.join(map_dir, "project.yaml")

      project_data =
        case Bropilot.Yaml.decode_file(project_path) do
          {:ok, data} -> data
          _ -> %{}
        end

      recipe = Registry.get()

      recipe_info =
        if recipe do
          %{name: recipe.name, version: recipe.version, description: recipe.description}
        else
          nil
        end

      json(conn, 200, %{
        ok: true,
        data: %{
          project: project_data,
          recipe: recipe_info
        }
      })
    else
      {:error, msg} -> json(conn, 400, %{ok: false, error: msg})
    end
  end

  def get_spaces(conn) do
    spaces =
      Spaces.all()
      |> Enum.map(fn space ->
        %{
          id: space.id,
          name: space.name,
          description: space.description,
          governs: space.governs,
          cross_cutting: space.cross_cutting?,
          required_slots:
            Enum.map(space.required_slots, fn slot ->
              %{id: slot.id, name: slot.name, type: slot.type, required: slot.required}
            end)
        }
      end)

    json(conn, 200, %{ok: true, data: %{spaces: spaces}})
  end

  def get_space(conn, space_str) do
    with {:ok, space_atom} <- parse_space(space_str),
         {:ok, bropilot_dir} <- ensure_project(bropilot_dir()) do
      map_dir = Path.join(bropilot_dir, "map")
      space_def = Spaces.definition(space_atom)
      slots =
        Enum.map(space_def.required_slots, fn slot ->
          slot_data =
            case Store.read(map_dir, space_atom, slot.id) do
              {:ok, data} -> data
              _ -> nil
            end

          %{
            id: slot.id,
            name: slot.name,
            type: slot.type,
            filled: Store.exists?(map_dir, space_atom, slot.id),
            data: slot_data
          }
        end)

      json(conn, 200, %{
        ok: true,
        data: %{
          id: space_def.id,
          name: space_def.name,
          description: space_def.description,
          governs: space_def.governs,
          cross_cutting: space_def.cross_cutting?,
          slots: slots
        }
      })
    else
      {:error, msg} -> json(conn, 400, %{ok: false, error: msg})
    end
  end

  def get_slot(conn, space_str, slot_str) do
    with {:ok, space_atom} <- parse_space(space_str),
         {:ok, slot_atom} <- parse_slot(slot_str),
         {:ok, bropilot_dir} <- ensure_project(bropilot_dir()) do
      map_dir = Path.join(bropilot_dir, "map")

      case Store.read(map_dir, space_atom, slot_atom) do
        {:ok, data} ->
          json(conn, 200, %{ok: true, data: data})

        {:error, {:not_found, _, _}} ->
          json(conn, 404, %{ok: false, error: "slot not found"})

        {:error, reason} ->
          json(conn, 500, %{ok: false, error: inspect(reason)})
      end
    else
      {:error, msg} -> json(conn, 400, %{ok: false, error: msg})
    end
  end

  def put_slot(conn, space_str, slot_str) do
    with {:ok, space_atom} <- parse_space(space_str),
         {:ok, slot_atom} <- parse_slot(slot_str),
         {:ok, bropilot_dir} <- ensure_project(bropilot_dir()) do
      map_dir = Path.join(bropilot_dir, "map")
      data = conn.body_params

      case Store.write(map_dir, space_atom, slot_atom, data) do
        :ok ->
          json(conn, 200, %{ok: true, data: %{space: space_str, slot: slot_str}})

        {:error, reason} ->
          json(conn, 500, %{ok: false, error: inspect(reason)})
      end
    else
      {:error, msg} -> json(conn, 400, %{ok: false, error: msg})
    end
  end

  def get_recipe(conn) do
    case ensure_recipe_loaded() do
      :ok ->
        recipe = Registry.get()

        if recipe do
          json(conn, 200, %{
            ok: true,
            data: %{
              name: recipe.name,
              version: recipe.version,
              description: recipe.description,
              steps:
                Enum.map(recipe.steps, fn step ->
                  %{
                    id: step.id,
                    name: step.name,
                    space: step.space,
                    space_slots: step.space_slots,
                    knowledge_contributes: step.knowledge_contributes,
                    measurement_contributes: step.measurement_contributes
                  }
                end),
              acts: recipe.acts
            }
          })
        else
          json(conn, 404, %{ok: false, error: "no recipe loaded"})
        end

      {:error, msg} ->
        json(conn, 400, %{ok: false, error: msg})
    end
  end

  def get_schemas(conn) do
    with {:ok, bropilot_dir} <- ensure_project(bropilot_dir()) do
      schema_dir = Path.join([bropilot_dir, "recipe", "schemas"])

      schemas =
        if File.dir?(schema_dir) do
          schema_dir
          |> find_schemas()
          |> Enum.map(fn path ->
            relative = Path.relative_to(path, schema_dir)

            case Bropilot.Yaml.decode_file(path) do
              {:ok, data} -> %{path: relative, schema: data}
              _ -> %{path: relative, schema: nil}
            end
          end)
        else
          []
        end

      json(conn, 200, %{ok: true, data: %{schemas: schemas}})
    else
      {:error, msg} -> json(conn, 400, %{ok: false, error: msg})
    end
  end

  # -- Private --

  defp bropilot_dir do
    Path.join(File.cwd!(), ".bropilot")
  end

  defp ensure_project(bropilot_dir) do
    if File.dir?(bropilot_dir) do
      {:ok, bropilot_dir}
    else
      {:error, "no .bropilot directory found — run `mix bro.init` first"}
    end
  end

  @space_ids ~w(problem solution work measurement knowledge)

  defp parse_space(space_str) when space_str in @space_ids do
    {:ok, String.to_existing_atom(space_str)}
  end

  defp parse_space(space_str) do
    {:error, "unknown space: #{space_str}"}
  end

  # Known slot IDs from Bropilot.Spaces definitions — bounded allowlist
  @known_slot_ids ~w(
    audience problem context assumptions hypotheses
    vocabulary domain flows architecture specs
    versions validation
    glossary decisions changelog xrefs
  )

  defp parse_slot(slot_str) when slot_str in @known_slot_ids do
    {:ok, String.to_existing_atom(slot_str)}
  end

  defp parse_slot(slot_str) do
    {:error, "unknown slot: #{slot_str}"}
  end

  @engine_name Bropilot.Api.PipelineEngine

  defp ensure_pipeline_engine(project_path) do
    case Process.whereis(@engine_name) do
      nil ->
        case Bropilot.Pipeline.Engine.start(project_path: project_path) do
          {:ok, pid} ->
            Process.register(pid, @engine_name)
            {:ok, pid}

          error ->
            error
        end

      pid ->
        {:ok, pid}
    end
  end

  defp find_schemas(dir) do
    case File.ls(dir) do
      {:ok, entries} ->
        entries
        |> Enum.flat_map(fn entry ->
          path = Path.join(dir, entry)

          cond do
            File.dir?(path) -> find_schemas(path)
            String.ends_with?(entry, ".schema.yaml") -> [path]
            true -> []
          end
        end)

      {:error, _} ->
        []
    end
  end

  defp ensure_recipe_loaded do
    case Registry.get() do
      nil ->
        with {:ok, bropilot_dir} <- ensure_project(bropilot_dir()),
             {:ok, _recipe} <- Registry.load(Path.join(bropilot_dir, "recipe")) do
          :ok
        else
          {:error, msg} when is_binary(msg) ->
            {:error, msg}

          {:error, reason} ->
            {:error, "failed to load recipe: #{inspect(reason)}"}
        end

      _recipe ->
        :ok
    end
  end
end

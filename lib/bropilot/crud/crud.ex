defmodule Bropilot.Crud do
  @moduledoc """
  Generic CRUD operations over the YAML-based map store.

  Each collection is a subdirectory under the store root. Records are
  individual YAML files named `{id}.yaml` within their collection directory.

  Supports:
  - create/read/update/delete with auto-generated IDs
  - list with field-based filtering
  - list with page/page_size pagination including metadata
  - Optional schema validation via `Bropilot.Recipe.Schema`
  """

  alias Bropilot.Yaml
  alias Bropilot.Recipe.Schema

  @doc """
  Creates a new record in the given collection.

  Returns `{:ok, record}` with an auto-generated `"id"` (unless one is supplied).
  If an `"id"` is supplied and already exists, returns `{:error, :duplicate_id}`.

  ## Options

    * `:schema` - A schema map to validate against before creating.
      Returns `{:error, errors}` if validation fails.
  """
  def create(store, collection, attrs, opts \\ []) do
    schema = Keyword.get(opts, :schema)

    with :ok <- maybe_validate(attrs, schema) do
      id = Map.get(attrs, "id") || generate_id()
      record = Map.put(attrs, "id", id)
      collection_dir = collection_path(store, collection)
      record_path = record_path(store, collection, id)

      File.mkdir_p!(collection_dir)

      if File.exists?(record_path) do
        {:error, :duplicate_id}
      else
        :ok = Yaml.encode_to_file(record, record_path)
        {:ok, record}
      end
    end
  end

  @doc """
  Reads a single record by ID from the given collection.

  Returns `{:ok, record}` or `{:error, :not_found}`.
  """
  def read(store, collection, id) do
    path = record_path(store, collection, id)

    if File.exists?(path) do
      case Yaml.decode_file(path) do
        {:ok, data} -> {:ok, data}
        {:error, _} -> {:error, :not_found}
      end
    else
      {:error, :not_found}
    end
  end

  @doc """
  Updates an existing record by merging new attributes.

  Unchanged fields are preserved. The `"id"` field cannot be changed.
  Returns `{:ok, updated_record}` or `{:error, :not_found}`.

  ## Options

    * `:schema` - A schema map to validate the merged record against.
      Returns `{:error, errors}` if validation fails.
  """
  def update(store, collection, id, attrs, opts \\ []) do
    schema = Keyword.get(opts, :schema)

    case read(store, collection, id) do
      {:ok, existing} ->
        merged = Map.merge(existing, attrs) |> Map.put("id", id)

        with :ok <- maybe_validate(merged, schema) do
          path = record_path(store, collection, id)
          :ok = Yaml.encode_to_file(merged, path)
          {:ok, merged}
        end

      {:error, :not_found} ->
        {:error, :not_found}
    end
  end

  @doc """
  Deletes a record by ID from the given collection.

  Returns `:ok` or `{:error, :not_found}`.
  """
  def delete(store, collection, id) do
    path = record_path(store, collection, id)

    if File.exists?(path) do
      File.rm!(path)
      :ok
    else
      {:error, :not_found}
    end
  end

  @doc """
  Lists records from a collection with optional filtering and pagination.

  ## Options

    * `:filter` - A map of field/value pairs. Only records matching all
      filter criteria are returned.
    * `:page` - Page number (1-based). If provided with `:page_size`,
      returns a paginated result with metadata.
    * `:page_size` - Number of records per page.

  ## Returns

  Without pagination: `{:ok, [record, ...]}`.

  With pagination: `{:ok, %{records: [...], total: integer, page: integer, page_size: integer}}`.
  """
  def list(store, collection, opts \\ []) do
    filter = Keyword.get(opts, :filter)
    page = Keyword.get(opts, :page)
    page_size = Keyword.get(opts, :page_size)

    records = read_all_records(store, collection)

    filtered =
      if filter do
        Enum.filter(records, fn record ->
          Enum.all?(filter, fn {key, value} -> Map.get(record, key) == value end)
        end)
      else
        records
      end

    # Sort by id for deterministic ordering
    sorted = Enum.sort_by(filtered, & &1["id"])

    if page && page_size do
      total = length(sorted)
      offset = (page - 1) * page_size
      page_records = Enum.slice(sorted, offset, page_size)

      {:ok,
       %{
         records: page_records,
         total: total,
         page: page,
         page_size: page_size
       }}
    else
      {:ok, sorted}
    end
  end

  # --- Private ---

  defp collection_path(store, collection) do
    Path.join(store, collection)
  end

  defp record_path(store, collection, id) do
    Path.join([store, collection, "#{id}.yaml"])
  end

  defp read_all_records(store, collection) do
    dir = collection_path(store, collection)

    if File.dir?(dir) do
      case File.ls(dir) do
        {:ok, files} ->
          files
          |> Enum.filter(&String.ends_with?(&1, ".yaml"))
          |> Enum.reduce([], fn file, acc ->
            path = Path.join(dir, file)

            case Yaml.decode_file(path) do
              {:ok, data} when is_map(data) -> [data | acc]
              _ -> acc
            end
          end)

        {:error, _} ->
          []
      end
    else
      []
    end
  end

  defp maybe_validate(_attrs, nil), do: :ok

  defp maybe_validate(attrs, schema) do
    case Schema.validate(attrs, schema) do
      :ok -> :ok
      {:error, errors} -> {:error, errors}
    end
  end

  defp generate_id do
    :crypto.strong_rand_bytes(8) |> Base.url_encode64(padding: false)
  end
end

defmodule Bropilot.Traceability do
  @moduledoc """
  Manages spec-to-code traceability links.

  Stores links in `.bropilot/map/knowledge/traceability.yaml`.
  Each entry maps a spec (identified by category + id) to code artifacts.

  Structure:
    traceability:
      - spec_category: "api"
        spec_id: "InitProject"
        links:
          - type: "implementation"
            file_path: "lib/app/init.ex"
            function_name: "init/1"
            line_range: [10, 25]
  """

  @valid_categories ~w(api behaviours constraints entities modules events externals views components streams infra)
  @valid_link_types ~w(implementation test type migration)

  @doc "Returns the list of valid spec categories."
  def valid_categories, do: @valid_categories

  @doc "Returns the list of valid link types."
  def valid_link_types, do: @valid_link_types

  @doc """
  Returns the path to the traceability YAML file for the given map directory.
  """
  def file_path(map_dir) do
    Path.join([map_dir, "knowledge", "traceability.yaml"])
  end

  @doc """
  Reads the full traceability data from disk.

  Returns `{:ok, entries}` where entries is a list of maps,
  or `{:ok, []}` if the file doesn't exist yet.
  """
  def read_all(map_dir) do
    path = file_path(map_dir)

    if File.exists?(path) do
      case Bropilot.Yaml.decode_file(path) do
        {:ok, %{"traceability" => entries}} when is_list(entries) ->
          {:ok, entries}

        {:ok, %{"traceability" => nil}} ->
          {:ok, []}

        {:ok, _other} ->
          {:ok, []}

        {:error, _reason} ->
          {:ok, []}
      end
    else
      {:ok, []}
    end
  end

  @doc """
  Reads the traceability links for a specific spec.

  Returns `{:ok, entry}` or `{:error, :not_found}`.
  """
  def read(map_dir, spec_category, spec_id) do
    with :ok <- validate_category(spec_category),
         {:ok, entries} <- read_all(map_dir) do
      case Enum.find(entries, fn e ->
             e["spec_category"] == spec_category && e["spec_id"] == spec_id
           end) do
        nil -> {:error, :not_found}
        entry -> {:ok, entry}
      end
    end
  end

  @doc """
  Writes (creates or replaces) a traceability entry for the given spec.

  `links` must be a list of maps with at least `type` and `file_path`.
  Write operations are serialized through the Traceability.Writer GenServer
  when it is running, falling back to direct writes otherwise.
  Returns `:ok` or `{:error, reason}`.
  """
  def write(map_dir, spec_category, spec_id, links) do
    with :ok <- validate_category(spec_category),
         :ok <- validate_links(links) do
      Bropilot.Traceability.Writer.write(map_dir, spec_category, spec_id, links)
    end
  end

  @doc """
  Updates (merges) links for a specific spec entry.

  Adds new links alongside existing ones (deduplicates by file_path + type).
  Write operations are serialized through the Traceability.Writer GenServer
  when it is running, falling back to direct writes otherwise.
  Returns `:ok` or `{:error, reason}`.
  """
  def update(map_dir, spec_category, spec_id, new_links) do
    with :ok <- validate_category(spec_category),
         :ok <- validate_links(new_links) do
      Bropilot.Traceability.Writer.update(map_dir, spec_category, spec_id, new_links)
    end
  end

  @doc """
  Deletes the traceability entry for a specific spec.

  Returns `:ok` or `{:error, :not_found}`.
  """
  def delete(map_dir, spec_category, spec_id) do
    with :ok <- validate_category(spec_category) do
      Bropilot.Traceability.Writer.delete(map_dir, spec_category, spec_id)
    end
  end

  @doc """
  Direct write (no GenServer serialization). Used by the Writer GenServer
  internally, and as a fallback when the GenServer is not running.
  """
  def do_write_direct(map_dir, spec_category, spec_id, links) do
    do_write(map_dir, spec_category, spec_id, links)
  end

  @doc """
  Direct update (no GenServer serialization). Used by the Writer GenServer
  internally, and as a fallback when the GenServer is not running.
  """
  def do_update_direct(map_dir, spec_category, spec_id, new_links) do
    {:ok, entries} = read_all(map_dir)

    updated_entries =
      case Enum.find_index(entries, fn e ->
             e["spec_category"] == spec_category && e["spec_id"] == spec_id
           end) do
        nil ->
          # No existing entry — create new
          entry = build_entry(spec_category, spec_id, new_links)
          entries ++ [entry]

        idx ->
          existing = Enum.at(entries, idx)
          existing_links = existing["links"] || []

          merged =
            merge_links(existing_links, new_links)

          updated = Map.put(existing, "links", merged)
          List.replace_at(entries, idx, updated)
      end

    persist(map_dir, updated_entries)
  end

  @doc """
  Direct delete (no GenServer serialization). Used by the Writer GenServer
  internally, and as a fallback when the GenServer is not running.
  """
  def do_delete_direct(map_dir, spec_category, spec_id) do
    {:ok, entries} = read_all(map_dir)

    case Enum.reject(entries, fn e ->
           e["spec_category"] == spec_category && e["spec_id"] == spec_id
         end) do
      ^entries ->
        {:error, :not_found}

      filtered ->
        persist(map_dir, filtered)
    end
  end

  # ── Validation ──────────────────────────────────────────────────────

  @doc """
  Validates that a spec_category is one of the 11 valid categories.
  """
  def validate_category(category) when category in @valid_categories, do: :ok

  def validate_category(category) do
    {:error, {:invalid_category, category, @valid_categories}}
  end

  @doc """
  Validates a list of links. Each link must have `type` and `file_path`.
  `type` must be one of the valid link types.
  """
  def validate_links(links) when is_list(links) do
    errors =
      links
      |> Enum.with_index()
      |> Enum.flat_map(fn {link, idx} ->
        validate_link(link, idx)
      end)

    case errors do
      [] -> :ok
      errs -> {:error, {:invalid_links, errs}}
    end
  end

  def validate_links(_), do: {:error, {:invalid_links, ["links must be a list"]}}

  defp validate_link(link, idx) when is_map(link) do
    type_errors =
      case Map.get(link, "type") do
        nil -> [{idx, :type, :required}]
        t when t in @valid_link_types -> []
        t -> [{idx, :type, {:invalid_type, t, @valid_link_types}}]
      end

    path_errors =
      case Map.get(link, "file_path") do
        nil -> [{idx, :file_path, :required}]
        p when is_binary(p) and byte_size(p) > 0 -> []
        _ -> [{idx, :file_path, :invalid}]
      end

    type_errors ++ path_errors
  end

  defp validate_link(_link, idx) do
    [{idx, :link, :must_be_map}]
  end

  # ── Internal helpers ────────────────────────────────────────────────

  defp build_entry(spec_category, spec_id, links) do
    normalized =
      Enum.map(links, fn link ->
        base = %{
          "type" => link["type"],
          "file_path" => link["file_path"]
        }

        base
        |> maybe_put("function_name", link["function_name"])
        |> maybe_put("line_range", link["line_range"])
      end)

    %{
      "spec_category" => spec_category,
      "spec_id" => spec_id,
      "links" => normalized
    }
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp merge_links(existing, new_links) do
    new_normalized =
      Enum.map(new_links, fn link ->
        base = %{
          "type" => link["type"],
          "file_path" => link["file_path"]
        }

        base
        |> maybe_put("function_name", link["function_name"])
        |> maybe_put("line_range", link["line_range"])
      end)

    # Deduplicate by (type, file_path) — new links replace existing ones
    new_keys = MapSet.new(new_normalized, fn l -> {l["type"], l["file_path"]} end)

    kept =
      Enum.reject(existing, fn l ->
        {l["type"], l["file_path"]} in new_keys
      end)

    kept ++ new_normalized
  end

  defp do_write(map_dir, spec_category, spec_id, links) do
    {:ok, entries} = read_all(map_dir)

    updated =
      case Enum.find_index(entries, fn e ->
             e["spec_category"] == spec_category && e["spec_id"] == spec_id
           end) do
        nil ->
          entry = build_entry(spec_category, spec_id, links)
          entries ++ [entry]

        idx ->
          entry = build_entry(spec_category, spec_id, links)
          List.replace_at(entries, idx, entry)
      end

    persist(map_dir, updated)
  end

  defp persist(map_dir, entries) do
    path = file_path(map_dir)
    dir = Path.dirname(path)
    File.mkdir_p!(dir)

    data = %{"traceability" => entries}
    content = Bropilot.Yaml.encode(data)

    # Atomic write: write to tmp file then rename
    tmp_path = path <> ".tmp.#{:rand.uniform(1_000_000)}"

    case File.write(tmp_path, content) do
      :ok ->
        case File.rename(tmp_path, path) do
          :ok -> :ok
          error -> error
        end

      error ->
        File.rm(tmp_path)
        error
    end
  end
end

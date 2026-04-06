defmodule Bropilot.Traceability.AutoLinker do
  @moduledoc """
  Automatically records traceability links after codegen (Step 8) produces artifacts.

  Parses task context (related_specs, entity refs) and maps generated files
  to traceability entries. Handles all link types: implementation, test, type, migration.

  Uses `Traceability.update/4` (merge semantics) so:
    - Re-running codegen updates (not duplicates) existing links
    - Manual links are preserved alongside auto-generated ones
  """

  alias Bropilot.Traceability

  @doc """
  Records traceability links for a completed codegen task.

  `map_dir`      – path to the .bropilot/map directory
  `task_map`     – the task map with "related_specs", "context", etc.
  `codegen_result` – `{:ok, %{files_written: [...], output_dir: "..."}}` or error
  `project_path` – root path of the project (for validating file existence)

  Returns `:ok` or `{:error, reason}`.
  """
  def record_links(map_dir, task_map, codegen_result, project_path \\ nil)

  def record_links(_map_dir, _task_map, {:error, _reason}, _project_path), do: :ok

  def record_links(map_dir, task_map, {:ok, %{files_written: files, output_dir: output_dir}}, project_path) do
    related_specs = Map.get(task_map, "related_specs", []) || []
    base_dir = project_path || output_dir

    # Parse each related_spec into {category, spec_id} and generate links.
    # Also parse entity references from task context to create entity-category links.
    all_spec_refs = parse_all_spec_refs(related_specs, task_map)

    Enum.each(all_spec_refs, fn {category, spec_id} ->
      links = build_links_for_spec(category, spec_id, files, output_dir, base_dir)

      if links != [] do
        # Replace stale links by (spec_category, spec_id, type) key:
        # For each link type in the new set, replace existing links of
        # matching (type, file_path). Manual links (different file_path)
        # are preserved per VAL-TAUTO-007.
        replace_stale_links(map_dir, category, spec_id, links)
      end
    end)

    :ok
  end

  def record_links(_map_dir, _task_map, {:ok, _other}, _project_path), do: :ok

  @doc """
  Records traceability links for a batch of completed tasks.

  Takes a list of `{task_map, codegen_result}` tuples and processes each.
  """
  def record_links_batch(map_dir, task_results, project_path \\ nil) do
    Enum.each(task_results, fn {task_map, result} ->
      record_links(map_dir, task_map, result, project_path)
    end)

    :ok
  end

  # ── Stale Link Replacement ───────────────────────────────────

  @doc """
  Replaces stale links using (spec_category, spec_id, type) key semantics.

  When re-running codegen for the same spec:
    - New links with matching (type, file_path) replace existing links
      (e.g., updated function_name or line_range)
    - New links with a new file_path are added
    - Existing links with different file_paths are preserved (manual links,
      links from other codegen runs) per VAL-TAUTO-007

  This uses merge/dedup by (type, file_path) which correctly handles:
    - Re-running with same files → no duplicates
    - Re-running with new files → both old and new links kept
    - Manual links → preserved since their file_paths differ
  """
  def replace_stale_links(map_dir, category, spec_id, new_links) do
    Traceability.update(map_dir, category, spec_id, new_links)
  end

  # ── Spec Reference Collection ──────────────────────────────────

  @doc """
  Collects all spec references from both related_specs and task context.

  Parses entity references from the task context string and maps them
  to entity-category traceability links.
  """
  def parse_all_spec_refs(related_specs, task_map) do
    # Parse standard related_specs
    from_specs =
      related_specs
      |> Enum.map(&parse_spec_path/1)
      |> Enum.filter(fn
        {:ok, _, _} -> true
        _ -> false
      end)
      |> Enum.map(fn {:ok, cat, id} -> {cat, id} end)

    # Parse entity references from task context
    from_context = parse_context_entity_refs(task_map)

    # Deduplicate
    (from_specs ++ from_context)
    |> Enum.uniq()
  end

  @doc """
  Parses entity references from the task context.

  Looks for patterns like:
    - "entities.User", "entities.Project"
    - "Entity: User", "Entity: Project"
    - References in context string mentioning entity names from related_specs
  """
  def parse_context_entity_refs(task_map) do
    context = Map.get(task_map, "context", "") || ""

    context_str =
      cond do
        is_binary(context) -> context
        is_map(context) -> inspect(context)
        true -> ""
      end

    # Pattern: "entities.EntityName" or "solution.specs.entities.EntityName"
    entity_pattern = ~r/(?:solution\.specs\.)?entities\.([A-Z][A-Za-z0-9_]*)/

    Regex.scan(entity_pattern, context_str)
    |> Enum.map(fn [_full, entity_name] -> {"entities", entity_name} end)
    |> Enum.uniq()
  end

  # ── Spec Path Parsing ──────────────────────────────────────────

  @doc """
  Parses a related_specs path into {category, spec_id}.

  Formats supported:
    - "solution.specs.api.InitProject" → {:ok, "api", "InitProject"}
    - "solution.specs.entities.User"   → {:ok, "entities", "User"}
    - "api.InitProject"               → {:ok, "api", "InitProject"}
    - "entities.User"                 → {:ok, "entities", "User"}

  Returns `:error` if the path cannot be parsed into a valid category.
  """
  def parse_spec_path(path) when is_binary(path) do
    parts = String.split(path, ".")

    {category, spec_id} =
      case parts do
        ["solution", "specs", category | rest] when rest != [] ->
          {category, Enum.join(rest, ".")}

        [category, spec_id | rest] when rest == [] ->
          {category, spec_id}

        [category | rest] when length(rest) >= 1 ->
          {category, Enum.join(rest, ".")}

        _ ->
          {nil, nil}
      end

    if category != nil and spec_id != nil do
      case Traceability.validate_category(category) do
        :ok -> {:ok, category, spec_id}
        _ -> :error
      end
    else
      :error
    end
  end

  def parse_spec_path(_), do: :error

  # ── Link Building ──────────────────────────────────────────────

  @doc """
  Builds typed links for a spec based on the generated files.

  Link types are inferred from file paths and the spec category:
    - `_test.exs` or `_test.ex` → "test"
    - `.sql` files or files in `migrations/` → "migration"
    - `types.ex`, `type.ex`, `_types.ex`, `_type.ts` → "type"
    - Everything else → "implementation"

  Only includes links for files that actually exist on disk.
  """
  def build_links_for_spec(category, _spec_id, files, output_dir, base_dir) do
    files
    |> Enum.map(fn file ->
      full_path = resolve_file_path(file, output_dir)
      rel_path = make_relative(full_path, base_dir)
      type = infer_link_type(file, category)
      {rel_path, type, full_path}
    end)
    |> Enum.filter(fn {_rel_path, _type, full_path} ->
      # Check both the full_path and the path relative to base_dir
      file_exists?(full_path) or file_exists?(Path.join(base_dir, full_path))
    end)
    |> Enum.map(fn {rel_path, type, _full_path} ->
      %{"type" => type, "file_path" => rel_path}
    end)
    |> Enum.uniq_by(fn link -> {link["type"], link["file_path"]} end)
  end

  # ── Link Type Inference ────────────────────────────────────────

  @doc """
  Infers the link type from a file path and spec category.

  Rules (checked in order):
    1. `*_test.exs`, `*_test.ex`, `*_test.ts`, `*.test.ts`, `*.spec.ts` → "test"
    2. `*.sql`, `**/migrations/**` → "migration"
    3. `*_types.ex`, `*_type.ex`, `**/types/**`, `*.d.ts`, `*_types.ts` → "type"
    4. Everything else → "implementation"
  """
  def infer_link_type(file_path, _category) do
    basename = Path.basename(file_path)
    lower = String.downcase(file_path)

    cond do
      # Test files
      String.ends_with?(basename, "_test.exs") ->
        "test"

      String.ends_with?(basename, "_test.ex") ->
        "test"

      String.ends_with?(basename, "_test.ts") ->
        "test"

      String.ends_with?(basename, ".test.ts") ->
        "test"

      String.ends_with?(basename, ".test.tsx") ->
        "test"

      String.ends_with?(basename, ".test.js") ->
        "test"

      String.ends_with?(basename, ".spec.ts") ->
        "test"

      String.starts_with?(lower, "test/") or String.starts_with?(lower, "tests/") or
          String.contains?(lower, "/test/") or String.contains?(lower, "/tests/") ->
        "test"

      # Migration files
      String.ends_with?(basename, ".sql") ->
        "migration"

      String.contains?(lower, "/migrations/") or String.contains?(lower, "/migrate/") ->
        "migration"

      # Type definition files
      String.ends_with?(basename, "_types.ex") ->
        "type"

      String.ends_with?(basename, "_type.ex") ->
        "type"

      String.ends_with?(basename, ".d.ts") ->
        "type"

      String.ends_with?(basename, "_types.ts") ->
        "type"

      basename == "types.ex" or basename == "types.ts" ->
        "type"

      String.contains?(lower, "/types/") ->
        "type"

      # Default: implementation
      true ->
        "implementation"
    end
  end

  # ── File Path Helpers ──────────────────────────────────────────

  defp resolve_file_path(file, output_dir) do
    if Path.type(file) == :absolute do
      file
    else
      Path.join(output_dir, file)
    end
  end

  defp make_relative(path, base_dir) do
    expanded_path = Path.expand(path)
    expanded_base = Path.expand(base_dir)

    case String.trim_leading(expanded_path, expanded_base) do
      "/" <> rest -> rest
      ^expanded_path -> path
      other -> String.trim_leading(other, "/")
    end
  end

  defp file_exists?(path) do
    File.exists?(path)
  end
end

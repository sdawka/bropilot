defmodule Bropilot.Pipeline.Feedback do
  @moduledoc """
  Closes the self-referential feedback loop: after codegen (step 8)
  completes, results feed back into the Knowledge Space.

  Updates:
    - knowledge/changelog.yaml  – what was built, when, from which task
    - knowledge/xrefs.yaml      – term → spec → artifact path mappings
    - knowledge/glossary.yaml   – new terms discovered during coding
  """

  @doc """
  After a task completes, updates all three knowledge files.

  `map_dir`  – path to the map/ directory
  `task`     – the task map (keys: "id", "title", "related_specs", "context", etc.)
  `result`   – the codegen result (typically {:ok, prompt_or_output})
  """
  def update_knowledge(map_dir, task, result) do
    knowledge_dir = Path.join(map_dir, "knowledge")
    File.mkdir_p!(knowledge_dir)

    # 1. Append changelog entry
    entry = build_changelog_entry(task, result)
    update_changelog(map_dir, entry)

    # 2. Update xrefs
    update_xrefs(map_dir, task)

    # 3. Extract and append new terms to glossary
    terms = extract_terms(task, result)
    update_glossary(map_dir, terms)

    :ok
  end

  @doc """
  Adds a timestamped entry to knowledge/changelog.yaml.

  `entry` is a map with at least: task_id, title, timestamp, files_touched, status.
  """
  def update_changelog(map_dir, entry) do
    path = changelog_path(map_dir)
    File.mkdir_p!(Path.dirname(path))

    existing = read_list(path, "entries")
    entries = existing ++ [entry]
    Bropilot.Yaml.encode_to_file(%{"entries" => entries}, path)
  end

  @doc """
  Reads task's related_specs and maps them to artifact paths produced.

  Appends new cross-references (deduplicates by {term, spec_path, artifact_path}).
  """
  def update_xrefs(map_dir, task) do
    path = xrefs_path(map_dir)
    File.mkdir_p!(Path.dirname(path))

    existing = read_list(path, "xrefs")

    new_xrefs = build_xrefs(task)

    # Deduplicate: a ref is unique by {term, spec_path, artifact_path}
    merged =
      (existing ++ new_xrefs)
      |> Enum.uniq_by(fn ref ->
        {ref["term"], ref["spec_path"], ref["artifact_path"]}
      end)

    Bropilot.Yaml.encode_to_file(%{"xrefs" => merged}, path)
  end

  @doc """
  Appends new terms to knowledge/glossary.yaml.
  Deduplicates by term name — keeps the latest definition if different.

  `terms` is a list of maps: [%{"term" => "...", "definition" => "..."}]
  """
  def update_glossary(map_dir, terms) when is_list(terms) do
    path = glossary_path(map_dir)
    File.mkdir_p!(Path.dirname(path))

    existing = read_list(path, "terms")

    # Build index of existing terms by name
    existing_index = Map.new(existing, fn t -> {t["term"], t} end)

    # Merge: new terms override existing ones with same name
    new_index = Map.new(terms, fn t -> {t["term"], t} end)

    merged_index = Map.merge(existing_index, new_index)

    merged =
      merged_index
      |> Map.values()
      |> Enum.sort_by(fn t -> t["term"] end)

    Bropilot.Yaml.encode_to_file(%{"terms" => merged}, path)
  end

  @doc """
  After all tasks for a version complete, writes a version summary to
  knowledge/version_summary.yaml with stats.
  """
  def summarize_version(map_dir, version) do
    knowledge_dir = Path.join(map_dir, "knowledge")
    File.mkdir_p!(knowledge_dir)

    # Read changelog to count tasks for this version
    changelog_entries = read_list(changelog_path(map_dir), "entries")

    version_str = to_string(version)

    version_entries =
      Enum.filter(changelog_entries, fn entry ->
        to_string(entry["version"]) == version_str
      end)

    tasks_completed = length(version_entries)

    # Collect artifact paths from xrefs
    xrefs = read_list(xrefs_path(map_dir), "xrefs")

    artifact_paths =
      xrefs
      |> Enum.map(fn ref -> ref["artifact_path"] end)
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()

    artifacts_produced = length(artifact_paths)

    # Collect specs implemented
    specs_implemented =
      version_entries
      |> Enum.flat_map(fn entry ->
        entry["related_specs"] || []
      end)
      |> Enum.uniq()
      |> length()

    summary = %{
      "version" => version,
      "timestamp" => iso8601_now(),
      "tasks_completed" => tasks_completed,
      "artifacts_produced" => artifacts_produced,
      "specs_implemented" => specs_implemented
    }

    summary_path = Path.join(knowledge_dir, "version_summary.yaml")
    Bropilot.Yaml.encode_to_file(summary, summary_path)

    {:ok, summary}
  end

  # -- Private helpers --

  defp build_changelog_entry(task, result) do
    status =
      case result do
        {:ok, _} -> "completed"
        _ -> "failed"
      end

    artifact_paths = extract_artifact_paths(task)

    %{
      "task_id" => Map.get(task, "id"),
      "title" => Map.get(task, "title", ""),
      "timestamp" => iso8601_now(),
      "files_touched" => artifact_paths,
      "status" => status,
      "version" => Map.get(task, "version"),
      "related_specs" => Map.get(task, "related_specs", [])
    }
  end

  defp build_xrefs(task) do
    related_specs = Map.get(task, "related_specs", []) || []
    artifact_paths = extract_artifact_paths(task)
    title = Map.get(task, "title", "")

    Enum.map(related_specs, fn spec_path ->
      %{
        "term" => title,
        "spec_path" => spec_path,
        "artifact_path" => List.first(artifact_paths) || spec_path
      }
    end)
  end

  defp extract_artifact_paths(task) do
    context = Map.get(task, "context", %{}) || %{}

    cond do
      is_map(context) and Map.has_key?(context, "artifact_paths") ->
        context["artifact_paths"]

      is_map(context) and Map.has_key?(context, "files") ->
        context["files"]

      true ->
        related = Map.get(task, "related_specs", []) || []
        Enum.map(related, fn spec -> "lib/" <> String.replace(spec, ".", "/") end)
    end
  end

  defp extract_terms(task, _result) do
    title = Map.get(task, "title", "")
    description = Map.get(task, "description", "")
    related_specs = Map.get(task, "related_specs", []) || []

    # Extract meaningful terms from the task title and related specs
    terms_from_specs =
      Enum.map(related_specs, fn spec ->
        term =
          spec
          |> String.split(".")
          |> List.last()

        %{"term" => term, "definition" => "Defined in spec: #{spec}"}
      end)

    # Add a term from the task title if present
    title_terms =
      if title != "" do
        [%{"term" => title, "definition" => description}]
      else
        []
      end

    (terms_from_specs ++ title_terms)
    |> Enum.reject(fn t -> t["term"] == "" or is_nil(t["term"]) end)
  end

  defp read_list(path, key) do
    case Bropilot.Yaml.decode_file(path) do
      {:ok, data} when is_map(data) -> data[key] || []
      _ -> []
    end
  end

  defp iso8601_now do
    DateTime.utc_now() |> DateTime.to_iso8601()
  end

  # Expose paths for testing
  def changelog_path(map_dir), do: Path.join([map_dir, "knowledge", "changelog.yaml"])
  def xrefs_path(map_dir), do: Path.join([map_dir, "knowledge", "xrefs.yaml"])
  def glossary_path(map_dir), do: Path.join([map_dir, "knowledge", "glossary.yaml"])
end

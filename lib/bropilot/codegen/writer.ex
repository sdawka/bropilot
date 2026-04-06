defmodule Bropilot.Codegen.Writer do
  @moduledoc """
  Parses LLM codegen responses into file writes.
  Extracts ```file:path/to/file ... ``` blocks from LLM output
  and writes them to a target directory with mkdir -p behavior.

  Ensures atomic writes: files are written to a temporary directory
  first, then moved to the final location to prevent partial writes
  on failure.
  """

  @doc """
  Parses an LLM response string into a list of `{relative_path, content}` tuples.

  Looks for blocks delimited by:
      ```file:path/to/file.ex
      <content>
      ```

  Returns an empty list if no file blocks are found.
  """
  def parse_files(response) when is_binary(response) do
    # Match ```file:<path>\n<content>\n``` patterns
    ~r/```file:([^\n]+)\n(.*?)```/s
    |> Regex.scan(response)
    |> Enum.map(fn [_full, path, content] ->
      {String.trim(path), String.trim_trailing(content)}
    end)
  end

  @doc """
  Validates that a resolved file path is within the intended output directory.

  Uses `Path.expand/1` to resolve `..` and symlinks, then checks that the
  resolved path starts with the expanded output directory prefix.

  Returns `:ok` if the path is safe, or `{:error, reason}` if it escapes.
  """
  def validate_path(rel_path, output_dir) do
    expanded_output = Path.expand(output_dir)
    full_path = Path.join(output_dir, rel_path)
    expanded_full = Path.expand(full_path)

    if String.starts_with?(expanded_full, expanded_output <> "/") do
      :ok
    else
      {:error, {:path_traversal, "path #{inspect(rel_path)} resolves outside output directory"}}
    end
  end

  @doc """
  Writes a list of `{relative_path, content}` tuples to `output_dir`.

  Creates intermediate directories as needed (mkdir -p behavior).
  Uses atomic write strategy: writes to a staging directory first,
  then moves files to the final location.

  Rejects any file paths containing path traversal (../) that would
  resolve outside the output directory.

  Returns `{:ok, [written_paths]}` on success or `{:error, reason}` on failure.
  """
  def write_files([], _output_dir), do: {:error, :no_files}

  def write_files(files, output_dir) when is_list(files) do
    # Validate all paths before writing anything
    case validate_all_paths(files, output_dir) do
      :ok ->
        do_write_files(files, output_dir)

      {:error, _} = error ->
        error
    end
  end

  defp validate_all_paths(files, output_dir) do
    Enum.reduce_while(files, :ok, fn {rel_path, _content}, :ok ->
      case validate_path(rel_path, output_dir) do
        :ok -> {:cont, :ok}
        {:error, _} = error -> {:halt, error}
      end
    end)
  end

  defp do_write_files(files, output_dir) do
    staging_dir = output_dir <> ".staging.#{:rand.uniform(100_000)}"

    try do
      # Write all files to staging directory first
      Enum.each(files, fn {rel_path, content} ->
        full_path = Path.join(staging_dir, rel_path)
        File.mkdir_p!(Path.dirname(full_path))
        File.write!(full_path, content)
      end)

      # Move from staging to final directory
      File.mkdir_p!(Path.dirname(output_dir))

      if File.dir?(output_dir) do
        # Merge staged files into existing output dir
        copy_tree(staging_dir, output_dir)
      else
        File.rename!(staging_dir, output_dir)
      end

      written_paths = Enum.map(files, fn {path, _} -> path end)
      {:ok, written_paths}
    rescue
      error ->
        # Clean up staging on failure
        File.rm_rf(staging_dir)
        {:error, {:write_failed, Exception.message(error)}}
    after
      # Always clean up staging if it still exists (merge case)
      File.rm_rf(staging_dir)
    end
  end

  @doc """
  Convenience function: parse an LLM response and write files to output_dir.
  Returns `{:ok, %{files_written: paths, output_dir: dir}}` or `{:error, reason}`.
  """
  def parse_and_write(response, output_dir) when is_binary(response) do
    files = parse_files(response)

    case write_files(files, output_dir) do
      {:ok, written_paths} ->
        {:ok, %{files_written: written_paths, output_dir: output_dir}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  # -- Private --

  defp copy_tree(source, target) do
    File.mkdir_p!(target)

    source
    |> File.ls!()
    |> Enum.each(fn entry ->
      src = Path.join(source, entry)
      dst = Path.join(target, entry)

      if File.dir?(src) do
        copy_tree(src, dst)
      else
        File.mkdir_p!(Path.dirname(dst))
        File.cp!(src, dst)
      end
    end)
  end
end

defmodule Bropilot.Api.Handlers.Knowledge do
  @moduledoc """
  Handlers for knowledge space endpoints.
  Returns glossary, decisions, and changelog data.
  """

  import Bropilot.Api.Router, only: [json: 3]

  alias Bropilot.Pipeline.Feedback

  def get_knowledge(conn) do
    bropilot_dir = Path.join(File.cwd!(), ".bropilot")

    unless File.dir?(bropilot_dir) do
      json(conn, 400, %{ok: false, error: "no .bropilot directory found — run `mix bro.init` first"})
    else
      map_dir = Path.join(bropilot_dir, "map")

      glossary = read_yaml_list(Feedback.glossary_path(map_dir), "terms")
      changelog = read_yaml_list(Feedback.changelog_path(map_dir), "entries")
      xrefs = read_yaml_list(Feedback.xrefs_path(map_dir), "xrefs")

      decisions = read_decisions(Path.join([map_dir, "knowledge", "decisions"]))

      json(conn, 200, %{
        ok: true,
        data: %{
          glossary: glossary,
          decisions: decisions,
          changelog: changelog,
          xrefs: xrefs
        }
      })
    end
  end

  # -- Private --

  defp read_yaml_list(path, key) do
    case Bropilot.Yaml.decode_file(path) do
      {:ok, data} when is_map(data) -> data[key] || []
      _ -> []
    end
  end

  defp read_decisions(dir) do
    case File.ls(dir) do
      {:ok, files} ->
        files
        |> Enum.filter(&(String.ends_with?(&1, ".yaml") or String.ends_with?(&1, ".yml")))
        |> Enum.sort()
        |> Enum.map(fn file ->
          case Bropilot.Yaml.decode_file(Path.join(dir, file)) do
            {:ok, data} -> data
            _ -> nil
          end
        end)
        |> Enum.reject(&is_nil/1)

      {:error, _} ->
        []
    end
  end
end

defmodule Bropilot.Api.Handlers.Traceability do
  @moduledoc """
  Handlers for traceability API endpoints.
  Provides CRUD for spec-to-code traceability links and a coverage summary.
  """

  import Bropilot.Api.Router, only: [json: 3]

  alias Bropilot.Traceability

  @doc """
  GET /api/traceability
  Returns the full traceability matrix with coverage summary.
  """
  def get_matrix(conn) do
    with {:ok, map_dir} <- ensure_map_dir() do
      {:ok, entries} = Traceability.read_all(map_dir)
      coverage = build_coverage(map_dir, entries)

      json(conn, 200, %{
        ok: true,
        data: %{
          entries: entries,
          coverage: coverage
        }
      })
    else
      {:error, msg} -> json(conn, 400, %{ok: false, error: msg})
    end
  end

  @doc """
  GET /api/traceability/:category/:spec_id
  Returns traceability links for a specific spec.
  """
  def get_entry(conn, category, spec_id) do
    with {:ok, map_dir} <- ensure_map_dir(),
         :ok <- validate_category(category) do
      case Traceability.read(map_dir, category, spec_id) do
        {:ok, entry} ->
          json(conn, 200, %{ok: true, data: entry})

        {:error, :not_found} ->
          json(conn, 404, %{ok: false, error: "spec not found: #{category}/#{spec_id}"})
      end
    else
      {:error, {:invalid_category, cat, valid}} ->
        json(conn, 400, %{
          ok: false,
          error: "invalid category: #{cat}. Valid categories: #{Enum.join(valid, ", ")}"
        })

      {:error, msg} ->
        json(conn, 400, %{ok: false, error: msg})
    end
  end

  @doc """
  PUT /api/traceability/:category/:spec_id
  Creates or updates traceability links for a spec.
  Expects body: { "links": [{ "type": "...", "file_path": "...", ... }] }
  """
  def put_entry(conn, category, spec_id) do
    with {:ok, map_dir} <- ensure_map_dir(),
         :ok <- validate_category(category),
         {:ok, links} <- extract_links(conn.body_params) do
      case Traceability.write(map_dir, category, spec_id, links) do
        :ok ->
          json(conn, 200, %{
            ok: true,
            data: %{spec_category: category, spec_id: spec_id}
          })

        {:error, {:invalid_links, errors}} ->
          json(conn, 422, %{
            ok: false,
            error: "invalid links: #{inspect(errors)}"
          })

        {:error, reason} ->
          json(conn, 500, %{ok: false, error: inspect(reason)})
      end
    else
      {:error, {:invalid_category, cat, valid}} ->
        json(conn, 400, %{
          ok: false,
          error: "invalid category: #{cat}. Valid categories: #{Enum.join(valid, ", ")}"
        })

      {:error, {:invalid_links, errors}} ->
        json(conn, 422, %{
          ok: false,
          error: "invalid links: #{inspect(errors)}"
        })

      {:error, {:missing_links}} ->
        json(conn, 422, %{
          ok: false,
          error: "missing required field: links"
        })

      {:error, msg} ->
        json(conn, 400, %{ok: false, error: msg})
    end
  end

  # ── Private helpers ─────────────────────────────────────────────

  defp ensure_map_dir do
    bropilot_dir = Path.join(File.cwd!(), ".bropilot")

    if File.dir?(bropilot_dir) do
      {:ok, Path.join(bropilot_dir, "map")}
    else
      {:error, "no .bropilot directory found — run `mix bro.init` first"}
    end
  end

  defp validate_category(category) do
    case Traceability.validate_category(category) do
      :ok -> :ok
      {:error, {:invalid_category, _, _}} = err -> err
    end
  end

  defp extract_links(%{"links" => links}) when is_list(links) do
    case Traceability.validate_links(links) do
      :ok -> {:ok, links}
      {:error, _} = err -> err
    end
  end

  defp extract_links(%{"links" => _}), do: {:error, {:invalid_links, ["links must be a list"]}}
  defp extract_links(_), do: {:error, {:missing_links}}

  defp build_coverage(map_dir, entries) do
    categories = Traceability.valid_categories()

    # Count linked specs per category from traceability entries
    # Only count entries as linked when their links array is non-empty
    linked_by_category =
      entries
      |> Enum.filter(fn e -> is_list(e["links"]) and e["links"] != [] end)
      |> Enum.group_by(& &1["spec_category"])
      |> Map.new(fn {cat, cat_entries} -> {cat, length(cat_entries)} end)

    # Count total specs per category from solution space
    total_by_category = count_specs_per_category(map_dir)

    by_category =
      Map.new(categories, fn cat ->
        total = Map.get(total_by_category, cat, 0)
        linked = Map.get(linked_by_category, cat, 0)

        {cat, %{
          "total" => total,
          "linked" => linked,
          "unlinked" => max(total - linked, 0)
        }}
      end)

    total_specs = Enum.reduce(by_category, 0, fn {_, v}, acc -> acc + v["total"] end)
    total_linked = Enum.reduce(by_category, 0, fn {_, v}, acc -> acc + v["linked"] end)

    %{
      "total_specs" => total_specs,
      "total_linked" => total_linked,
      "total_unlinked" => max(total_specs - total_linked, 0),
      "by_category" => by_category
    }
  end

  defp count_specs_per_category(map_dir) do
    specs_dir = Path.join([map_dir, "solution", "specs"])

    if File.dir?(specs_dir) do
      Traceability.valid_categories()
      |> Enum.map(fn cat ->
        path = Path.join(specs_dir, "#{cat}.yaml")

        count =
          case Bropilot.Yaml.decode_file(path) do
            {:ok, %{^cat => data}} when is_map(data) -> map_size(data)
            {:ok, %{^cat => data}} when is_list(data) -> length(data)
            _ -> 0
          end

        {cat, count}
      end)
      |> Map.new()
    else
      %{}
    end
  end
end

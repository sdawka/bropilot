defmodule Bropilot.Generator do
  @moduledoc """
  Code generator that takes entity, API, and behaviour specs and produces:
  - TypeScript type definitions (interfaces for each entity)
  - Hono route handlers (from API specs with correct HTTP methods)
  - D1 migration SQL (CREATE TABLE with column types, NOT NULL, indexes)
  - Test stubs (from behaviour specs with one test block per behaviour)

  Handles empty specs gracefully and escapes reserved words in SQL identifiers.
  """

  alias Bropilot.Yaml

  # SQL reserved words that need quoting as table/column identifiers
  @sql_reserved_words ~w(
    abort action add after all alter analyze and as asc attach autoincrement
    before begin between by cascade case cast check class collate column commit
    conflict constraint create cross current current_date current_time
    current_timestamp database default deferrable deferred delete desc detach
    distinct do drop each else end escape except exclusive exists explain fail
    filter first following for foreign from full glob group having if ignore
    immediate in index indexed initially inner insert instead intersect into is
    isnull join key last left like limit match natural no not nothing notnull null
    nulls of offset on or order outer over partition plan pragma preceding primary
    query raise range recursive references regexp reindex release rename replace
    restrict right rollback row rows savepoint select set table temp temporary then
    ties to transaction trigger type unbounded union unique update using vacuum values
    view virtual when where window with without
  )

  # TypeScript reserved words that need escaping in identifiers
  @ts_reserved_words ~w(
    break case catch class const continue debugger default delete do else enum
    export extends false finally for function if import in instanceof new null
    return super switch this throw true try typeof var void while with yield
    let static implements interface package private protected public
    abstract as async await boolean byte char constructor declare double
    enum export float from get goto int long module namespace of require
    set short string symbol type undefined
  )

  # ===================================================================
  # Public API
  # ===================================================================

  @doc """
  Generates TypeScript type definitions from entity specs.

  Expects a map with an "entities" key containing a list of entity spec maps.
  Each entity has "domain_entity", "columns" (with "name", "type", "nullable", optional "enum_values").

  Returns a string of valid TypeScript code with `export interface` declarations.
  """
  def generate_typescript_types(specs) do
    entities = get_in(specs, ["entities"]) || []
    header = "// Generated TypeScript type definitions\n// Do not edit manually\n\n"

    if entities == [] do
      header
    else
      interfaces =
        entities
        |> Enum.map(&generate_ts_interface/1)
        |> Enum.join("\n\n")

      header <> interfaces <> "\n"
    end
  end

  @doc """
  Generates Hono route handlers from API specs.

  Expects a map with an "api" key containing a list of endpoint spec maps.
  Each endpoint has "method", "path", "description", optionally "request_body".

  Returns a string of valid TypeScript code with Hono route definitions.
  """
  def generate_hono_routes(specs) do
    endpoints = get_in(specs, ["api"]) || []

    header = """
    // Generated Hono route handlers
    // Do not edit manually

    import { Hono } from 'hono';
    import type { Context } from 'hono';

    const app = new Hono();
    """

    if endpoints == [] do
      header <> "\nexport default app;\n"
    else
      routes =
        endpoints
        |> Enum.map(&generate_hono_route/1)
        |> Enum.join("\n\n")

      header <> "\n" <> routes <> "\n\nexport default app;\n"
    end
  end

  @doc """
  Generates D1 migration SQL from entity specs.

  Expects a map with an "entities" key containing entity spec maps.
  Each entity has "name"/"table", "columns" (with "name", "type", "nullable", optional "default"),
  and optional "indexes".

  Returns a string of valid SQLite-compatible SQL.
  """
  def generate_d1_migration(specs) do
    entities = get_in(specs, ["entities"]) || []

    header = "-- Generated D1 migration SQL\n-- Do not edit manually\n\n"

    if entities == [] do
      header
    else
      tables =
        entities
        |> Enum.map(&generate_create_table/1)
        |> Enum.join("\n\n")

      indexes =
        entities
        |> Enum.flat_map(&generate_indexes/1)
        |> Enum.join("\n")

      result = header <> tables

      if indexes != "" do
        result <> "\n\n" <> indexes <> "\n"
      else
        result <> "\n"
      end
    end
  end

  @doc """
  Generates test stubs from behaviour specs.

  Expects a map with a "behaviours" key containing behaviour spec maps.
  Each behaviour has "name", "given", "when", "then".

  Returns a string of valid TypeScript test code with describe/test blocks.
  """
  def generate_test_stubs(specs) do
    behaviours = get_in(specs, ["behaviours"]) || []

    header = """
    // Generated test stubs
    // Do not edit manually

    import { describe, test, expect } from 'vitest';
    """

    if behaviours == [] do
      header
    else
      tests =
        behaviours
        |> Enum.map(&generate_test_block/1)
        |> Enum.join("\n\n")

      header <> "\n" <> tests <> "\n"
    end
  end

  @doc """
  Generates all artifacts from spec files in the map directory.

  Reads entities.yaml, api.yaml, and behaviours.yaml from map/solution/specs/,
  generates all artifact types, and writes them to output_dir.

  Returns `{:ok, %{types_file, routes_file, migration_file, tests_file}}`.
  """
  def generate_all(map_dir, output_dir) do
    specs_dir = Path.join([map_dir, "solution", "specs"])
    File.mkdir_p!(output_dir)

    entity_specs = read_spec_file(specs_dir, "entities.yaml")
    api_specs = read_spec_file(specs_dir, "api.yaml")
    behaviour_specs = read_spec_file(specs_dir, "behaviours.yaml")

    types_content = generate_typescript_types(entity_specs)
    routes_content = generate_hono_routes(api_specs)
    migration_content = generate_d1_migration(entity_specs)
    tests_content = generate_test_stubs(behaviour_specs)

    types_file = Path.join(output_dir, "types.ts")
    routes_file = Path.join(output_dir, "routes.ts")
    migration_file = Path.join(output_dir, "migration.sql")
    tests_file = Path.join(output_dir, "tests.test.ts")

    File.write!(types_file, types_content)
    File.write!(routes_file, routes_content)
    File.write!(migration_file, migration_content)
    File.write!(tests_file, tests_content)

    {:ok,
     %{
       types_file: types_file,
       routes_file: routes_file,
       migration_file: migration_file,
       tests_file: tests_file
     }}
  end

  # ===================================================================
  # Type Mapping Functions (public for testing)
  # ===================================================================

  @doc """
  Maps a column type from entity specs to a TypeScript type.
  """
  def column_to_ts_type(type) do
    type_lower = String.downcase(to_string(type))

    cond do
      type_lower == "uuid" -> "string"
      String.starts_with?(type_lower, "varchar") -> "string"
      type_lower == "text" -> "string"
      type_lower == "timestamp" -> "string"
      type_lower == "boolean" -> "boolean"
      type_lower == "integer" -> "number"
      type_lower == "float" or type_lower == "double" or type_lower == "real" -> "number"
      type_lower == "enum" -> "string"
      true -> "string"
    end
  end

  @doc """
  Maps a column type from entity specs to a SQLite column type (for D1).
  """
  def column_to_sql_type(type) do
    type_lower = String.downcase(to_string(type))

    cond do
      type_lower == "boolean" -> "INTEGER"
      type_lower == "integer" -> "INTEGER"
      type_lower == "float" or type_lower == "double" or type_lower == "real" -> "REAL"
      type_lower == "blob" -> "BLOB"
      # Everything else is TEXT in SQLite
      true -> "TEXT"
    end
  end

  # ===================================================================
  # Private: TypeScript Generation
  # ===================================================================

  defp generate_ts_interface(entity) do
    entity_name = entity["domain_entity"] || pascal_case(entity["name"] || "Unknown")
    columns = entity["columns"] || []

    # Use safe name for interface (PascalCase from domain_entity)
    safe_name = safe_ts_interface_name(entity_name)

    fields =
      columns
      |> Enum.map(&generate_ts_field/1)
      |> Enum.join("\n")

    "export interface #{safe_name} {\n#{fields}\n}"
  end

  defp generate_ts_field(column) do
    name = column["name"] || "unknown"
    type = column["type"] || "string"
    nullable = column["nullable"]
    enum_values = column["enum_values"]

    ts_name = snake_to_camel(name)

    ts_type =
      if enum_values && is_list(enum_values) && enum_values != [] do
        enum_values
        |> Enum.map(&("\"#{&1}\""))
        |> Enum.join(" | ")
      else
        column_to_ts_type(type)
      end

    ts_type_with_null =
      if nullable do
        "#{ts_type} | null"
      else
        ts_type
      end

    "  #{ts_name}: #{ts_type_with_null};"
  end

  defp safe_ts_interface_name(name) do
    pascal = pascal_case(name)

    if String.downcase(pascal) in @ts_reserved_words do
      "#{pascal}Entity"
    else
      pascal
    end
  end

  # ===================================================================
  # Private: Hono Route Generation
  # ===================================================================

  defp generate_hono_route(endpoint) do
    method = String.downcase(endpoint["method"] || "get")
    path = endpoint["path"] || "/"
    description = endpoint["description"] || ""
    method_upper = String.upcase(method)

    "// #{description}\n" <>
      "app.#{method}('#{path}', async (c: Context) => {\n" <>
      "  // TODO: Implement #{method_upper} #{path}\n" <>
      "  return c.json({ ok: true, data: {} });\n" <>
      "});"
  end

  # ===================================================================
  # Private: SQL Migration Generation
  # ===================================================================

  defp generate_create_table(entity) do
    table_name = entity["table"] || entity["name"] || "unknown"
    columns = entity["columns"] || []

    safe_table = quote_sql_identifier(table_name)

    column_defs =
      columns
      |> Enum.map(&generate_sql_column/1)
      |> Enum.join(",\n")

    "CREATE TABLE IF NOT EXISTS #{safe_table} (\n#{column_defs}\n);"
  end

  defp generate_sql_column(column) do
    name = column["name"] || "unknown"
    type = column["type"] || "text"
    nullable = column["nullable"]
    default = column["default"]

    sql_type = column_to_sql_type(type)
    safe_name = quote_sql_identifier_if_needed(name)

    parts = ["  #{safe_name} #{sql_type}"]

    parts =
      if nullable == false do
        parts ++ ["NOT NULL"]
      else
        parts
      end

    parts =
      if default do
        parts ++ ["DEFAULT '#{escape_sql_string(to_string(default))}'"]
      else
        parts
      end

    Enum.join(parts, " ")
  end

  defp generate_indexes(entity) do
    table_name = entity["table"] || entity["name"] || "unknown"
    indexes = entity["indexes"] || []

    Enum.map(indexes, fn index ->
      columns = index["columns"] || []
      unique = index["unique"] == true

      col_names = Enum.join(columns, "_")
      index_name = "idx_#{table_name}_#{col_names}"
      safe_table = quote_sql_identifier(table_name)
      col_list = Enum.map(columns, &quote_sql_identifier_if_needed/1) |> Enum.join(", ")

      unique_str = if unique, do: "UNIQUE ", else: ""

      "CREATE #{unique_str}INDEX IF NOT EXISTS #{index_name} ON #{safe_table} (#{col_list});"
    end)
  end

  defp quote_sql_identifier(name) do
    if String.downcase(name) in @sql_reserved_words do
      "\"#{name}\""
    else
      name
    end
  end

  defp quote_sql_identifier_if_needed(name) do
    if String.downcase(name) in @sql_reserved_words do
      "\"#{name}\""
    else
      name
    end
  end

  defp escape_sql_string(str) do
    String.replace(str, "'", "''")
  end

  # ===================================================================
  # Private: Test Stub Generation
  # ===================================================================

  defp generate_test_block(behaviour) do
    name = behaviour["name"] || "unnamed behaviour"
    given = behaviour["given"] || ""
    when_clause = behaviour["when"] || ""
    then_clause = behaviour["then"] || ""
    escaped_name = escape_js_string(name)

    "describe('#{escaped_name}', () => {\n" <>
      "  test('#{escaped_name}', () => {\n" <>
      "    // Given: #{given}\n" <>
      "    // When: #{when_clause}\n" <>
      "    // Then: #{then_clause}\n" <>
      "    // TODO: Implement this test\n" <>
      "    expect(true).toBe(false); // Placeholder - implement me\n" <>
      "  });\n" <>
      "});"
  end

  # ===================================================================
  # Private: String Utilities
  # ===================================================================

  defp snake_to_camel(name) do
    parts = String.split(name, "_")

    case parts do
      [first | rest] ->
        first <> (rest |> Enum.map(&String.capitalize/1) |> Enum.join())

      [] ->
        name
    end
  end

  defp pascal_case(name) do
    name
    |> String.split(~r/[_\-\s]+/)
    |> Enum.map(&String.capitalize/1)
    |> Enum.join()
  end

  defp escape_js_string(str) do
    str
    |> String.replace("\\", "\\\\")
    |> String.replace("'", "\\'")
  end

  defp read_spec_file(specs_dir, filename) do
    path = Path.join(specs_dir, filename)

    if File.exists?(path) do
      case Yaml.decode_file(path) do
        {:ok, data} when is_map(data) -> data
        _ -> %{}
      end
    else
      %{}
    end
  end
end

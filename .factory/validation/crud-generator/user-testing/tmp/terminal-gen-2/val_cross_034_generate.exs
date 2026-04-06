work = "/Users/sdawka/Code/bropilot/.factory/validation/crud-generator/user-testing/tmp/terminal-gen-2/val-cross-034"
File.rm_rf!(work)
File.mkdir_p!(work)

map_dir = Path.join(work, "map")
specs_dir = Path.join([map_dir, "solution", "specs"])
File.mkdir_p!(specs_dir)

entities = %{
  "entities" => [
    %{
      "name" => "settings",
      "table" => "settings",
      "domain_entity" => "Settings",
      "columns" => [
        %{"name" => "id", "type" => "uuid", "nullable" => false},
        %{"name" => "key", "type" => "varchar(255)", "nullable" => false},
        %{"name" => "value", "type" => "text", "nullable" => true},
        %{"name" => "is_active", "type" => "boolean", "nullable" => false}
      ]
    }
  ]
}

api = %{
  "api" => [
    %{"method" => "GET", "path" => "/api/settings", "description" => "List settings"},
    %{"method" => "POST", "path" => "/api/settings", "description" => "Create setting"}
  ]
}

behaviours = %{
  "behaviours" => [
    %{"name" => "Read a setting", "given" => "exists", "when" => "query", "then" => "returns"}
  ]
}

Bropilot.Yaml.encode_to_file(entities, Path.join(specs_dir, "entities.yaml"))
Bropilot.Yaml.encode_to_file(api, Path.join(specs_dir, "api.yaml"))
Bropilot.Yaml.encode_to_file(behaviours, Path.join(specs_dir, "behaviours.yaml"))

output_dir = Path.join(work, "generated")
{:ok, result} = Bropilot.Generator.generate_all(map_dir, output_dir)

{:ok, sql} = File.read(result.migration_file)
{:ok, routes} = File.read(result.routes_file)

has_references = String.contains?(sql, "REFERENCES")
has_join = String.contains?(String.downcase(sql), "join")
has_nested_routes = routes =~ ~r{/api/settings/:}

summary = [
  "types_file=#{result.types_file}",
  "routes_file=#{result.routes_file}",
  "migration_file=#{result.migration_file}",
  "tests_file=#{result.tests_file}",
  "has_references=#{has_references}",
  "has_join=#{has_join}",
  "has_nested_routes=#{has_nested_routes}"
] |> Enum.join("\n")

File.write!("/Users/sdawka/.factory/missions/d8fa6f8d-4b8d-4089-827f-d5cd03a2e873/evidence/crud-generator/terminal-gen-2/VAL-CROSS-034-generate-summary.txt", summary <> "\n")
IO.puts(summary)

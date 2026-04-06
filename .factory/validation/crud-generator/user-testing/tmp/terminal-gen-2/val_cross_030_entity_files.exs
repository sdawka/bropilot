map_dir = "/Users/sdawka/Code/bropilot/.factory/validation/crud-generator/user-testing/tmp/terminal-gen-2/val-cross-030/map"
out_dir = "/Users/sdawka/Code/bropilot/.factory/validation/crud-generator/user-testing/tmp/terminal-gen-2/val-cross-030/generated"

{:ok, entity_data} = Bropilot.Yaml.decode_file(Path.join([map_dir, "solution", "specs", "entities.yaml"]))
entities = entity_data["entities"] || []

paths = %{
  "types" => Path.join(out_dir, "types.ts"),
  "routes" => Path.join(out_dir, "routes.ts"),
  "migration" => Path.join(out_dir, "migration.sql"),
  "tests" => Path.join(out_dir, "tests.test.ts")
}

lines =
  Enum.map(entities, fn entity ->
    name = entity["domain_entity"] || entity["name"]
    "#{name}: #{inspect(paths)}"
  end)

body = Enum.join(lines, "\n")
path = "/Users/sdawka/.factory/missions/d8fa6f8d-4b8d-4089-827f-d5cd03a2e873/evidence/crud-generator/terminal-gen-2/VAL-CROSS-030-entity-artifact-map.txt"
File.write!(path, body <> "\n")
IO.puts(body)

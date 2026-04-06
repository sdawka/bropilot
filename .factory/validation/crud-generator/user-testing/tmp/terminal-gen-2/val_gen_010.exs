specs = %{
  "entities" => [
    %{
      "name" => "tasks",
      "table" => "tasks",
      "domain_entity" => "Task",
      "columns" => [
        %{"name" => "id", "type" => "uuid", "nullable" => false},
        %{"name" => "title", "type" => "varchar(255)", "nullable" => false},
        %{"name" => "user_id", "type" => "uuid", "nullable" => true},
        %{"name" => "workspace_id", "type" => "uuid", "nullable" => false}
      ]
    }
  ]
}

ts = Bropilot.Generator.generate_typescript_types(specs)
path = "/Users/sdawka/.factory/missions/d8fa6f8d-4b8d-4089-827f-d5cd03a2e873/evidence/crud-generator/terminal-gen-2/VAL-GEN-010-types.ts"
File.write!(path, ts)
IO.puts(ts)

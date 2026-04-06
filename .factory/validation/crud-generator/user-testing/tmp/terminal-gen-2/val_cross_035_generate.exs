work = "/Users/sdawka/Code/bropilot/.factory/validation/crud-generator/user-testing/tmp/terminal-gen-2/val-cross-035"
File.rm_rf!(work)
File.mkdir_p!(work)

map_dir = Path.join(work, "map")
specs_dir = Path.join([map_dir, "solution", "specs"])
File.mkdir_p!(specs_dir)

entities = %{
  "entities" => [
    %{
      "name" => "tasks",
      "table" => "tasks",
      "domain_entity" => "Task",
      "columns" => [
        %{"name" => "id", "type" => "uuid", "nullable" => false},
        %{"name" => "title", "type" => "varchar(255)", "nullable" => false},
        %{"name" => "user_id", "type" => "uuid", "nullable" => true},
        %{"name" => "workspace_id", "type" => "uuid", "nullable" => false},
        %{"name" => "category_id", "type" => "uuid", "nullable" => true}
      ],
      "relationships" => [
        %{"type" => "belongs_to", "target" => "users", "foreign_key" => "user_id"},
        %{"type" => "belongs_to", "target" => "workspaces", "foreign_key" => "workspace_id"},
        %{"type" => "many_to_many", "target" => "tags", "through" => "task_tags"}
      ]
    },
    %{"name" => "users", "table" => "users", "domain_entity" => "User", "columns" => [%{"name" => "id", "type" => "uuid", "nullable" => false}]},
    %{"name" => "workspaces", "table" => "workspaces", "domain_entity" => "Workspace", "columns" => [%{"name" => "id", "type" => "uuid", "nullable" => false}]},
    %{"name" => "categories", "table" => "categories", "domain_entity" => "Category", "columns" => [%{"name" => "id", "type" => "uuid", "nullable" => false}]}
  ]
}

api = %{
  "api" => [
    %{"method" => "GET", "path" => "/api/tasks", "description" => "List tasks"},
    %{"method" => "POST", "path" => "/api/tasks", "description" => "Create task"}
  ]
}

behaviours = %{
  "behaviours" => [
    %{"name" => "Assign task", "given" => "task exists", "when" => "assign user", "then" => "task has assignee"}
  ]
}

Bropilot.Yaml.encode_to_file(entities, Path.join(specs_dir, "entities.yaml"))
Bropilot.Yaml.encode_to_file(api, Path.join(specs_dir, "api.yaml"))
Bropilot.Yaml.encode_to_file(behaviours, Path.join(specs_dir, "behaviours.yaml"))

output_dir = Path.join(work, "generated")
{:ok, result} = Bropilot.Generator.generate_all(map_dir, output_dir)

{:ok, ts} = File.read(result.types_file)
{:ok, sql} = File.read(result.migration_file)
{:ok, routes} = File.read(result.routes_file)

has_user_id_field = String.contains?(ts, "userId: string")
has_workspace_id_field = String.contains?(ts, "workspaceId: string")
has_category_id_field = String.contains?(ts, "categoryId: string")
has_references = String.contains?(sql, "REFERENCES")
has_join_table = sql =~ ~r/CREATE TABLE IF NOT EXISTS\s+task_tags/i
has_nested_routes = routes =~ ~r{/api/(users|workspaces|categories)/:id/tasks|/api/tasks/:id/(users|workspaces|categories)}

summary = [
  "types_file=#{result.types_file}",
  "routes_file=#{result.routes_file}",
  "migration_file=#{result.migration_file}",
  "tests_file=#{result.tests_file}",
  "has_user_id_field=#{has_user_id_field}",
  "has_workspace_id_field=#{has_workspace_id_field}",
  "has_category_id_field=#{has_category_id_field}",
  "has_references=#{has_references}",
  "has_join_table=#{has_join_table}",
  "has_nested_routes=#{has_nested_routes}"
] |> Enum.join("\n")

File.write!("/Users/sdawka/.factory/missions/d8fa6f8d-4b8d-4089-827f-d5cd03a2e873/evidence/crud-generator/terminal-gen-2/VAL-CROSS-035-generate-summary.txt", summary <> "\n")
IO.puts(summary)

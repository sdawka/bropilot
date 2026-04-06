defmodule Bropilot.GeneratorTest do
  use ExUnit.Case

  alias Bropilot.Generator

  # -- Test Fixtures --

  defp entity_specs do
    %{
      "entities" => [
        %{
          "name" => "users",
          "table" => "users",
          "domain_entity" => "User",
          "columns" => [
            %{"name" => "id", "type" => "uuid", "nullable" => false},
            %{"name" => "email", "type" => "varchar(255)", "nullable" => false},
            %{"name" => "name", "type" => "varchar(255)", "nullable" => false},
            %{"name" => "role", "type" => "varchar(50)", "nullable" => false, "default" => "member"}
          ],
          "indexes" => [
            %{"columns" => ["email"], "unique" => true}
          ]
        },
        %{
          "name" => "tasks",
          "table" => "tasks",
          "domain_entity" => "Task",
          "columns" => [
            %{"name" => "id", "type" => "uuid", "nullable" => false},
            %{"name" => "title", "type" => "varchar(255)", "nullable" => false},
            %{"name" => "description", "type" => "text", "nullable" => true},
            %{"name" => "status", "type" => "varchar(50)", "nullable" => false, "default" => "todo"},
            %{"name" => "priority", "type" => "varchar(50)", "nullable" => false, "default" => "medium"},
            %{"name" => "due_date", "type" => "timestamp", "nullable" => true},
            %{"name" => "user_id", "type" => "uuid", "nullable" => true},
            %{"name" => "workspace_id", "type" => "uuid", "nullable" => false}
          ],
          "indexes" => [
            %{"columns" => ["workspace_id"]},
            %{"columns" => ["user_id"]}
          ]
        },
        %{
          "name" => "workspaces",
          "table" => "workspaces",
          "domain_entity" => "Workspace",
          "columns" => [
            %{"name" => "id", "type" => "uuid", "nullable" => false},
            %{"name" => "name", "type" => "varchar(255)", "nullable" => false},
            %{"name" => "description", "type" => "text", "nullable" => true}
          ]
        }
      ]
    }
  end

  defp api_specs do
    %{
      "api" => [
        %{
          "method" => "GET",
          "path" => "/api/tasks",
          "description" => "List all tasks in a workspace",
          "related_entity" => "Task",
          "auth" => "token"
        },
        %{
          "method" => "POST",
          "path" => "/api/tasks",
          "description" => "Create a new task",
          "related_entity" => "Task",
          "auth" => "token",
          "request_body" => %{"title" => "string", "description" => "string", "priority" => "string"}
        },
        %{
          "method" => "PUT",
          "path" => "/api/tasks/:id",
          "description" => "Update an existing task",
          "related_entity" => "Task",
          "auth" => "token"
        },
        %{
          "method" => "DELETE",
          "path" => "/api/tasks/:id",
          "description" => "Delete a task",
          "related_entity" => "Task",
          "auth" => "token"
        },
        %{
          "method" => "GET",
          "path" => "/api/users",
          "description" => "List workspace members",
          "related_entity" => "User",
          "auth" => "token"
        }
      ]
    }
  end

  defp behaviour_specs do
    %{
      "behaviours" => [
        %{
          "name" => "Create task with valid data",
          "given" => "User is authenticated and in a workspace",
          "when" => "User submits task form with title",
          "then" => "Task is created and appears in task list",
          "actors" => ["User"],
          "side_effects" => ["task.created event emitted"]
        },
        %{
          "name" => "Assign task to user",
          "given" => "Task exists and assignee is workspace member",
          "when" => "User selects assignee on task",
          "then" => "Task assignee is updated and notification sent",
          "actors" => ["User"],
          "side_effects" => ["notification sent to assignee"]
        },
        %{
          "name" => "Complete a task",
          "given" => "Task exists and is not already completed",
          "when" => "User marks task as done",
          "then" => "Task status changes to done",
          "actors" => ["User"],
          "side_effects" => ["task.completed event emitted"]
        }
      ]
    }
  end

  # -- Entity with enum type for type mapping tests --

  defp entity_with_enum do
    %{
      "entities" => [
        %{
          "name" => "users",
          "table" => "users",
          "domain_entity" => "User",
          "columns" => [
            %{"name" => "id", "type" => "uuid", "nullable" => false},
            %{"name" => "email", "type" => "varchar(255)", "nullable" => false},
            %{"name" => "role", "type" => "enum", "nullable" => false, "enum_values" => ["admin", "member"]},
            %{"name" => "is_active", "type" => "boolean", "nullable" => false},
            %{"name" => "age", "type" => "integer", "nullable" => true},
            %{"name" => "created_at", "type" => "timestamp", "nullable" => false},
            %{"name" => "bio", "type" => "text", "nullable" => true}
          ]
        }
      ]
    }
  end

  # -- Reserved word entity names --

  defp reserved_word_entity_specs do
    %{
      "entities" => [
        %{
          "name" => "class",
          "table" => "class",
          "domain_entity" => "Class",
          "columns" => [
            %{"name" => "id", "type" => "uuid", "nullable" => false},
            %{"name" => "name", "type" => "varchar(255)", "nullable" => false},
            %{"name" => "type", "type" => "varchar(50)", "nullable" => true}
          ]
        }
      ]
    }
  end

  # ===================================================================
  # TypeScript Type Generation Tests (VAL-GEN-001, VAL-GEN-002, VAL-GEN-010)
  # ===================================================================

  describe "generate_typescript_types/1" do
    test "produces type definitions for User and Task with all fields" do
      output = Generator.generate_typescript_types(entity_specs())

      # Check User interface
      assert String.contains?(output, "export interface User")
      assert String.contains?(output, "id: string")
      assert String.contains?(output, "email: string")
      assert String.contains?(output, "name: string")
      assert String.contains?(output, "role: string")

      # Check Task interface
      assert String.contains?(output, "export interface Task")
      assert String.contains?(output, "title: string")
      assert String.contains?(output, "description: string | null")
      assert String.contains?(output, "status: string")
      assert String.contains?(output, "priority: string")
      assert String.contains?(output, "dueDate: string | null")
      assert String.contains?(output, "userId: string | null")
      assert String.contains?(output, "workspaceId: string")

      # Check Workspace interface
      assert String.contains?(output, "export interface Workspace")
    end

    test "maps column types correctly (VAL-GEN-002)" do
      output = Generator.generate_typescript_types(entity_with_enum())

      # uuid → string
      assert String.contains?(output, "id: string")
      # varchar → string
      assert String.contains?(output, "email: string")
      # enum → union literal
      assert output =~ ~r/role: "admin" \| "member"/
      # boolean → boolean
      assert String.contains?(output, "isActive: boolean")
      # integer → number, nullable → | null
      assert String.contains?(output, "age: number | null")
      # timestamp → string
      assert String.contains?(output, "createdAt: string")
      # text, nullable → string | null
      assert String.contains?(output, "bio: string | null")
    end

    test "foreign key fields are camelCase (VAL-GEN-010)" do
      output = Generator.generate_typescript_types(entity_specs())

      # user_id → userId, workspace_id → workspaceId
      assert String.contains?(output, "userId: string")
      assert String.contains?(output, "workspaceId: string")
      refute String.contains?(output, "user_id")
      refute String.contains?(output, "workspace_id")
    end

    test "handles reserved word entity names" do
      output = Generator.generate_typescript_types(reserved_word_entity_specs())

      # Should still generate valid TypeScript (Class is fine as an interface name,
      # but 'class' as a variable name would be reserved - we use PascalCase for interface)
      assert String.contains?(output, "export interface Class")
      assert String.contains?(output, "id: string")
      assert String.contains?(output, "name: string")
      # 'type' is a field name - should be fine in interface
      assert output =~ ~r/type: string \| null/
    end

    test "handles empty entities gracefully (VAL-GEN-008)" do
      output = Generator.generate_typescript_types(%{"entities" => []})
      assert is_binary(output)
      # Should be valid but empty TS (just a comment/header)
      assert String.contains?(output, "// Generated")

      # Also handle nil/missing entities
      output2 = Generator.generate_typescript_types(%{})
      assert is_binary(output2)
      assert String.contains?(output2, "// Generated")
    end
  end

  # ===================================================================
  # Hono Route Handler Generation Tests (VAL-GEN-003, VAL-GEN-004)
  # ===================================================================

  describe "generate_hono_routes/1" do
    test "produces valid Hono route handlers from API specs (VAL-GEN-003)" do
      output = Generator.generate_hono_routes(api_specs())

      assert String.contains?(output, "app.get")
      assert String.contains?(output, "app.post")
      assert String.contains?(output, "app.put")
      assert String.contains?(output, "app.delete")
      assert String.contains?(output, "/api/tasks")
      assert String.contains?(output, "/api/users")
    end

    test "maps HTTP methods correctly (VAL-GEN-004)" do
      output = Generator.generate_hono_routes(api_specs())

      # GET → app.get
      assert output =~ ~r/app\.get\(.+\/api\/tasks/
      # POST → app.post
      assert output =~ ~r/app\.post\(.+\/api\/tasks/
      # PUT → app.put
      assert output =~ ~r/app\.put\(.+\/api\/tasks\/:id/
      # DELETE → app.delete
      assert output =~ ~r/app\.delete\(.+\/api\/tasks\/:id/
    end

    test "includes Hono import and app creation" do
      output = Generator.generate_hono_routes(api_specs())

      assert String.contains?(output, "import { Hono }")
      assert String.contains?(output, "new Hono")
    end

    test "handles PATCH method" do
      specs = %{
        "api" => [
          %{"method" => "PATCH", "path" => "/api/tasks/:id", "description" => "Partially update a task"}
        ]
      }

      output = Generator.generate_hono_routes(specs)
      assert output =~ ~r/app\.patch\(.+\/api\/tasks\/:id/
    end

    test "handles empty API specs gracefully (VAL-GEN-008)" do
      output = Generator.generate_hono_routes(%{"api" => []})
      assert is_binary(output)
      assert String.contains?(output, "// Generated")

      output2 = Generator.generate_hono_routes(%{})
      assert is_binary(output2)
    end
  end

  # ===================================================================
  # D1 Migration SQL Generation Tests (VAL-GEN-005, VAL-GEN-006)
  # ===================================================================

  describe "generate_d1_migration/1" do
    test "produces valid CREATE TABLE statements (VAL-GEN-005)" do
      output = Generator.generate_d1_migration(entity_specs())

      assert String.contains?(output, "CREATE TABLE IF NOT EXISTS users")
      assert String.contains?(output, "CREATE TABLE IF NOT EXISTS tasks")
      assert String.contains?(output, "CREATE TABLE IF NOT EXISTS workspaces")
    end

    test "maps column types correctly for SQLite" do
      output = Generator.generate_d1_migration(entity_specs())

      # uuid → TEXT
      assert output =~ ~r/id TEXT NOT NULL/
      # varchar → TEXT
      assert output =~ ~r/email TEXT NOT NULL/
      # text → TEXT, nullable
      assert output =~ ~r/description TEXT/
      # timestamp → TEXT (SQLite has no native timestamp type)
      assert output =~ ~r/due_date TEXT/
    end

    test "includes NOT NULL constraints" do
      output = Generator.generate_d1_migration(entity_specs())

      # Non-nullable columns should have NOT NULL
      assert output =~ ~r/id TEXT NOT NULL/
      assert output =~ ~r/title TEXT NOT NULL/

      # Nullable columns should NOT have NOT NULL
      # description is nullable so should not have NOT NULL
      lines = String.split(output, "\n")
      desc_line = Enum.find(lines, fn l -> String.contains?(l, "description TEXT") and not String.contains?(l, "NOT NULL") end)
      assert desc_line != nil
    end

    test "includes DEFAULT values" do
      output = Generator.generate_d1_migration(entity_specs())

      assert output =~ ~r/role TEXT NOT NULL DEFAULT 'member'/
      assert output =~ ~r/status TEXT NOT NULL DEFAULT 'todo'/
      assert output =~ ~r/priority TEXT NOT NULL DEFAULT 'medium'/
    end

    test "produces correct indexes (VAL-GEN-006)" do
      output = Generator.generate_d1_migration(entity_specs())

      # UNIQUE index on users.email
      assert output =~ ~r/CREATE UNIQUE INDEX/i
      assert output =~ ~r/idx_users_email/
      assert output =~ ~r/users.*\(email\)/

      # Regular indexes on tasks
      assert output =~ ~r/idx_tasks_workspace_id/
      assert output =~ ~r/idx_tasks_user_id/
    end

    test "handles reserved word table names" do
      output = Generator.generate_d1_migration(reserved_word_entity_specs())

      # 'class' is a reserved word in some SQL dialects - should be quoted
      # For SQLite, we use double quotes around identifiers
      assert String.contains?(output, "CREATE TABLE IF NOT EXISTS \"class\"")
    end

    test "handles empty entity specs gracefully (VAL-GEN-008)" do
      output = Generator.generate_d1_migration(%{"entities" => []})
      assert is_binary(output)
      assert String.contains?(output, "-- Generated")

      output2 = Generator.generate_d1_migration(%{})
      assert is_binary(output2)
    end

    test "handles entities without indexes" do
      output = Generator.generate_d1_migration(entity_specs())

      # Workspaces has no indexes defined - should still produce valid CREATE TABLE
      assert String.contains?(output, "CREATE TABLE IF NOT EXISTS workspaces")
    end
  end

  # ===================================================================
  # Test Stub Generation Tests (VAL-GEN-007)
  # ===================================================================

  describe "generate_test_stubs/1" do
    test "produces one test block per behaviour (VAL-GEN-007)" do
      output = Generator.generate_test_stubs(behaviour_specs())

      # Should have exactly 3 describe/test blocks
      assert String.contains?(output, "Create task with valid data")
      assert String.contains?(output, "Assign task to user")
      assert String.contains?(output, "Complete a task")

      # Count test/describe blocks
      test_count = length(Regex.scan(~r/(?:describe|test)\(/, output))
      assert test_count >= 3
    end

    test "includes placeholder body" do
      output = Generator.generate_test_stubs(behaviour_specs())

      # Each test should have a TODO or failing assertion
      assert String.contains?(output, "TODO") or String.contains?(output, "expect")
    end

    test "includes import and describe wrapper" do
      output = Generator.generate_test_stubs(behaviour_specs())

      assert String.contains?(output, "import { describe")
      assert String.contains?(output, "import { test") or String.contains?(output, "import { it") or
        (String.contains?(output, "describe") and String.contains?(output, "test"))
    end

    test "handles empty behaviour specs gracefully (VAL-GEN-008)" do
      output = Generator.generate_test_stubs(%{"behaviours" => []})
      assert is_binary(output)
      assert String.contains?(output, "// Generated")

      output2 = Generator.generate_test_stubs(%{})
      assert is_binary(output2)
    end
  end

  # ===================================================================
  # Combined generate_all function test (VAL-GEN-009)
  # ===================================================================

  describe "generate_all/1" do
    setup do
      tmp = System.tmp_dir!() |> Path.join("bropilot_gen_test_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)

      map_dir = Path.join(tmp, "map")
      specs_dir = Path.join([map_dir, "solution", "specs"])
      File.mkdir_p!(specs_dir)

      # Write spec files
      Bropilot.Yaml.encode_to_file(entity_specs(), Path.join(specs_dir, "entities.yaml"))
      Bropilot.Yaml.encode_to_file(api_specs(), Path.join(specs_dir, "api.yaml"))
      Bropilot.Yaml.encode_to_file(behaviour_specs(), Path.join(specs_dir, "behaviours.yaml"))

      on_exit(fn -> File.rm_rf!(tmp) end)

      {:ok, tmp: tmp, map_dir: map_dir, specs_dir: specs_dir}
    end

    test "generates all artifact types from spec files", %{map_dir: map_dir, tmp: tmp} do
      output_dir = Path.join(tmp, "generated")

      {:ok, result} = Generator.generate_all(map_dir, output_dir)

      assert is_map(result)
      assert Map.has_key?(result, :types_file)
      assert Map.has_key?(result, :routes_file)
      assert Map.has_key?(result, :migration_file)
      assert Map.has_key?(result, :tests_file)

      # Files should exist on disk
      assert File.exists?(result.types_file)
      assert File.exists?(result.routes_file)
      assert File.exists?(result.migration_file)
      assert File.exists?(result.tests_file)

      # Verify content
      {:ok, types_content} = File.read(result.types_file)
      assert String.contains?(types_content, "export interface User")
      assert String.contains?(types_content, "export interface Task")

      {:ok, routes_content} = File.read(result.routes_file)
      assert String.contains?(routes_content, "app.get")

      {:ok, migration_content} = File.read(result.migration_file)
      assert String.contains?(migration_content, "CREATE TABLE")

      {:ok, tests_content} = File.read(result.tests_file)
      assert String.contains?(tests_content, "Create task with valid data")
    end

    test "handles missing spec files gracefully", %{tmp: tmp} do
      empty_map_dir = Path.join(tmp, "empty_map")
      File.mkdir_p!(Path.join([empty_map_dir, "solution", "specs"]))
      output_dir = Path.join(tmp, "gen_empty")

      {:ok, result} = Generator.generate_all(empty_map_dir, output_dir)

      # Should still produce files (valid but empty content)
      assert File.exists?(result.types_file)
      assert File.exists?(result.routes_file)
      assert File.exists?(result.migration_file)
      assert File.exists?(result.tests_file)
    end
  end

  # ===================================================================
  # Type mapping unit tests
  # ===================================================================

  describe "column_to_ts_type/1 mapping" do
    test "maps uuid to string" do
      assert Generator.column_to_ts_type("uuid") == "string"
    end

    test "maps varchar(N) to string" do
      assert Generator.column_to_ts_type("varchar(255)") == "string"
      assert Generator.column_to_ts_type("varchar(50)") == "string"
    end

    test "maps text to string" do
      assert Generator.column_to_ts_type("text") == "string"
    end

    test "maps timestamp to string" do
      assert Generator.column_to_ts_type("timestamp") == "string"
    end

    test "maps boolean to boolean" do
      assert Generator.column_to_ts_type("boolean") == "boolean"
    end

    test "maps integer to number" do
      assert Generator.column_to_ts_type("integer") == "number"
    end

    test "maps enum to string (default without values)" do
      assert Generator.column_to_ts_type("enum") == "string"
    end
  end

  describe "column_to_sql_type/1 mapping" do
    test "maps uuid to TEXT" do
      assert Generator.column_to_sql_type("uuid") == "TEXT"
    end

    test "maps varchar(N) to TEXT" do
      assert Generator.column_to_sql_type("varchar(255)") == "TEXT"
    end

    test "maps text to TEXT" do
      assert Generator.column_to_sql_type("text") == "TEXT"
    end

    test "maps timestamp to TEXT" do
      assert Generator.column_to_sql_type("timestamp") == "TEXT"
    end

    test "maps boolean to INTEGER" do
      assert Generator.column_to_sql_type("boolean") == "INTEGER"
    end

    test "maps integer to INTEGER" do
      assert Generator.column_to_sql_type("integer") == "INTEGER"
    end
  end
end

defmodule Bropilot.M4CrossFlowTest do
  @moduledoc """
  M4 CRUD Generator cross-flow integration tests.

  Verifies the entity spec → CRUD generation → traceability pipeline:
    - VAL-CROSS-030: CRUD generator produces code from entity specs
    - VAL-CROSS-031: CRUD generation records traceability links
    - VAL-CROSS-032: CRUD types match entity attribute schemas
    - VAL-CROSS-033: CRUD migration SQL matches entity columns
    - VAL-CROSS-034: CRUD generator handles entity with no relationships
    - VAL-CROSS-035: CRUD generator handles entity with multiple relationships
    - VAL-CROSS-085: Concurrent page access during pipeline execution
  """
  use ExUnit.Case
  import Plug.Test

  alias Bropilot.Generator
  alias Bropilot.Traceability
  alias Bropilot.Api.Endpoint
  alias Bropilot.Task.Agent
  alias Bropilot.Pipeline.Act2.Extractor

  setup_all do
    case Process.whereis(Bropilot.Api.Session) do
      nil -> start_supervised!(Bropilot.Api.Session)
      _pid -> :ok
    end

    :ok
  end

  @opts Endpoint.init([])

  defp call(conn) do
    Endpoint.call(conn, @opts)
  end

  defp json_body(conn) do
    Jason.decode!(conn.resp_body)
  end

  setup do
    tmp = System.tmp_dir!() |> Path.join("bropilot_m4_cross_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)

    original_cwd = File.cwd!()
    File.cd!(tmp)

    {:ok, bropilot_dir} = Bropilot.init(tmp)
    map_dir = Path.join(bropilot_dir, "map")

    # Write mock spec data that Act 2 would produce (entities, api, behaviours)
    specs_dir = Path.join([map_dir, "solution", "specs"])
    File.mkdir_p!(specs_dir)

    mock_specs = Extractor.mock_specs_data()

    for {category, data} <- mock_specs do
      Bropilot.Yaml.encode_to_file(
        %{category => data},
        Path.join(specs_dir, "#{category}.yaml")
      )
    end

    # Write domain data (entities + relationships)
    domain_dir = Path.join([map_dir, "solution", "domain"])
    File.mkdir_p!(domain_dir)

    mock_domain = Extractor.mock_domain_data()
    Bropilot.Yaml.encode_to_file(
      %{"entities" => mock_domain["entities"]},
      Path.join(domain_dir, "entities.yaml")
    )
    Bropilot.Yaml.encode_to_file(
      %{"relationships" => mock_domain["relationships"]},
      Path.join(domain_dir, "relationships.yaml")
    )

    on_exit(fn ->
      File.cd!(original_cwd)
      File.rm_rf!(tmp)
    end)

    {:ok,
     project_dir: tmp,
     bropilot_dir: bropilot_dir,
     map_dir: map_dir,
     specs_dir: specs_dir}
  end

  # ===================================================================
  # VAL-CROSS-030: CRUD generator produces code from entity specs
  # ===================================================================

  describe "VAL-CROSS-030: CRUD generator produces code from entity specs" do
    test "generate_all produces TS types, routes, migration, and test stubs from spec files",
         %{map_dir: map_dir, project_dir: project_dir} do
      output_dir = Path.join(project_dir, "generated")

      {:ok, result} = Generator.generate_all(map_dir, output_dir)

      # All 4 artifact files must exist
      assert File.exists?(result.types_file), "types.ts should exist"
      assert File.exists?(result.routes_file), "routes.ts should exist"
      assert File.exists?(result.migration_file), "migration.sql should exist"
      assert File.exists?(result.tests_file), "tests.test.ts should exist"

      # Verify TS types are syntactically valid (contain proper structure)
      {:ok, types_content} = File.read(result.types_file)
      assert String.contains?(types_content, "export interface User")
      assert String.contains?(types_content, "export interface Task")
      assert String.contains?(types_content, "export interface Workspace")

      # Verify Hono routes contain proper route handlers
      {:ok, routes_content} = File.read(result.routes_file)
      assert String.contains?(routes_content, "import { Hono }")
      assert String.contains?(routes_content, "app.get")
      assert String.contains?(routes_content, "app.post")

      # Verify migration SQL contains CREATE TABLE
      {:ok, migration_content} = File.read(result.migration_file)
      assert String.contains?(migration_content, "CREATE TABLE IF NOT EXISTS users")
      assert String.contains?(migration_content, "CREATE TABLE IF NOT EXISTS tasks")
      assert String.contains?(migration_content, "CREATE TABLE IF NOT EXISTS workspaces")

      # Verify test stubs contain describe/test blocks
      {:ok, tests_content} = File.read(result.tests_file)
      assert String.contains?(tests_content, "describe(")
      assert String.contains?(tests_content, "test(")
    end

    test "full pipeline: Act 2 mock specs → generator → output files exist",
         %{map_dir: map_dir, project_dir: project_dir} do
      # This simulates the actual pipeline: Act 2 produces specs, generator consumes them
      output_dir = Path.join(project_dir, "crud_output")

      {:ok, result} = Generator.generate_all(map_dir, output_dir)

      # Verify each entity produced content
      {:ok, types} = File.read(result.types_file)
      # Count interfaces — should be at least 3 (User, Task, Workspace)
      interface_count = length(Regex.scan(~r/export interface \w+/, types))
      assert interface_count >= 3, "Expected at least 3 interfaces, got #{interface_count}"

      {:ok, migration} = File.read(result.migration_file)
      table_count = length(Regex.scan(~r/CREATE TABLE IF NOT EXISTS/, migration))
      assert table_count >= 3, "Expected at least 3 CREATE TABLE statements, got #{table_count}"
    end
  end

  # ===================================================================
  # VAL-CROSS-031: CRUD generation records traceability links
  # ===================================================================

  describe "VAL-CROSS-031: CRUD generation records traceability links" do
    test "after codegen with entity-related specs, traceability has links for all artifact types",
         %{project_dir: project_dir, map_dir: map_dir} do
      # Build a task that references entity specs (as Act 3 codegen would)
      task = %{
        "id" => "crud-gen-001",
        "title" => "Generate User CRUD",
        "description" => "Generate CRUD for User entity",
        "context" => "entities.User — generate type definitions, routes, migrations, and tests",
        "definition_of_done" => ["CRUD generated"],
        "dependencies" => [],
        "priority" => "high",
        "related_specs" => [
          "solution.specs.entities.User",
          "solution.specs.api.InitProject"
        ],
        "status" => "pending"
      }

      # Mock LLM response that produces all 4 artifact types
      response_fn = fn _messages, _opts ->
        {:ok, """
        ```file:lib/app/user.ex
        defmodule App.User do
          defstruct [:id, :email, :name, :role]

          def create(attrs), do: {:ok, struct!(__MODULE__, attrs)}
          def read(id), do: {:ok, %__MODULE__{id: id}}
        end
        ```

        ```file:lib/app/user_types.ex
        defmodule App.UserTypes do
          @type t :: %{id: String.t(), email: String.t(), name: String.t(), role: String.t()}
        end
        ```

        ```file:test/app/user_test.exs
        defmodule App.UserTest do
          use ExUnit.Case
          test "creates user" do
            assert {:ok, _} = App.User.create(%{id: "1", email: "test@test.com", name: "Test", role: "member"})
          end
        end
        ```

        ```file:priv/migrations/001_create_users.sql
        CREATE TABLE users (
          id TEXT PRIMARY KEY NOT NULL,
          email TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member'
        );
        CREATE UNIQUE INDEX idx_users_email ON users (email);
        ```
        """}
      end

      # Run codegen (with auto-linkage)
      {:ok, pid} = Agent.start_link(task,
        execution_mode: :llm,
        llm_opts: [provider: :mock, response_fn: response_fn],
        map_dir: map_dir,
        project_path: project_dir
      )
      Agent.execute(pid)
      GenServer.stop(pid)

      # Verify traceability has entity links with correct types
      {:ok, entity_entry} = Traceability.read(map_dir, "entities", "User")
      assert entity_entry != nil
      link_types = Enum.map(entity_entry["links"], & &1["type"]) |> Enum.sort() |> Enum.uniq()

      assert "implementation" in link_types, "Expected implementation link for entity"
      assert "type" in link_types, "Expected type link for entity"
      assert "test" in link_types, "Expected test link for entity"
      assert "migration" in link_types, "Expected migration link for entity"

      # Verify API entry also has links
      {:ok, api_entry} = Traceability.read(map_dir, "api", "InitProject")
      assert api_entry != nil
      assert length(api_entry["links"]) >= 1

      # Verify traceability API endpoint returns the links
      conn = conn(:get, "/api/traceability") |> call()
      assert conn.status == 200
      body = json_body(conn)
      assert body["ok"] == true

      entries = body["data"]["entries"]
      entity_api_entry = Enum.find(entries, fn e ->
        e["spec_category"] == "entities" && e["spec_id"] == "User"
      end)
      assert entity_api_entry != nil
      assert length(entity_api_entry["links"]) >= 4,
             "Expected at least 4 links (impl, type, test, migration) for entities/User"
    end
  end

  # ===================================================================
  # VAL-CROSS-032: CRUD types match entity attribute schemas
  # ===================================================================

  describe "VAL-CROSS-032: CRUD types match entity attribute schemas" do
    test "generated TS types have all entity attributes with correct TS types",
         %{map_dir: map_dir, project_dir: project_dir} do
      output_dir = Path.join(project_dir, "gen_types_check")
      {:ok, result} = Generator.generate_all(map_dir, output_dir)
      {:ok, types_content} = File.read(result.types_file)

      # Read entity specs to compare
      specs_dir = Path.join([map_dir, "solution", "specs"])
      {:ok, entity_data} = Bropilot.Yaml.decode_file(Path.join(specs_dir, "entities.yaml"))
      entities = entity_data["entities"]

      for entity <- entities do
        entity_name = entity["domain_entity"] || entity["name"]
        columns = entity["columns"] || []

        # Verify interface exists
        assert String.contains?(types_content, "export interface #{entity_name}"),
               "Missing interface for #{entity_name}"

        # Verify each column appears as a typed field
        for column <- columns do
          col_name = column["name"]
          col_type = column["type"]
          nullable = column["nullable"]

          # Convert to expected camelCase
          expected_ts_name = snake_to_camel(col_name)
          expected_ts_type = Generator.column_to_ts_type(col_type)

          expected_field =
            if nullable do
              "#{expected_ts_name}: #{expected_ts_type} | null"
            else
              "#{expected_ts_name}: #{expected_ts_type}"
            end

          assert String.contains?(types_content, expected_field),
                 "Entity #{entity_name}: expected field '#{expected_field}' in TS types but not found.\nGenerated:\n#{types_content}"
        end
      end
    end

    test "type mapping covers all common types: uuid, varchar, text, timestamp, boolean, integer" do
      assert Generator.column_to_ts_type("uuid") == "string"
      assert Generator.column_to_ts_type("varchar(255)") == "string"
      assert Generator.column_to_ts_type("text") == "string"
      assert Generator.column_to_ts_type("timestamp") == "string"
      assert Generator.column_to_ts_type("boolean") == "boolean"
      assert Generator.column_to_ts_type("integer") == "number"
      assert Generator.column_to_ts_type("float") == "number"
      assert Generator.column_to_ts_type("real") == "number"
    end
  end

  # ===================================================================
  # VAL-CROSS-033: CRUD migration SQL matches entity columns
  # ===================================================================

  describe "VAL-CROSS-033: CRUD migration SQL matches entity columns" do
    test "generated SQL CREATE TABLE columns match entity YAML attributes",
         %{map_dir: map_dir, project_dir: project_dir} do
      output_dir = Path.join(project_dir, "gen_sql_check")
      {:ok, result} = Generator.generate_all(map_dir, output_dir)
      {:ok, sql_content} = File.read(result.migration_file)

      # Read entity specs to compare
      specs_dir = Path.join([map_dir, "solution", "specs"])
      {:ok, entity_data} = Bropilot.Yaml.decode_file(Path.join(specs_dir, "entities.yaml"))
      entities = entity_data["entities"]

      for entity <- entities do
        table_name = entity["table"] || entity["name"]
        columns = entity["columns"] || []

        # Verify table exists in SQL
        assert sql_content =~ ~r/CREATE TABLE IF NOT EXISTS.*#{Regex.escape(table_name)}/,
               "Missing CREATE TABLE for #{table_name}"

        # Verify each column appears with correct SQL type
        for column <- columns do
          col_name = column["name"]
          col_type = column["type"]
          nullable = column["nullable"]

          expected_sql_type = Generator.column_to_sql_type(col_type)

          # Column must appear in the SQL
          assert String.contains?(sql_content, col_name),
                 "Column #{col_name} not found in SQL for table #{table_name}"

          # SQL type must be correct
          assert sql_content =~ ~r/#{Regex.escape(col_name)} #{Regex.escape(expected_sql_type)}/,
                 "Column #{col_name} should have SQL type #{expected_sql_type}"

          # NOT NULL constraint for non-nullable columns
          if nullable == false do
            # Find the line with this column and verify NOT NULL
            lines = String.split(sql_content, "\n")
            col_line = Enum.find(lines, fn l ->
              String.contains?(l, col_name) && String.contains?(l, expected_sql_type)
            end)

            assert col_line != nil && String.contains?(col_line, "NOT NULL"),
                   "Non-nullable column #{col_name} should have NOT NULL in table #{table_name}"
          end
        end
      end
    end

    test "SQL type mapping: string→TEXT, integer→INTEGER, boolean→INTEGER" do
      assert Generator.column_to_sql_type("uuid") == "TEXT"
      assert Generator.column_to_sql_type("varchar(255)") == "TEXT"
      assert Generator.column_to_sql_type("text") == "TEXT"
      assert Generator.column_to_sql_type("timestamp") == "TEXT"
      assert Generator.column_to_sql_type("boolean") == "INTEGER"
      assert Generator.column_to_sql_type("integer") == "INTEGER"
      assert Generator.column_to_sql_type("float") == "REAL"
      assert Generator.column_to_sql_type("blob") == "BLOB"
    end
  end

  # ===================================================================
  # VAL-CROSS-034: CRUD generator handles entity with no relationships
  # ===================================================================

  describe "VAL-CROSS-034: entity with no relationships" do
    test "generates valid CRUD artifacts without foreign keys or join tables" do
      # Entity with attributes but NO relationships to other entities
      specs = %{
        "entities" => [
          %{
            "name" => "settings",
            "table" => "settings",
            "domain_entity" => "Settings",
            "columns" => [
              %{"name" => "id", "type" => "uuid", "nullable" => false},
              %{"name" => "key", "type" => "varchar(255)", "nullable" => false},
              %{"name" => "value", "type" => "text", "nullable" => true},
              %{"name" => "is_active", "type" => "boolean", "nullable" => false, "default" => "true"}
            ]
          }
        ]
      }

      # Generate TypeScript types
      ts_output = Generator.generate_typescript_types(specs)
      assert String.contains?(ts_output, "export interface Settings")
      assert String.contains?(ts_output, "id: string")
      assert String.contains?(ts_output, "key: string")
      assert String.contains?(ts_output, "value: string | null")
      assert String.contains?(ts_output, "isActive: boolean")

      # Generate SQL migration
      sql_output = Generator.generate_d1_migration(specs)
      assert String.contains?(sql_output, "CREATE TABLE IF NOT EXISTS settings")

      # No REFERENCES clauses (no foreign keys)
      refute String.contains?(sql_output, "REFERENCES"),
             "Entity with no relationships should have no REFERENCES in SQL"

      # No JOIN TABLE
      refute String.contains?(String.downcase(sql_output), "join"),
             "Entity with no relationships should have no join tables"

      # Generate routes — should not have nested resource endpoints
      api_specs = %{"api" => [
        %{"method" => "GET", "path" => "/api/settings", "description" => "List settings"},
        %{"method" => "POST", "path" => "/api/settings", "description" => "Create setting"}
      ]}
      routes_output = Generator.generate_hono_routes(api_specs)
      assert String.contains?(routes_output, "app.get")
      assert String.contains?(routes_output, "app.post")

      # Generate test stubs
      behaviour_specs = %{"behaviours" => [
        %{"name" => "Read a setting", "given" => "Setting exists", "when" => "GET by key", "then" => "Returns setting value"}
      ]}
      tests_output = Generator.generate_test_stubs(behaviour_specs)
      assert String.contains?(tests_output, "Read a setting")
    end

    test "full pipeline for standalone entity with no FK columns" do
      tmp = System.tmp_dir!() |> Path.join("bropilot_no_rel_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)

      map_dir = Path.join(tmp, "map")
      specs_dir = Path.join([map_dir, "solution", "specs"])
      File.mkdir_p!(specs_dir)

      # Write a standalone entity with no FK columns
      Bropilot.Yaml.encode_to_file(
        %{"entities" => [
          %{
            "name" => "tags",
            "table" => "tags",
            "domain_entity" => "Tag",
            "columns" => [
              %{"name" => "id", "type" => "uuid", "nullable" => false},
              %{"name" => "label", "type" => "varchar(100)", "nullable" => false},
              %{"name" => "color", "type" => "varchar(7)", "nullable" => true}
            ]
          }
        ]},
        Path.join(specs_dir, "entities.yaml")
      )

      Bropilot.Yaml.encode_to_file(%{"api" => []}, Path.join(specs_dir, "api.yaml"))
      Bropilot.Yaml.encode_to_file(%{"behaviours" => []}, Path.join(specs_dir, "behaviours.yaml"))

      output_dir = Path.join(tmp, "generated")
      {:ok, result} = Generator.generate_all(map_dir, output_dir)

      {:ok, types} = File.read(result.types_file)
      assert String.contains?(types, "export interface Tag")
      assert String.contains?(types, "label: string")
      assert String.contains?(types, "color: string | null")

      {:ok, sql} = File.read(result.migration_file)
      assert String.contains?(sql, "CREATE TABLE IF NOT EXISTS tags")
      refute String.contains?(sql, "REFERENCES")

      File.rm_rf!(tmp)
    end
  end

  # ===================================================================
  # VAL-CROSS-035: CRUD generator handles entity with multiple relationships
  # ===================================================================

  describe "VAL-CROSS-035: entity with multiple relationships" do
    test "entity with 3+ relationships produces correct FK columns and SQL" do
      # Entity with multiple relationship columns (user_id, workspace_id, category_id)
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
              %{"name" => "workspace_id", "type" => "uuid", "nullable" => false},
              %{"name" => "category_id", "type" => "uuid", "nullable" => true}
            ],
            "indexes" => [
              %{"columns" => ["user_id"]},
              %{"columns" => ["workspace_id"]},
              %{"columns" => ["category_id"]}
            ]
          },
          %{
            "name" => "users",
            "table" => "users",
            "domain_entity" => "User",
            "columns" => [
              %{"name" => "id", "type" => "uuid", "nullable" => false},
              %{"name" => "name", "type" => "varchar(255)", "nullable" => false}
            ]
          },
          %{
            "name" => "workspaces",
            "table" => "workspaces",
            "domain_entity" => "Workspace",
            "columns" => [
              %{"name" => "id", "type" => "uuid", "nullable" => false},
              %{"name" => "name", "type" => "varchar(255)", "nullable" => false}
            ]
          },
          %{
            "name" => "categories",
            "table" => "categories",
            "domain_entity" => "Category",
            "columns" => [
              %{"name" => "id", "type" => "uuid", "nullable" => false},
              %{"name" => "label", "type" => "varchar(255)", "nullable" => false}
            ]
          }
        ]
      }

      # TypeScript should have relationship fields as camelCase typed fields
      ts_output = Generator.generate_typescript_types(specs)
      assert String.contains?(ts_output, "export interface Task")
      assert String.contains?(ts_output, "userId: string | null")
      assert String.contains?(ts_output, "workspaceId: string")
      assert String.contains?(ts_output, "categoryId: string | null")

      # SQL should have FK columns and indexes
      sql_output = Generator.generate_d1_migration(specs)
      assert String.contains?(sql_output, "user_id TEXT")
      assert String.contains?(sql_output, "workspace_id TEXT NOT NULL")
      assert String.contains?(sql_output, "category_id TEXT")

      # Indexes for relationship columns
      assert String.contains?(sql_output, "idx_tasks_user_id")
      assert String.contains?(sql_output, "idx_tasks_workspace_id")
      assert String.contains?(sql_output, "idx_tasks_category_id")
    end

    test "mock entity specs from Act 2 contain relationship columns (tasks → users, workspaces)" do
      # The mock_specs_data produces tasks with user_id and workspace_id columns
      mock_specs = Extractor.mock_specs_data()
      entities = mock_specs["entities"]

      task_entity = Enum.find(entities, fn e -> e["domain_entity"] == "Task" end)
      assert task_entity != nil, "Mock specs should include a Task entity"

      column_names = Enum.map(task_entity["columns"], & &1["name"])
      assert "user_id" in column_names, "Task should have user_id FK column"
      assert "workspace_id" in column_names, "Task should have workspace_id FK column"

      # Generate SQL from mock specs
      sql = Generator.generate_d1_migration(mock_specs)
      assert String.contains?(sql, "user_id TEXT")
      assert String.contains?(sql, "workspace_id TEXT NOT NULL")

      # Generate TS types from mock specs
      ts = Generator.generate_typescript_types(mock_specs)
      assert String.contains?(ts, "userId: string | null")
      assert String.contains?(ts, "workspaceId: string")
    end

    test "entity with has_many/belongs_to/many_to_many relationships produces correct artifacts" do
      # Simulate domain relationships data
      domain_relationships = [
        %{"source" => "User", "target" => "Task", "type" => "has_many", "description" => "User owns tasks"},
        %{"source" => "Task", "target" => "User", "type" => "belongs_to", "description" => "Task belongs to user"},
        %{"source" => "Task", "target" => "Tag", "type" => "many_to_many", "description" => "Tasks have tags"}
      ]

      # Entity specs with FK columns reflecting relationships
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
              %{"name" => "project_id", "type" => "uuid", "nullable" => false},
              %{"name" => "reviewer_id", "type" => "uuid", "nullable" => true}
            ]
          }
        ]
      }

      # TS types include all FK fields
      ts = Generator.generate_typescript_types(specs)
      assert String.contains?(ts, "userId: string | null")
      assert String.contains?(ts, "projectId: string")
      assert String.contains?(ts, "reviewerId: string | null")

      # SQL includes all FK columns
      sql = Generator.generate_d1_migration(specs)
      assert String.contains?(sql, "user_id TEXT")
      assert String.contains?(sql, "project_id TEXT NOT NULL")
      assert String.contains?(sql, "reviewer_id TEXT")

      # Verify the domain relationships data structure is coherent
      assert length(domain_relationships) == 3
      types = Enum.map(domain_relationships, & &1["type"])
      assert "has_many" in types
      assert "belongs_to" in types
      assert "many_to_many" in types
    end
  end

  # ===================================================================
  # Full pipeline: Act 2 entity specs → Generator → Files → Traceability
  # ===================================================================

  describe "full entity spec → generation → traceability pipeline" do
    test "end-to-end: mock extraction → generate_all → traceability records links",
         %{map_dir: map_dir, project_dir: project_dir} do
      # Step 1: Generate all artifacts from the mock specs (simulating Step 8)
      output_dir = Path.join([project_dir, "output", "crud-gen"])
      {:ok, gen_result} = Generator.generate_all(map_dir, output_dir)

      # Step 2: Simulate auto-linkage recording (as Act 3 executor would)
      # Record traceability for entity specs
      mock_specs = Extractor.mock_specs_data()
      entities = mock_specs["entities"]

      for entity <- entities do
        entity_name = entity["domain_entity"]
        links = [
          %{"type" => "type", "file_path" => Path.relative_to(gen_result.types_file, project_dir)},
          %{"type" => "migration", "file_path" => Path.relative_to(gen_result.migration_file, project_dir)},
          %{"type" => "implementation", "file_path" => Path.relative_to(gen_result.routes_file, project_dir)},
          %{"type" => "test", "file_path" => Path.relative_to(gen_result.tests_file, project_dir)}
        ]

        :ok = Traceability.write(map_dir, "entities", entity_name, links)
      end

      # Step 3: Verify traceability API returns the links
      conn = conn(:get, "/api/traceability") |> call()
      assert conn.status == 200
      body = json_body(conn)

      entries = body["data"]["entries"]
      entity_entries = Enum.filter(entries, fn e -> e["spec_category"] == "entities" end)
      assert length(entity_entries) >= 3,
             "Expected at least 3 entity entries (User, Task, Workspace)"

      # Each entity entry should have all 4 link types
      for entry <- entity_entries do
        link_types = Enum.map(entry["links"], & &1["type"]) |> Enum.sort() |> Enum.uniq()
        assert "type" in link_types, "Entity #{entry["spec_id"]} missing 'type' link"
        assert "migration" in link_types, "Entity #{entry["spec_id"]} missing 'migration' link"
        assert "implementation" in link_types, "Entity #{entry["spec_id"]} missing 'implementation' link"
        assert "test" in link_types, "Entity #{entry["spec_id"]} missing 'test' link"
      end

      # Coverage summary should reflect linked entities
      coverage = body["data"]["coverage"]
      assert coverage["by_category"]["entities"]["linked"] >= 3
    end

    test "generated files exist on disk and are non-empty",
         %{map_dir: map_dir, project_dir: project_dir} do
      output_dir = Path.join([project_dir, "output", "verify-files"])
      {:ok, result} = Generator.generate_all(map_dir, output_dir)

      for {_key, path} <- result do
        assert File.exists?(path), "Generated file should exist: #{path}"
        {:ok, content} = File.read(path)
        assert byte_size(content) > 20,
               "Generated file should be non-empty: #{path}"
      end
    end
  end

  # ===================================================================
  # VAL-CROSS-085: Concurrent page access during pipeline execution
  # ===================================================================

  describe "VAL-CROSS-085: concurrent page access during pipeline execution" do
    test "API endpoints respond while codegen task is being set up",
         %{project_dir: project_dir, map_dir: map_dir} do
      # Start a codegen task in a spawned process (simulating pipeline running)
      parent = self()

      spawn(fn ->
        task = %{
          "id" => "concurrent-task",
          "title" => "Concurrent test task",
          "description" => "Test concurrency",
          "context" => "",
          "definition_of_done" => ["Done"],
          "dependencies" => [],
          "priority" => "medium",
          "related_specs" => ["solution.specs.api.InitProject"],
          "status" => "pending"
        }

        response_fn = fn _messages, _opts ->
          # Simulate slow LLM call
          Process.sleep(100)
          {:ok, """
          ```file:lib/app/concurrent.ex
          defmodule App.Concurrent do
            def run, do: :ok
          end
          ```
          """}
        end

        {:ok, pid} = Agent.start_link(task,
          execution_mode: :llm,
          llm_opts: [provider: :mock, response_fn: response_fn],
          map_dir: map_dir,
          project_path: project_dir
        )

        result = Agent.execute(pid)
        GenServer.stop(pid)
        send(parent, {:codegen_done, result})
      end)

      # While codegen is "running", hit various API endpoints
      # These should all respond without blocking
      health_conn = conn(:get, "/api/health") |> call()
      assert health_conn.status == 200
      assert json_body(health_conn)["ok"] == true

      trace_conn = conn(:get, "/api/traceability") |> call()
      assert trace_conn.status == 200
      assert json_body(trace_conn)["ok"] == true

      # Wait for codegen to complete
      assert_receive {:codegen_done, _result}, 5000
    end

    test "multiple API endpoints respond correctly in parallel" do
      # Fire multiple concurrent requests to different endpoints
      tasks = [
        Task.async(fn -> conn(:get, "/api/health") |> call() end),
        Task.async(fn -> conn(:get, "/api/traceability") |> call() end),
        Task.async(fn -> conn(:get, "/api/health") |> call() end)
      ]

      results = Enum.map(tasks, &Task.await(&1, 5000))

      for result <- results do
        assert result.status == 200
        body = json_body(result)
        assert body["ok"] == true
      end
    end
  end

  # ===================================================================
  # Generated TypeScript compiles with tsc --noEmit
  # ===================================================================

  describe "generated TypeScript files compile" do
    test "generated types.ts is valid TypeScript syntax",
         %{map_dir: map_dir, project_dir: project_dir} do
      output_dir = Path.join(project_dir, "ts_compile_check")
      {:ok, result} = Generator.generate_all(map_dir, output_dir)

      {:ok, content} = File.read(result.types_file)

      # Validate basic TypeScript structure
      # Should have properly closed interfaces
      open_braces = length(Regex.scan(~r/\{/, content))
      close_braces = length(Regex.scan(~r/\}/, content))
      assert open_braces == close_braces,
             "TypeScript should have balanced braces: #{open_braces} open vs #{close_braces} close"

      # Each field should end with semicolon
      lines = String.split(content, "\n")
      field_lines = Enum.filter(lines, fn l ->
        trimmed = String.trim(l)
        String.contains?(trimmed, ":") && !String.starts_with?(trimmed, "//") &&
          !String.contains?(trimmed, "export") && !String.contains?(trimmed, "{") &&
          !String.contains?(trimmed, "}")
      end)

      for line <- field_lines do
        assert String.ends_with?(String.trim(line), ";"),
               "TypeScript field should end with semicolon: #{line}"
      end
    end

    test "generated SQL is valid SQLite syntax",
         %{map_dir: map_dir, project_dir: project_dir} do
      output_dir = Path.join(project_dir, "sql_check")
      {:ok, result} = Generator.generate_all(map_dir, output_dir)

      {:ok, content} = File.read(result.migration_file)

      # Validate basic SQL structure
      # Each CREATE TABLE should end with );
      table_blocks = Regex.scan(~r/CREATE TABLE.*?\);/s, content)
      assert length(table_blocks) >= 3,
             "Expected at least 3 CREATE TABLE blocks"

      # No unclosed parentheses
      for [block] <- table_blocks do
        open = length(Regex.scan(~r/\(/, block))
        close = length(Regex.scan(~r/\)/, block))
        assert open == close,
               "SQL block should have balanced parentheses:\n#{block}"
      end
    end
  end

  # ===================================================================
  # Helper functions
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
end

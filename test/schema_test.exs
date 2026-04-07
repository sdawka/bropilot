defmodule Bropilot.SchemaTest do
  use ExUnit.Case

  alias Bropilot.Recipe.Schema

  @webapp_schema_dir Path.join([__DIR__, "..", "priv", "recipes", "webapp", "schemas"])
                     |> Path.expand()

  describe "Schema.validate/2" do
    test "valid data passes" do
      schema = %{
        "fields" => %{
          "name" => %{"type" => "string", "required" => true},
          "age" => %{"type" => "string", "required" => false}
        }
      }

      data = %{"name" => "Alice", "age" => "30"}
      assert :ok = Schema.validate(data, schema)
    end

    test "missing required field fails" do
      schema = %{
        "fields" => %{
          "name" => %{"type" => "string", "required" => true},
          "email" => %{"type" => "string", "required" => true}
        }
      }

      data = %{"name" => "Alice"}
      assert {:error, errors} = Schema.validate(data, schema)
      assert Enum.any?(errors, fn {field, reason} -> field == "email" and reason == :required end)
    end

    test "missing optional field passes" do
      schema = %{
        "fields" => %{
          "name" => %{"type" => "string", "required" => true},
          "nickname" => %{"type" => "string", "required" => false}
        }
      }

      data = %{"name" => "Alice"}
      assert :ok = Schema.validate(data, schema)
    end

    test "wrong type for string field fails" do
      schema = %{
        "fields" => %{
          "name" => %{"type" => "string", "required" => true}
        }
      }

      data = %{"name" => 123}
      assert {:error, errors} = Schema.validate(data, schema)
      assert Enum.any?(errors, fn {field, _} -> field == "name" end)
    end

    test "wrong enum value fails" do
      schema = %{
        "fields" => %{
          "priority" => %{
            "type" => "enum",
            "values" => ["high", "medium", "low"],
            "required" => true
          }
        }
      }

      data = %{"priority" => "urgent"}
      assert {:error, errors} = Schema.validate(data, schema)

      assert Enum.any?(errors, fn
        {"priority", {:invalid_enum, "urgent", _}} -> true
        _ -> false
      end)
    end

    test "valid enum value passes" do
      schema = %{
        "fields" => %{
          "priority" => %{
            "type" => "enum",
            "values" => ["high", "medium", "low"],
            "required" => true
          }
        }
      }

      data = %{"priority" => "high"}
      assert :ok = Schema.validate(data, schema)
    end

    test "list type validation works" do
      schema = %{
        "fields" => %{
          "tags" => %{
            "type" => "list",
            "item_type" => "string",
            "required" => true
          }
        }
      }

      data = %{"tags" => ["elixir", "otp"]}
      assert :ok = Schema.validate(data, schema)
    end

    test "list with wrong item type fails" do
      schema = %{
        "fields" => %{
          "tags" => %{
            "type" => "list",
            "item_type" => "string",
            "required" => true
          }
        }
      }

      data = %{"tags" => [123, 456]}
      assert {:error, errors} = Schema.validate(data, schema)
      assert length(errors) == 2
    end

    test "non-list value for list field fails" do
      schema = %{
        "fields" => %{
          "items" => %{"type" => "list", "required" => true}
        }
      }

      data = %{"items" => "not a list"}
      assert {:error, errors} = Schema.validate(data, schema)
      assert Enum.any?(errors, fn {_, {:type_mismatch, :list, _}} -> true; _ -> false end)
    end

    test "boolean type validation" do
      schema = %{
        "fields" => %{
          "active" => %{"type" => "boolean", "required" => true}
        }
      }

      assert :ok = Schema.validate(%{"active" => true}, schema)
      assert :ok = Schema.validate(%{"active" => false}, schema)
      assert {:error, _} = Schema.validate(%{"active" => "yes"}, schema)
    end

    test "map type validation" do
      schema = %{
        "fields" => %{
          "metadata" => %{"type" => "map", "required" => true}
        }
      }

      assert :ok = Schema.validate(%{"metadata" => %{"key" => "val"}}, schema)
      assert {:error, _} = Schema.validate(%{"metadata" => "nope"}, schema)
    end

    test "ref type validates format (string)" do
      schema = %{
        "fields" => %{
          "parent" => %{"type" => "ref", "ref_to" => "entities", "required" => true}
        }
      }

      assert :ok = Schema.validate(%{"parent" => "entities.user"}, schema)
      assert {:error, _} = Schema.validate(%{"parent" => 42}, schema)
    end

    test "text type accepts strings" do
      schema = %{
        "fields" => %{
          "description" => %{"type" => "text", "required" => true}
        }
      }

      assert :ok = Schema.validate(%{"description" => "A long description"}, schema)
      assert {:error, _} = Schema.validate(%{"description" => 123}, schema)
    end

    test "list of maps with item_fields validates nested structure" do
      schema = %{
        "fields" => %{
          "columns" => %{
            "type" => "list",
            "item_type" => "map",
            "item_fields" => %{
              "name" => %{"type" => "string", "required" => true},
              "type" => %{"type" => "string", "required" => true}
            }
          }
        }
      }

      valid = %{
        "columns" => [
          %{"name" => "email", "type" => "string"},
          %{"name" => "age", "type" => "integer"}
        ]
      }

      assert :ok = Schema.validate(valid, schema)

      invalid = %{
        "columns" => [
          %{"name" => "email"},
          %{"type" => "integer"}
        ]
      }

      assert {:error, errors} = Schema.validate(invalid, schema)
      assert length(errors) >= 2
    end
  end

  describe "Schema.load_schema/1" do
    test "loads tasks schema YAML correctly" do
      path = Path.join([@webapp_schema_dir, "work", "tasks.schema.yaml"])
      assert {:ok, schema} = Schema.load_schema(path)
      assert schema["name"] == "tasks"
      assert is_map(schema["fields"])
      assert Map.has_key?(schema["fields"], "id")
      assert Map.has_key?(schema["fields"], "title")
      assert Map.has_key?(schema["fields"], "definition_of_done")
    end

    test "loads vibes schema YAML correctly" do
      path = Path.join([@webapp_schema_dir, "problem", "vibes.schema.yaml"])
      assert {:ok, schema} = Schema.load_schema(path)
      assert schema["name"] == "vibes"
      assert schema["fields"]["audience"]["required"] == true
    end

    test "loads glossary schema YAML correctly" do
      path = Path.join([@webapp_schema_dir, "knowledge", "glossary.schema.yaml"])
      assert {:ok, schema} = Schema.load_schema(path)
      assert schema["name"] == "glossary"
      assert schema["fields"]["term"]["type"] == "string"
    end
  end

  describe "validate against webapp recipe schemas" do
    test "valid task data passes tasks schema" do
      path = Path.join([@webapp_schema_dir, "work", "tasks.schema.yaml"])
      {:ok, schema} = Schema.load_schema(path)

      task = %{
        "id" => "task-001",
        "title" => "Create User model",
        "description" => "Implement the User entity.",
        "context" => "User entity is central.",
        "definition_of_done" => ["Schema created", "Tests pass"],
        "dependencies" => ["task-000"],
        "priority" => "high",
        "related_specs" => ["specs/entities/user.yaml"],
        "status" => "pending"
      }

      assert :ok = Schema.validate(task, schema)
    end

    test "task with invalid priority enum fails" do
      path = Path.join([@webapp_schema_dir, "work", "tasks.schema.yaml"])
      {:ok, schema} = Schema.load_schema(path)

      task = %{
        "id" => "task-001",
        "title" => "Create User model",
        "description" => "Implement the User entity.",
        "context" => "User entity is central.",
        "definition_of_done" => ["Schema created"],
        "priority" => "urgent"
      }

      assert {:error, errors} = Schema.validate(task, schema)

      assert Enum.any?(errors, fn
        {"priority", {:invalid_enum, "urgent", _}} -> true
        _ -> false
      end)
    end

    test "valid vibes data passes vibes schema" do
      path = Path.join([@webapp_schema_dir, "problem", "vibes.schema.yaml"])
      {:ok, schema} = Schema.load_schema(path)

      vibes = %{
        "audience" => "Developers who want to build apps faster",
        "use_cases" => ["Build a webapp", "Generate code"],
        "capabilities" => ["Code generation", "Schema validation"],
        "volo" => "Make app building feel effortless"
      }

      assert :ok = Schema.validate(vibes, schema)
    end

    test "vibes data missing required audience fails" do
      path = Path.join([@webapp_schema_dir, "problem", "vibes.schema.yaml"])
      {:ok, schema} = Schema.load_schema(path)

      vibes = %{
        "use_cases" => ["Build a webapp"],
        "capabilities" => ["Code generation"],
        "volo" => "Make it effortless"
      }

      assert {:error, errors} = Schema.validate(vibes, schema)
      assert Enum.any?(errors, fn {"audience", :required} -> true; _ -> false end)
    end

    test "valid glossary entry passes glossary schema" do
      path = Path.join([@webapp_schema_dir, "knowledge", "glossary.schema.yaml"])
      {:ok, schema} = Schema.load_schema(path)

      entry = %{
        "term" => "Entity",
        "definition" => "A domain object with a unique identity.",
        "source_space" => "solution",
        "aliases" => ["model", "domain object"],
        "related_terms" => ["glossary.aggregate"]
      }

      assert :ok = Schema.validate(entry, schema)
    end

    test "glossary with invalid source_space enum fails" do
      path = Path.join([@webapp_schema_dir, "knowledge", "glossary.schema.yaml"])
      {:ok, schema} = Schema.load_schema(path)

      entry = %{
        "term" => "Entity",
        "definition" => "A domain object.",
        "source_space" => "invalid_space"
      }

      assert {:error, errors} = Schema.validate(entry, schema)

      assert Enum.any?(errors, fn
        {"source_space", {:invalid_enum, _, _}} -> true
        _ -> false
      end)
    end
  end
end

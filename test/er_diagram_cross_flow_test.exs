defmodule Bropilot.ErDiagramCrossFlowTest do
  @moduledoc """
  Cross-flow integration tests for M3: domain modeling → ER diagram.
  Verifies that Act 2 extraction writes entity/relationship data that the
  ER diagram API can read correctly.
  """
  use ExUnit.Case

  alias Bropilot.Pipeline.Act2.Worker
  alias Bropilot.Map.Store

  defp create_tmp_dir do
    tmp = System.tmp_dir!() |> Path.join("bropilot_er_cross_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)
    tmp
  end

  defp init_project(tmp) do
    {:ok, bropilot_dir} = Bropilot.init(tmp)
    map_dir = Path.join(bropilot_dir, "map")
    recipe_dir = Path.join(bropilot_dir, "recipe")
    {bropilot_dir, map_dir, recipe_dir}
  end

  describe "Act 2 extraction → ER diagram data flow" do
    setup do
      tmp = create_tmp_dir()
      on_exit(fn -> File.rm_rf!(tmp) end)
      {_bropilot_dir, map_dir, recipe_dir} = init_project(tmp)
      {:ok, project_dir: tmp, map_dir: map_dir, recipe_dir: recipe_dir}
    end

    test "mock extraction writes entities and relationships to domain directory",
         %{project_dir: tmp, map_dir: map_dir, recipe_dir: recipe_dir} do
      # Start Act 2 worker in mock mode
      {:ok, worker} =
        Worker.start_link(
          project_path: tmp,
          recipe: recipe_dir,
          extraction_mode: :mock
        )

      # Run step 3
      {:ok, _prompt} = Worker.run_step3(worker)
      Worker.submit_input(worker, "A task management app with users and workspaces")
      {:ok, step3_data} = Worker.extract(worker)

      # Verify extraction returned data
      assert is_map(step3_data)
      assert is_list(step3_data["entities"]) or is_list(step3_data[:entities])

      entities = step3_data["entities"] || step3_data[:entities] || []
      relationships = step3_data["relationships"] || step3_data[:relationships] || []

      assert length(entities) >= 3, "Expected at least 3 entities from mock extraction"
      assert length(relationships) >= 3, "Expected at least 3 relationships"

      # Verify domain YAML files were written
      entities_path = Path.join([map_dir, "solution", "domain", "entities.yaml"])
      relationships_path = Path.join([map_dir, "solution", "domain", "relationships.yaml"])

      assert File.exists?(entities_path), "entities.yaml should exist after extraction"
      assert File.exists?(relationships_path), "relationships.yaml should exist after extraction"

      # Verify the data can be read back via Map.Store (same path the API uses)
      {:ok, domain_data} = Store.read(map_dir, :solution, :domain)

      assert is_map(domain_data)
      assert Map.has_key?(domain_data, "entities")
      assert Map.has_key?(domain_data, "relationships")

      # Verify entity structure
      stored_entities = domain_data["entities"]["entities"] || domain_data["entities"]
      assert is_list(stored_entities)
      assert length(stored_entities) >= 3

      for entity <- stored_entities do
        assert Map.has_key?(entity, "name"), "Entity must have a name"
        assert Map.has_key?(entity, "attributes"), "Entity must have attributes"
      end

      # Verify relationship structure
      stored_rels = domain_data["relationships"]["relationships"] || domain_data["relationships"]
      assert is_list(stored_rels)

      for rel <- stored_rels do
        assert Map.has_key?(rel, "source"), "Relationship must have source"
        assert Map.has_key?(rel, "target"), "Relationship must have target"
        assert Map.has_key?(rel, "type"), "Relationship must have type"
      end

      GenServer.stop(worker)
    end

    test "ER diagram works with partial domain data (no specs)",
         %{map_dir: map_dir} do
      # Write only domain entities (no specs) — simulates Step 3 done but not Step 4
      File.mkdir_p!(Path.join([map_dir, "solution", "domain"]))

      Bropilot.Yaml.encode_to_file(
        %{
          "entities" => [
            %{
              "name" => "User",
              "description" => "A registered user",
              "attributes" => %{"id" => "uuid", "name" => "string"}
            },
            %{
              "name" => "Task",
              "description" => "A work item",
              "attributes" => %{"id" => "uuid", "title" => "string"}
            }
          ]
        },
        Path.join([map_dir, "solution", "domain", "entities.yaml"])
      )

      Bropilot.Yaml.encode_to_file(
        %{
          "relationships" => [
            %{
              "source" => "User",
              "target" => "Task",
              "type" => "has_many",
              "description" => "User has many tasks"
            }
          ]
        },
        Path.join([map_dir, "solution", "domain", "relationships.yaml"])
      )

      # Read via Store (same path API uses)
      {:ok, domain_data} = Store.read(map_dir, :solution, :domain)

      entities = domain_data["entities"]["entities"]
      rels = domain_data["relationships"]["relationships"]

      assert length(entities) == 2
      assert length(rels) == 1

      # Verify no spec YAML files exist (init creates directory but no files)
      specs_path = Path.join([map_dir, "solution", "specs"])

      if File.dir?(specs_path) do
        {:ok, spec_files} = File.ls(specs_path)
        yaml_files = Enum.filter(spec_files, &(String.ends_with?(&1, ".yaml") or String.ends_with?(&1, ".yml")))
        assert yaml_files == [], "No spec YAML files should exist for partial domain data test"
      end
    end

    test "large domain model (50 entities) can be read via Store",
         %{map_dir: map_dir} do
      # Generate 50 entities
      entities =
        for i <- 1..50 do
          %{
            "name" => "Entity#{String.pad_leading(Integer.to_string(i), 2, "0")}",
            "description" => "Test entity #{i}",
            "attributes" => %{
              "id" => "uuid",
              "name" => "string",
              "field_a" => "string",
              "field_b" => "integer"
            }
          }
        end

      # Generate relationships (chain)
      relationships =
        for i <- 1..49 do
          %{
            "source" => "Entity#{String.pad_leading(Integer.to_string(i), 2, "0")}",
            "target" => "Entity#{String.pad_leading(Integer.to_string(i + 1), 2, "0")}",
            "type" => "has_many",
            "description" => "Chain relationship #{i}"
          }
        end

      File.mkdir_p!(Path.join([map_dir, "solution", "domain"]))

      Bropilot.Yaml.encode_to_file(
        %{"entities" => entities},
        Path.join([map_dir, "solution", "domain", "entities.yaml"])
      )

      Bropilot.Yaml.encode_to_file(
        %{"relationships" => relationships},
        Path.join([map_dir, "solution", "domain", "relationships.yaml"])
      )

      # Verify Store reads all 50 entities
      {:ok, domain_data} = Store.read(map_dir, :solution, :domain)

      stored_entities = domain_data["entities"]["entities"]
      stored_rels = domain_data["relationships"]["relationships"]

      assert length(stored_entities) == 50
      assert length(stored_rels) == 49
    end

    test "ER diagram data includes relationship cardinality types",
         %{map_dir: map_dir} do
      File.mkdir_p!(Path.join([map_dir, "solution", "domain"]))

      Bropilot.Yaml.encode_to_file(
        %{
          "entities" => [
            %{"name" => "User", "attributes" => %{"id" => "uuid"}},
            %{"name" => "Task", "attributes" => %{"id" => "uuid"}},
            %{"name" => "Tag", "attributes" => %{"id" => "uuid"}}
          ]
        },
        Path.join([map_dir, "solution", "domain", "entities.yaml"])
      )

      Bropilot.Yaml.encode_to_file(
        %{
          "relationships" => [
            %{"source" => "User", "target" => "Task", "type" => "has_many", "description" => "User tasks"},
            %{"source" => "Task", "target" => "User", "type" => "belongs_to", "description" => "Task owner"},
            %{"source" => "Task", "target" => "Tag", "type" => "many_to_many", "description" => "Task tags"},
            %{"source" => "User", "target" => "User", "type" => "has_one", "description" => "Manager"}
          ]
        },
        Path.join([map_dir, "solution", "domain", "relationships.yaml"])
      )

      {:ok, domain_data} = Store.read(map_dir, :solution, :domain)
      rels = domain_data["relationships"]["relationships"]

      types = Enum.map(rels, & &1["type"])
      assert "has_many" in types
      assert "belongs_to" in types
      assert "many_to_many" in types
      assert "has_one" in types
    end
  end
end

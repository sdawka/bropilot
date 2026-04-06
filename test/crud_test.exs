defmodule Bropilot.CrudTest do
  use ExUnit.Case

  alias Bropilot.Crud

  @task_schema %{
    "fields" => %{
      "title" => %{"type" => "string", "required" => true},
      "status" => %{
        "type" => "enum",
        "values" => ["todo", "in_progress", "done"],
        "required" => false
      },
      "priority" => %{
        "type" => "enum",
        "values" => ["low", "medium", "high"],
        "required" => false
      },
      "description" => %{"type" => "text", "required" => false}
    }
  }

  setup do
    tmp = System.tmp_dir!() |> Path.join("bropilot_crud_test_#{:rand.uniform(100_000)}")
    File.mkdir_p!(tmp)

    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, store: tmp}
  end

  describe "create/3 (without schema)" do
    test "inserts a record and returns it with auto-generated id", %{store: store} do
      attrs = %{"title" => "Buy milk", "status" => "todo"}
      assert {:ok, record} = Crud.create(store, "tasks", attrs)
      assert is_binary(record["id"])
      assert record["title"] == "Buy milk"
      assert record["status"] == "todo"
    end

    test "generates unique ids for multiple records", %{store: store} do
      {:ok, r1} = Crud.create(store, "tasks", %{"title" => "Task 1"})
      {:ok, r2} = Crud.create(store, "tasks", %{"title" => "Task 2"})
      assert r1["id"] != r2["id"]
    end

    test "preserves all supplied attributes", %{store: store} do
      attrs = %{"title" => "Complex task", "status" => "todo", "priority" => "high", "description" => "A detailed task"}
      {:ok, record} = Crud.create(store, "tasks", attrs)
      assert record["title"] == "Complex task"
      assert record["status"] == "todo"
      assert record["priority"] == "high"
      assert record["description"] == "A detailed task"
    end

    test "does not overwrite caller-supplied id", %{store: store} do
      attrs = %{"id" => "custom-id", "title" => "Custom ID task"}
      {:ok, record} = Crud.create(store, "tasks", attrs)
      assert record["id"] == "custom-id"
    end
  end

  describe "create/4 (with schema validation)" do
    test "accepts valid data", %{store: store} do
      attrs = %{"title" => "Valid task", "status" => "todo"}
      assert {:ok, record} = Crud.create(store, "tasks", attrs, schema: @task_schema)
      assert record["title"] == "Valid task"
    end

    test "rejects missing required field", %{store: store} do
      attrs = %{"status" => "todo"}
      assert {:error, errors} = Crud.create(store, "tasks", attrs, schema: @task_schema)
      assert is_list(errors)
      assert Enum.any?(errors, fn {field, reason} -> field == "title" and reason == :required end)
    end

    test "rejects invalid enum value", %{store: store} do
      attrs = %{"title" => "Task", "priority" => "extreme"}
      assert {:error, errors} = Crud.create(store, "tasks", attrs, schema: @task_schema)
      assert is_list(errors)
      assert Enum.any?(errors, fn
        {"priority", {:invalid_enum, "extreme", _}} -> true
        _ -> false
      end)
    end

    test "rejects both missing required and invalid enum", %{store: store} do
      attrs = %{"priority" => "extreme"}
      assert {:error, errors} = Crud.create(store, "tasks", attrs, schema: @task_schema)
      assert length(errors) >= 2
      assert Enum.any?(errors, fn {field, reason} -> field == "title" and reason == :required end)
      assert Enum.any?(errors, fn
        {"priority", {:invalid_enum, _, _}} -> true
        _ -> false
      end)
    end
  end

  describe "read/3" do
    test "retrieves an existing record by ID", %{store: store} do
      {:ok, created} = Crud.create(store, "tasks", %{"title" => "Read me"})
      assert {:ok, record} = Crud.read(store, "tasks", created["id"])
      assert record["title"] == "Read me"
      assert record["id"] == created["id"]
    end

    test "returns :not_found for missing ID", %{store: store} do
      assert {:error, :not_found} = Crud.read(store, "tasks", "nonexistent-id")
    end

    test "returns :not_found for empty collection", %{store: store} do
      assert {:error, :not_found} = Crud.read(store, "users", "any-id")
    end
  end

  describe "update/4 (without schema)" do
    test "merges attributes and preserves unchanged fields", %{store: store} do
      {:ok, created} = Crud.create(store, "tasks", %{"title" => "Original", "status" => "todo"})
      assert {:ok, updated} = Crud.update(store, "tasks", created["id"], %{"status" => "done"})
      assert updated["title"] == "Original"
      assert updated["status"] == "done"
      assert updated["id"] == created["id"]
    end

    test "returns :not_found for missing ID", %{store: store} do
      assert {:error, :not_found} = Crud.update(store, "tasks", "missing-id", %{"status" => "done"})
    end

    test "update does not change the id", %{store: store} do
      {:ok, created} = Crud.create(store, "tasks", %{"title" => "Task"})
      {:ok, updated} = Crud.update(store, "tasks", created["id"], %{"title" => "Updated"})
      assert updated["id"] == created["id"]
    end
  end

  describe "update/5 (with schema validation)" do
    test "rejects invalid type on update", %{store: store} do
      {:ok, created} = Crud.create(store, "tasks", %{"title" => "Task", "status" => "todo"})
      assert {:error, errors} = Crud.update(store, "tasks", created["id"], %{"title" => 42}, schema: @task_schema)
      assert is_list(errors)
      assert Enum.any?(errors, fn
        {"title", {:type_mismatch, :string, 42}} -> true
        _ -> false
      end)
    end

    test "accepts valid update with schema", %{store: store} do
      {:ok, created} = Crud.create(store, "tasks", %{"title" => "Task", "status" => "todo"})
      assert {:ok, updated} = Crud.update(store, "tasks", created["id"], %{"status" => "done"}, schema: @task_schema)
      assert updated["status"] == "done"
    end
  end

  describe "delete/3" do
    test "removes a record", %{store: store} do
      {:ok, created} = Crud.create(store, "tasks", %{"title" => "Delete me"})
      assert :ok = Crud.delete(store, "tasks", created["id"])
      assert {:error, :not_found} = Crud.read(store, "tasks", created["id"])
    end

    test "returns :not_found for missing ID", %{store: store} do
      assert {:error, :not_found} = Crud.delete(store, "tasks", "nonexistent-id")
    end

    test "subsequent list does not include deleted record", %{store: store} do
      {:ok, r1} = Crud.create(store, "tasks", %{"title" => "Keep"})
      {:ok, r2} = Crud.create(store, "tasks", %{"title" => "Delete"})
      :ok = Crud.delete(store, "tasks", r2["id"])
      {:ok, records} = Crud.list(store, "tasks")
      assert length(records) == 1
      assert hd(records)["id"] == r1["id"]
    end
  end

  describe "list/2" do
    test "returns all records for a collection", %{store: store} do
      Crud.create(store, "tasks", %{"title" => "Task 1"})
      Crud.create(store, "tasks", %{"title" => "Task 2"})
      Crud.create(store, "tasks", %{"title" => "Task 3"})

      assert {:ok, records} = Crud.list(store, "tasks")
      assert length(records) == 3
      assert Enum.all?(records, &is_binary(&1["id"]))
    end

    test "returns empty list for empty collection", %{store: store} do
      assert {:ok, []} = Crud.list(store, "tasks")
    end
  end

  describe "list/3 with filters" do
    test "filters by field value", %{store: store} do
      Crud.create(store, "tasks", %{"title" => "A", "status" => "todo"})
      Crud.create(store, "tasks", %{"title" => "B", "status" => "done"})
      Crud.create(store, "tasks", %{"title" => "C", "status" => "todo"})

      assert {:ok, records} = Crud.list(store, "tasks", filter: %{"status" => "todo"})
      assert length(records) == 2
      assert Enum.all?(records, fn r -> r["status"] == "todo" end)
    end

    test "filter with no matches returns empty list", %{store: store} do
      Crud.create(store, "tasks", %{"title" => "A", "status" => "todo"})
      assert {:ok, []} = Crud.list(store, "tasks", filter: %{"status" => "archived"})
    end

    test "filter by multiple fields", %{store: store} do
      Crud.create(store, "tasks", %{"title" => "A", "status" => "todo", "priority" => "high"})
      Crud.create(store, "tasks", %{"title" => "B", "status" => "todo", "priority" => "low"})
      Crud.create(store, "tasks", %{"title" => "C", "status" => "done", "priority" => "high"})

      assert {:ok, records} = Crud.list(store, "tasks", filter: %{"status" => "todo", "priority" => "high"})
      assert length(records) == 1
      assert hd(records)["title"] == "A"
    end
  end

  describe "list/3 with pagination" do
    setup %{store: store} do
      for i <- 1..10 do
        Crud.create(store, "items", %{"title" => "Item #{i}", "order" => i})
      end

      {:ok, store: store}
    end

    test "returns correct page size", %{store: store} do
      assert {:ok, result} = Crud.list(store, "items", page: 1, page_size: 3)
      assert length(result.records) == 3
      assert result.total == 10
      assert result.page == 1
      assert result.page_size == 3
    end

    test "second page returns next records", %{store: store} do
      {:ok, page1} = Crud.list(store, "items", page: 1, page_size: 3)
      {:ok, page2} = Crud.list(store, "items", page: 2, page_size: 3)

      page1_ids = Enum.map(page1.records, & &1["id"])
      page2_ids = Enum.map(page2.records, & &1["id"])

      # No overlap between pages
      assert Enum.all?(page2_ids, fn id -> id not in page1_ids end)
      assert length(page2.records) == 3
    end

    test "last partial page returns remaining records", %{store: store} do
      {:ok, result} = Crud.list(store, "items", page: 4, page_size: 3)
      assert length(result.records) == 1
      assert result.total == 10
    end

    test "page beyond data returns empty records", %{store: store} do
      {:ok, result} = Crud.list(store, "items", page: 5, page_size: 3)
      assert result.records == []
      assert result.total == 10
    end

    test "pagination metadata is correct", %{store: store} do
      {:ok, result} = Crud.list(store, "items", page: 2, page_size: 4)
      assert result.total == 10
      assert result.page == 2
      assert result.page_size == 4
      assert length(result.records) == 4
    end
  end

  describe "list/3 with filter + pagination" do
    test "filters first, then paginates", %{store: store} do
      for i <- 1..8 do
        status = if rem(i, 2) == 0, do: "even", else: "odd"
        Crud.create(store, "nums", %{"title" => "Num #{i}", "parity" => status})
      end

      {:ok, result} = Crud.list(store, "nums", filter: %{"parity" => "even"}, page: 1, page_size: 2)
      assert length(result.records) == 2
      assert result.total == 4
      assert Enum.all?(result.records, fn r -> r["parity"] == "even" end)
    end
  end

  describe "collection isolation" do
    test "records in 'tasks' don't leak to 'users'", %{store: store} do
      Crud.create(store, "tasks", %{"title" => "Task 1"})
      Crud.create(store, "users", %{"name" => "Alice"})

      {:ok, tasks} = Crud.list(store, "tasks")
      {:ok, users} = Crud.list(store, "users")

      assert length(tasks) == 1
      assert length(users) == 1
      assert hd(tasks)["title"] == "Task 1"
      assert hd(users)["name"] == "Alice"
    end

    test "deleting from one collection doesn't affect another", %{store: store} do
      {:ok, task} = Crud.create(store, "tasks", %{"title" => "Task"})
      {:ok, _user} = Crud.create(store, "users", %{"name" => "Bob"})

      :ok = Crud.delete(store, "tasks", task["id"])

      {:ok, tasks} = Crud.list(store, "tasks")
      {:ok, users} = Crud.list(store, "users")

      assert length(tasks) == 0
      assert length(users) == 1
    end
  end

  describe "edge cases" do
    test "create with empty attributes", %{store: store} do
      assert {:ok, record} = Crud.create(store, "empty", %{})
      assert is_binary(record["id"])
    end

    test "update with empty attributes preserves original", %{store: store} do
      {:ok, created} = Crud.create(store, "tasks", %{"title" => "Original"})
      {:ok, updated} = Crud.update(store, "tasks", created["id"], %{})
      assert updated["title"] == "Original"
    end

    test "create with duplicate custom id returns error", %{store: store} do
      {:ok, _} = Crud.create(store, "tasks", %{"id" => "dup-id", "title" => "First"})
      assert {:error, :duplicate_id} = Crud.create(store, "tasks", %{"id" => "dup-id", "title" => "Second"})
    end
  end
end

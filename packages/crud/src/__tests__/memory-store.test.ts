import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../store/memory.js";

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("create and read round-trip", async () => {
    await store.create("tasks", { id: "1", title: "Test" });
    const record = await store.read("tasks", "1");
    expect(record).toEqual({ id: "1", title: "Test" });
  });

  it("read returns null for missing", async () => {
    const record = await store.read("tasks", "missing");
    expect(record).toBeNull();
  });

  it("update replaces record", async () => {
    await store.create("tasks", { id: "1", title: "Old" });
    const updated = await store.update("tasks", "1", { id: "1", title: "New" });
    expect(updated).toBe(true);

    const record = await store.read("tasks", "1");
    expect(record?.title).toBe("New");
  });

  it("update returns false for missing", async () => {
    const result = await store.update("tasks", "missing", { id: "missing", title: "X" });
    expect(result).toBe(false);
  });

  it("delete removes record", async () => {
    await store.create("tasks", { id: "1", title: "Del" });
    const deleted = await store.delete("tasks", "1");
    expect(deleted).toBe(true);

    const record = await store.read("tasks", "1");
    expect(record).toBeNull();
  });

  it("delete returns false for missing", async () => {
    const result = await store.delete("tasks", "missing");
    expect(result).toBe(false);
  });

  it("list returns all records", async () => {
    await store.create("tasks", { id: "1", title: "A" });
    await store.create("tasks", { id: "2", title: "B" });

    const records = await store.list("tasks");
    expect(records.length).toBe(2);
  });

  it("list returns empty for empty collection", async () => {
    const records = await store.list("tasks");
    expect(records).toEqual([]);
  });

  it("collections are isolated", async () => {
    await store.create("tasks", { id: "1", title: "Task" });
    await store.create("users", { id: "1", name: "Alice" });

    const tasks = await store.list("tasks");
    const users = await store.list("users");

    expect(tasks.length).toBe(1);
    expect(users.length).toBe(1);
    expect(tasks[0]!.title).toBe("Task");
    expect(users[0]!.name).toBe("Alice");
  });

  it("returns copies, not references", async () => {
    await store.create("tasks", { id: "1", title: "Original" });
    const record = await store.read("tasks", "1");
    if (record) {
      record.title = "Modified";
    }
    const record2 = await store.read("tasks", "1");
    expect(record2?.title).toBe("Original");
  });

  it("clear removes all data", async () => {
    await store.create("tasks", { id: "1", title: "A" });
    await store.create("users", { id: "2", name: "B" });

    store.clear();

    expect(await store.list("tasks")).toEqual([]);
    expect(await store.list("users")).toEqual([]);
  });
});

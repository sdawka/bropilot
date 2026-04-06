import type { CrudStore, Record } from "../types.js";

/**
 * In-memory store for testing and development.
 * Data is stored in a nested Map: collection → id → record.
 */
export class MemoryStore implements CrudStore {
  private data: Map<string, Map<string, Record>> = new Map();

  private getCollection(collection: string): Map<string, Record> {
    let col = this.data.get(collection);
    if (!col) {
      col = new Map();
      this.data.set(collection, col);
    }
    return col;
  }

  async create(collection: string, record: Record): Promise<void> {
    const col = this.getCollection(collection);
    col.set(record.id, { ...record });
  }

  async read(collection: string, id: string): Promise<Record | null> {
    const col = this.getCollection(collection);
    const record = col.get(id);
    return record ? { ...record } : null;
  }

  async update(collection: string, id: string, record: Record): Promise<boolean> {
    const col = this.getCollection(collection);
    if (!col.has(id)) return false;
    col.set(id, { ...record });
    return true;
  }

  async delete(collection: string, id: string): Promise<boolean> {
    const col = this.getCollection(collection);
    return col.delete(id);
  }

  async list(collection: string): Promise<Record[]> {
    const col = this.getCollection(collection);
    return [...col.values()].map((r) => ({ ...r }));
  }

  /** Clear all data (useful for test cleanup) */
  clear(): void {
    this.data.clear();
  }
}

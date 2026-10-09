type Entry =
  | { kind: "dir"; children: Set<string>; mtimeMs: number }
  | { kind: "file"; data: Uint8Array; mtimeMs: number };

const MAX_ENTRIES = 1_024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

class MemoryStats {
  readonly entry: Entry;
  constructor(entry: Entry) { this.entry = entry; }
  get size() { return this.entry.kind === "file" ? this.entry.data.byteLength : 0; }
  get mtimeMs() { return this.entry.mtimeMs; }
  get ctimeMs() { return this.entry.mtimeMs; }
  get mode() { return this.entry.kind === "file" ? 0o100644 : 0o040000; }
  isFile() { return this.entry.kind === "file"; }
  isDirectory() { return this.entry.kind === "dir"; }
  isSymbolicLink() { return false; }
}

/** Bounded variant of the in-memory filesystem from Cloudflare's official Artifacts example. */
export class MemoryFS {
  readonly encoder = new TextEncoder();
  readonly decoder = new TextDecoder();
  readonly entries = new Map<string, Entry>([["/", { kind: "dir", children: new Set(), mtimeMs: Date.now() }]]);

  readonly promises = {
    readFile: this.readFile.bind(this),
    writeFile: this.writeFile.bind(this),
    unlink: this.unlink.bind(this),
    readdir: this.readdir.bind(this),
    mkdir: this.mkdir.bind(this),
    rmdir: this.rmdir.bind(this),
    stat: this.stat.bind(this),
    lstat: this.lstat.bind(this),
    readlink: this.readlink.bind(this),
    symlink: this.symlink.bind(this),
  };

  normalize(input: string): string {
    const segments: string[] = [];
    for (const part of input.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") segments.pop();
      else segments.push(part);
    }
    return `/${segments.join("/")}` || "/";
  }

  parent(input: string): string {
    const parts = this.normalize(input).split("/").filter(Boolean);
    parts.pop();
    return parts.length ? `/${parts.join("/")}` : "/";
  }

  basename(input: string): string {
    return this.normalize(input).split("/").filter(Boolean).pop() ?? "";
  }

  requireEntry(input: string): Entry {
    const entry = this.entries.get(this.normalize(input));
    if (!entry) throw new Error(`ENOENT: ${input}`);
    return entry;
  }

  requireDir(input: string): Extract<Entry, { kind: "dir" }> {
    const entry = this.requireEntry(input);
    if (entry.kind !== "dir") throw new Error(`ENOTDIR: ${input}`);
    return entry;
  }

  async mkdir(input: string, options?: { recursive?: boolean } | number): Promise<void> {
    const target = this.normalize(input);
    if (target === "/") return;
    const parent = this.parent(target);
    if (!this.entries.has(parent)) {
      if (!(typeof options === "object" && options?.recursive)) throw new Error(`ENOENT: ${parent}`);
      await this.mkdir(parent, { recursive: true });
    }
    if (this.entries.has(target)) return;
    if (this.entries.size >= MAX_ENTRIES) throw new Error("ENOMEM: in-memory Git entry limit exceeded");
    this.entries.set(target, { kind: "dir", children: new Set(), mtimeMs: Date.now() });
    this.requireDir(parent).children.add(this.basename(target));
  }

  async writeFile(input: string, data: string | Uint8Array | ArrayBuffer): Promise<void> {
    const target = this.normalize(input);
    await this.mkdir(this.parent(target), { recursive: true });
    const bytes = typeof data === "string"
      ? this.encoder.encode(data)
      : data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("ENOMEM: in-memory Git file limit exceeded");
    const previous = this.entries.get(target);
    const currentTotal = [...this.entries.values()].reduce(
      (total, entry) => total + (entry.kind === "file" ? entry.data.byteLength : 0),
      0,
    );
    const previousBytes = previous?.kind === "file" ? previous.data.byteLength : 0;
    if (currentTotal - previousBytes + bytes.byteLength > MAX_TOTAL_BYTES) {
      throw new Error("ENOMEM: in-memory Git byte limit exceeded");
    }
    if (!previous && this.entries.size >= MAX_ENTRIES) throw new Error("ENOMEM: in-memory Git entry limit exceeded");
    this.entries.set(target, { kind: "file", data: bytes.slice(), mtimeMs: Date.now() });
    this.requireDir(this.parent(target)).children.add(this.basename(target));
  }

  async readFile(input: string, options?: string | { encoding?: string }): Promise<Uint8Array | string> {
    const entry = this.requireEntry(input);
    if (entry.kind !== "file") throw new Error(`EISDIR: ${input}`);
    const encoding = typeof options === "string" ? options : options?.encoding;
    return encoding ? this.decoder.decode(entry.data) : entry.data.slice();
  }

  async readdir(input: string): Promise<string[]> { return [...this.requireDir(input).children].sort(); }

  async unlink(input: string): Promise<void> {
    const target = this.normalize(input);
    const entry = this.requireEntry(target);
    if (entry.kind !== "file") throw new Error(`EISDIR: ${input}`);
    this.entries.delete(target);
    this.requireDir(this.parent(target)).children.delete(this.basename(target));
  }

  async rmdir(input: string): Promise<void> {
    const target = this.normalize(input);
    const entry = this.requireDir(target);
    if (entry.children.size > 0) throw new Error(`ENOTEMPTY: ${input}`);
    this.entries.delete(target);
    this.requireDir(this.parent(target)).children.delete(this.basename(target));
  }

  async stat(input: string): Promise<MemoryStats> { return new MemoryStats(this.requireEntry(input)); }
  async lstat(input: string): Promise<MemoryStats> { return this.stat(input); }
  async readlink(input: string): Promise<never> { throw new Error(`EINVAL: ${input}`); }
  async symlink(_target: string, input: string): Promise<never> { throw new Error(`EPERM: symlinks are disabled: ${input}`); }
}

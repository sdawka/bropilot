// Thin, mutable indirection between agent/tools.ts (built once at module load, before the bus
// exists) and agent/server.mjs (which owns the actual WebSocket connection). server.mjs replaces
// these two functions once it has connected; tools.ts always calls through this object.
export interface Context {
  [key: string]: unknown;
}

export interface Snapshot {
  graph: { nodes: { id: string; kind: string; title: string }[]; edges: { id: string; src: string; dst: string; type: string }[] };
  kernel: string;
}

export const busRef = {
  /** Publish {kind:'cue', cue, msgId, from:'agent'} and await the matching ack (2s timeout). */
  async publishCue(_cue: unknown): Promise<{ ctx: Context } | null> {
    return null; // replaced by server.mjs once the bus is up
  },
  /** Latest cached `snapshot` message, or null before one has arrived. */
  getSnapshot(): Snapshot | null {
    return null; // replaced by server.mjs
  },
  /** Last context returned from a cue ack, or null. Used by read_open to avoid a round trip. */
  getLastContext(): Context | null {
    return null; // replaced by server.mjs
  },
};

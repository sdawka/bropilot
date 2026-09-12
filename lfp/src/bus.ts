// One message bus between the main screen, the mirror screen(s) and the director (agent).
// Two transports behind one interface: BroadcastChannel (same machine) and a LAN WebSocket relay (phone).

import type { Cue, Context, UserTurn } from './director';

export type BusMessage =
  | { kind: 'cue'; cue: Cue; from: string }
  | { kind: 'context'; ctx: Context; from: string }
  | { kind: 'user'; turn: UserTurn; from: string }
  | { kind: 'hello'; role: 'main' | 'mirror'; from: string };

export interface Transport { send(m: BusMessage): void; onMessage(fn: (m: BusMessage) => void): void; close(): void; readonly label: string }

const CHANNEL = 'bropilot:director';
export const clientId = `${Math.random().toString(36).slice(2, 8)}`;

class BroadcastTransport implements Transport {
  label = 'broadcast';
  private ch = new BroadcastChannel(CHANNEL);
  send(m: BusMessage) { this.ch.postMessage(JSON.parse(JSON.stringify(m))); } // strip Vue proxies: structured clone rejects them
  onMessage(fn: (m: BusMessage) => void) { this.ch.onmessage = (e) => fn(e.data as BusMessage); }
  close() { this.ch.close(); }
}

class RelayTransport implements Transport {
  label: string;
  private ws: WebSocket; private queue: BusMessage[] = []; private handler: ((m: BusMessage) => void) | null = null;
  constructor(host: string) {
    this.label = `relay ${host}`;
    this.ws = new WebSocket(`ws://${host}:5200`);
    this.ws.onopen = () => { for (const m of this.queue) this.ws.send(JSON.stringify(m)); this.queue = []; };
    this.ws.onmessage = (e) => { try { this.handler?.(JSON.parse(String(e.data))); } catch { /* ignore */ } };
  }
  send(m: BusMessage) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); else this.queue.push(m); }
  onMessage(fn: (m: BusMessage) => void) { this.handler = fn; }
  close() { this.ws.close(); }
}

/** Relay host from `?relay=<host>` in the URL (also remembered) or localStorage; empty string = BroadcastChannel. */
export function relayHost(): string {
  try {
    const q = new URLSearchParams(location.search.slice(1) || location.hash.split('?')[1] || '');
    const fromUrl = q.get('relay');
    if (fromUrl) { localStorage.setItem('bropilot:relay', fromUrl); return fromUrl; }
    return localStorage.getItem('bropilot:relay') ?? '';
  } catch { return ''; }
}
export function setRelayHost(host: string) { try { host ? localStorage.setItem('bropilot:relay', host) : localStorage.removeItem('bropilot:relay'); } catch { /* ignore */ } }

let transport: Transport | null = null;
const subscribers = new Set<(m: BusMessage) => void>();

export function bus(): Transport {
  if (transport) return transport;
  const host = relayHost();
  transport = host ? new RelayTransport(host) : new BroadcastTransport();
  transport.onMessage((m) => { if (m.from !== clientId) subscribers.forEach((fn) => fn(m)); });
  return transport;
}
type Outgoing = { [K in BusMessage['kind']]: Omit<Extract<BusMessage, { kind: K }>, 'from'> }[BusMessage['kind']];
export function publish(m: Outgoing) { bus().send({ ...m, from: clientId } as BusMessage); }
export function subscribe(fn: (m: BusMessage) => void) { bus(); subscribers.add(fn); return () => subscribers.delete(fn); }

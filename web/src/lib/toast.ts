import { reactive } from 'vue';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; handler: () => void };
}

const DEFAULT_TTL = 4000;

export const toasts = reactive<Toast[]>([]);

let nextId = 1;

export function dismiss(id: number) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i !== -1) toasts.splice(i, 1);
}

export function toast(message: string, opts: { action?: Toast['action']; ttl?: number } = {}) {
  const t: Toast = { id: nextId++, message, action: opts.action };
  toasts.push(t);
  setTimeout(() => dismiss(t.id), opts.ttl ?? (opts.action ? DEFAULT_TTL : 1600));
}

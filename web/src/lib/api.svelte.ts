import type { Graph, Message, ToolCall, Snapshot, CompletenessScore, AISuggestion, ValidationResult, Change, UndoRedoResult } from './types.js';
import { showError, showRetryableError, friendlyErrorMessage, dismissToast } from './toast.svelte.js';
import { networkState, canPerformNetworkOperation } from './network.svelte.js';

const SESSION_ID = 'default';

// Request timeout duration (30 seconds)
const REQUEST_TIMEOUT = 30000;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

// Track in-flight requests to prevent double submissions
const inFlightRequests = new Set<string>();

/**
 * Check if a request is already in flight
 */
export function isRequestInFlight(key: string): boolean {
  return inFlightRequests.has(key);
}

/**
 * Wrapper for fetch with timeout, retry, and error handling
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Retry a fetch operation with exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);

      // Don't retry client errors (4xx), only server errors (5xx)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry on server errors
      if (response.status >= 500 && attempt < retries) {
        await delay(RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1]);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry aborted requests
      if (lastError.name === 'AbortError') {
        throw lastError;
      }

      // Retry on network errors
      if (attempt < retries) {
        await delay(RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1]);
        continue;
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check network and show appropriate message
 */
function checkNetworkOrFail(): void {
  if (!canPerformNetworkOperation()) {
    throw new Error('You are currently offline. Please reconnect to continue.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct API (bypass agent for simple operations)
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadBootstrapResult {
  success: boolean;
  nodeCount?: number;
  edgeCount?: number;
  graph?: Graph;
  error?: string;
}

/**
 * Load the Bropilot bootstrap graph (self-spec demo).
 * This is a direct API call that bypasses the agent for simplicity.
 */
export async function loadBootstrap(): Promise<LoadBootstrapResult> {
  const requestKey = 'load-bootstrap';

  // Prevent double submission
  if (isRequestInFlight(requestKey)) {
    return { success: false, error: 'Request already in progress' };
  }

  try {
    checkNetworkOrFail();
    inFlightRequests.add(requestKey);

    const res = await fetchWithRetry('/api/load-bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const error = await res.text();
      const friendlyError = friendlyErrorMessage(new Error(error || `HTTP ${res.status}`));
      showError('Failed to load bootstrap', friendlyError);
      return { success: false, error: friendlyError };
    }

    return await res.json() as LoadBootstrapResult;
  } catch (err) {
    const friendlyError = friendlyErrorMessage(err);
    showError('Failed to load bootstrap', friendlyError);
    return {
      success: false,
      error: friendlyError,
    };
  } finally {
    inFlightRequests.delete(requestKey);
  }
}

/**
 * Fetch the current graph state directly (without going through agent).
 */
export async function fetchGraphDirect(): Promise<Graph> {
  try {
    checkNetworkOrFail();

    const res = await fetchWithRetry('/api/graph', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      console.warn(`Failed to fetch graph: HTTP ${res.status}`);
      return { nodes: [], edges: [] };
    }
    return await res.json() as Graph;
  } catch (err) {
    // Don't show error toast for graph fetches - they happen frequently
    console.warn('Failed to fetch graph:', err);
    return { nodes: [], edges: [] };
  }
}

export async function saveSnapshot(name: string): Promise<Snapshot | null> {
  if (!canPerformNetworkOperation()) {
    showError('You are offline', 'Cannot save snapshot while offline');
    return null;
  }

  // Prevent double submission
  const requestKey = `save-snapshot-${name}`;
  if (isRequestInFlight(requestKey)) {
    return null;
  }

  try {
    inFlightRequests.add(requestKey);

    const res = await fetchWithTimeout(`/agents/explorer/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `save_snapshot "${name}"` }),
    });

    if (!res.ok) {
      showError('Failed to save snapshot', friendlyErrorMessage(new Error(`HTTP ${res.status}`)));
      return null;
    }

    const reader = res.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    let buffer = '';
    let snapshot: Snapshot | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const payload = JSON.parse(data);
            const events = Array.isArray(payload) ? payload : [payload];

            for (const event of events) {
              if (event.type === 'tool_call' && event.name === 'save_snapshot' && event.result) {
                try {
                  snapshot = JSON.parse(event.result as string) as Snapshot;
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return snapshot;
  } catch (err) {
    showError('Failed to save snapshot', friendlyErrorMessage(err));
    return null;
  } finally {
    inFlightRequests.delete(requestKey);
  }
}

export async function loadSnapshot(snapshotId: string): Promise<Graph | null> {
  if (!canPerformNetworkOperation()) {
    showError('You are offline', 'Cannot load snapshot while offline');
    return null;
  }

  try {
    const res = await fetchWithTimeout(`/agents/explorer/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `load_snapshot "${snapshotId}"` }),
    });

    if (!res.ok) {
      showError('Failed to load snapshot', friendlyErrorMessage(new Error(`HTTP ${res.status}`)));
      return null;
    }

    const reader = res.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    let buffer = '';
    let graph: Graph | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const payload = JSON.parse(data);
            const events = Array.isArray(payload) ? payload : [payload];

            for (const event of events) {
              if (event.type === 'tool_call' && event.name === 'load_snapshot' && event.result) {
                try {
                  graph = JSON.parse(event.result as string) as Graph;
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return graph;
  } catch (err) {
    showError('Failed to load snapshot', friendlyErrorMessage(err));
    return null;
  }
}

export async function listSnapshots(): Promise<Snapshot[]> {
  if (!canPerformNetworkOperation()) {
    return [];
  }

  try {
    const res = await fetchWithTimeout(`/agents/explorer/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'list_snapshots' }),
    });

    if (!res.ok) {
      console.warn(`Failed to list snapshots: HTTP ${res.status}`);
      return [];
    }

    const reader = res.body?.getReader();
    if (!reader) return [];

    const decoder = new TextDecoder();
    let buffer = '';
    let snapshots: Snapshot[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const payload = JSON.parse(data);
            const events = Array.isArray(payload) ? payload : [payload];

            for (const event of events) {
              if (event.type === 'tool_call' && event.name === 'list_snapshots' && event.result) {
                try {
                  snapshots = JSON.parse(event.result as string) as Snapshot[];
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return snapshots;
  } catch (err) {
    console.warn('Failed to list snapshots:', err);
    return [];
  }
}

export async function exportMarkdown(): Promise<string> {
  if (!canPerformNetworkOperation()) {
    showError('You are offline', 'Cannot export while offline');
    return '';
  }

  try {
    const res = await fetchWithTimeout(`/agents/explorer/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'export_markdown' }),
    });

    if (!res.ok) {
      showError('Failed to export', friendlyErrorMessage(new Error(`HTTP ${res.status}`)));
      return '';
    }

    const reader = res.body?.getReader();
    if (!reader) return '';

    const decoder = new TextDecoder();
    let buffer = '';
    let markdown = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const payload = JSON.parse(data);
            const events = Array.isArray(payload) ? payload : [payload];

            for (const event of events) {
              if (event.type === 'tool_call' && event.name === 'export_markdown' && event.result) {
                try {
                  const result = JSON.parse(event.result as string);
                  markdown = result.markdown || result;
                } catch {
                  markdown = event.result as string;
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return markdown;
  } catch {
    return '';
  }
}

export async function fetchCompleteness(): Promise<CompletenessScore | null> {
  try {
    const res = await fetch(`/agents/explorer/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'get_completeness' }),
    });

    if (!res.ok) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    let buffer = '';
    let completeness: CompletenessScore | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const payload = JSON.parse(data);
            const events = Array.isArray(payload) ? payload : [payload];

            for (const event of events) {
              if (event.type === 'tool_call' && event.name === 'get_completeness' && event.result) {
                try {
                  completeness = JSON.parse(event.result as string) as CompletenessScore;
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return completeness;
  } catch {
    return null;
  }
}

export async function validateGraph(): Promise<ValidationResult | null> {
  try {
    const res = await fetch(`/agents/explorer/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'validate_graph' }),
    });

    if (!res.ok) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    let buffer = '';
    let result: ValidationResult | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const payload = JSON.parse(data);
            const events = Array.isArray(payload) ? payload : [payload];

            for (const event of events) {
              if (event.type === 'tool_call' && event.name === 'validate_graph' && event.result) {
                try {
                  result = JSON.parse(event.result as string) as ValidationResult;
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return result;
  } catch {
    return null;
  }
}

export async function fetchSuggestions(selectedNodeId?: string, recentNodeIds?: string[]): Promise<AISuggestion[]> {
  try {
    // Build the prompt with optional context
    let prompt = 'get_suggestions';
    const args: string[] = [];
    if (selectedNodeId) {
      args.push(`selectedNodeId: "${selectedNodeId}"`);
    }
    if (recentNodeIds && recentNodeIds.length > 0) {
      args.push(`recentNodeIds: [${recentNodeIds.map(id => `"${id}"`).join(', ')}]`);
    }
    if (args.length > 0) {
      prompt = `get_suggestions { ${args.join(', ')} }`;
    }

    const res = await fetch(`/agents/explorer/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) return [];

    const reader = res.body?.getReader();
    if (!reader) return [];

    const decoder = new TextDecoder();
    let buffer = '';
    let suggestions: AISuggestion[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const payload = JSON.parse(data);
            const events = Array.isArray(payload) ? payload : [payload];

            for (const event of events) {
              if (event.type === 'tool_call' && event.name === 'get_suggestions' && event.result) {
                try {
                  suggestions = JSON.parse(event.result as string) as AISuggestion[];
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return suggestions;
  } catch {
    return [];
  }
}

export const streamState = $state({
  isStreaming: false,
  text: '',
  toolCalls: [] as ToolCall[],
});

let abortController: AbortController | null = null;

export function abortStream() {
  abortController?.abort();
  abortController = null;
  streamState.isStreaming = false;
}

export async function sendMessage(
  content: string,
  onGraphUpdate: (graph: Graph) => void,
  onMessage: (msg: Message) => void,
): Promise<void> {
  abortStream();

  // Check network before starting
  if (!canPerformNetworkOperation()) {
    showError('You are offline', 'Please reconnect to send messages');
    return;
  }

  // Prevent double submission
  const requestKey = `send-message-${Date.now()}`;
  if (streamState.isStreaming) {
    showError('Please wait', 'A message is already being processed');
    return;
  }

  streamState.isStreaming = true;
  streamState.text = '';
  streamState.toolCalls = [];

  onMessage({ role: 'user', content });

  abortController = new AbortController();
  const signal = abortController.signal;

  // Set up timeout
  const timeoutId = setTimeout(() => {
    if (abortController) {
      abortController.abort();
      showError('Request timed out', 'The server took too long to respond. Please try again.');
    }
  }, REQUEST_TIMEOUT);

  try {
    const res = await fetch(`/agents/explorer/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: content }),
      signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text();
      const error = new Error(`HTTP ${res.status}: ${text}`);
      const friendlyError = friendlyErrorMessage(error);
      showRetryableError(
        'Failed to send message',
        () => sendMessage(content, onGraphUpdate, onMessage),
        friendlyError
      );
      onMessage({
        role: 'assistant',
        content: `Sorry, I encountered an error: ${friendlyError}`,
      });
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEventType = 'data';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith(':')) continue;

        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim();
          continue;
        }

        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const payload = JSON.parse(data);

            if (currentEventType === 'data' && Array.isArray(payload)) {
              for (const event of payload) {
                handleFlueEvent(event, onGraphUpdate);
              }
            } else if (currentEventType === 'data') {
              handleFlueEvent(payload, onGraphUpdate);
            }
          } catch (e) {
            console.warn('Failed to parse SSE data:', data, e);
          }
        }
      }
    }

    onMessage({
      role: 'assistant',
      content: streamState.text,
      toolCalls: streamState.toolCalls.length > 0 ? [...streamState.toolCalls] : undefined,
    });
  } catch (e) {
    clearTimeout(timeoutId);

    if ((e as Error).name === 'AbortError') {
      // Check if it was a timeout or user-initiated abort
      if (!networkState.isOnline) {
        showError('Connection lost', 'Your message was not sent. Please try again when online.');
      }
      return;
    }

    console.error('Stream error:', e);
    const friendlyError = friendlyErrorMessage(e);
    showRetryableError(
      'Failed to send message',
      () => sendMessage(content, onGraphUpdate, onMessage),
      friendlyError
    );
    onMessage({
      role: 'assistant',
      content: `Sorry, I encountered an error: ${friendlyError}`,
    });
  } finally {
    streamState.isStreaming = false;
    abortController = null;
  }
}

function handleFlueEvent(event: Record<string, unknown>, onGraphUpdate: (graph: Graph) => void) {
  const type = event.type as string;

  if (type === 'text_delta') {
    const text = event.text as string;
    if (text) {
      streamState.text += text;
    }
  }

  if (type === 'tool_start') {
    const toolCall: ToolCall = {
      name: event.name as string,
      input: event.input as Record<string, unknown>,
    };
    streamState.toolCalls.push(toolCall);
  }

  if (type === 'tool_call') {
    const name = event.name as string;
    const result = event.result as string | undefined;

    const lastCall = streamState.toolCalls.find(c => c.name === name && !c.output);
    if (lastCall && result) {
      try {
        lastCall.output = JSON.parse(result);
      } catch {
        lastCall.output = result;
      }

      if (name === 'get_graph' && lastCall.output) {
        onGraphUpdate(lastCall.output as Graph);
      }
      if (['add_node', 'update_node', 'delete_node', 'add_edge', 'delete_edge'].includes(name)) {
        debouncedFetchGraph(onGraphUpdate);
      }
    }
  }
}

let fetchGraphTimeout: ReturnType<typeof setTimeout> | null = null;
let onHistoryUpdateCallback: (() => void) | null = null;

/**
 * Set a callback to be called when graph mutations happen (for undo/redo state refresh)
 */
export function setOnHistoryUpdateCallback(callback: (() => void) | null) {
  onHistoryUpdateCallback = callback;
}

function debouncedFetchGraph(onGraphUpdate: (graph: Graph) => void) {
  if (fetchGraphTimeout) {
    clearTimeout(fetchGraphTimeout);
  }
  fetchGraphTimeout = setTimeout(async () => {
    fetchGraphTimeout = null;
    const graph = await fetchGraph();
    onGraphUpdate(graph);
    // Also notify about history update for undo/redo state
    onHistoryUpdateCallback?.();
  }, 300);
}

export async function fetchGraph(): Promise<Graph> {
  try {
    const res = await fetch(`/agents/explorer/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'get_graph' }),
    });

    if (!res.ok) {
      return { nodes: [], edges: [] };
    }

    const reader = res.body?.getReader();
    if (!reader) return { nodes: [], edges: [] };

    const decoder = new TextDecoder();
    let buffer = '';
    let graph: Graph = { nodes: [], edges: [] };
    let currentEventType = 'data';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith(':')) continue;

        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim();
          continue;
        }

        if (line.startsWith('data: ') && currentEventType === 'data') {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const payload = JSON.parse(data);
            const events = Array.isArray(payload) ? payload : [payload];

            for (const event of events) {
              if (event.type === 'tool_call' && event.name === 'get_graph' && event.result) {
                try {
                  graph = JSON.parse(event.result as string) as Graph;
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return graph;
  } catch {
    return { nodes: [], edges: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Undo/Redo API functions
// ─────────────────────────────────────────────────────────────────────────────

export async function undoChange(): Promise<UndoRedoResult> {
  // Check network
  if (!canPerformNetworkOperation()) {
    showError('You are offline', 'Cannot undo while offline');
    return { success: false, error: 'Offline' };
  }

  try {
    const res = await fetchWithTimeout(`/agents/explorer/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'undo' }),
    });

    if (!res.ok) {
      const friendlyError = friendlyErrorMessage(new Error(`HTTP ${res.status}`));
      showError('Failed to undo', friendlyError);
      return { success: false, error: friendlyError };
    }

    const reader = res.body?.getReader();
    if (!reader) return { success: false, error: 'No response body' };

    const decoder = new TextDecoder();
    let buffer = '';
    let result: UndoRedoResult = { success: false, error: 'No result received' };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const payload = JSON.parse(data);
            const events = Array.isArray(payload) ? payload : [payload];

            for (const event of events) {
              if (event.type === 'tool_call' && event.name === 'undo' && event.result) {
                try {
                  result = JSON.parse(event.result as string) as UndoRedoResult;
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return result;
  } catch (e) {
    const friendlyError = friendlyErrorMessage(e);
    showError('Failed to undo', friendlyError);
    return { success: false, error: friendlyError };
  }
}

export async function redoChange(): Promise<UndoRedoResult> {
  // Check network
  if (!canPerformNetworkOperation()) {
    showError('You are offline', 'Cannot redo while offline');
    return { success: false, error: 'Offline' };
  }

  try {
    const res = await fetchWithTimeout(`/agents/explorer/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'redo' }),
    });

    if (!res.ok) {
      const friendlyError = friendlyErrorMessage(new Error(`HTTP ${res.status}`));
      showError('Failed to redo', friendlyError);
      return { success: false, error: friendlyError };
    }

    const reader = res.body?.getReader();
    if (!reader) return { success: false, error: 'No response body' };

    const decoder = new TextDecoder();
    let buffer = '';
    let result: UndoRedoResult = { success: false, error: 'No result received' };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const payload = JSON.parse(data);
            const events = Array.isArray(payload) ? payload : [payload];

            for (const event of events) {
              if (event.type === 'tool_call' && event.name === 'redo' && event.result) {
                try {
                  result = JSON.parse(event.result as string) as UndoRedoResult;
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return result;
  } catch (e) {
    const friendlyError = friendlyErrorMessage(e);
    showError('Failed to redo', friendlyError);
    return { success: false, error: friendlyError };
  }
}

export async function fetchChangeHistory(limit: number = 50): Promise<Change[]> {
  if (!canPerformNetworkOperation()) {
    return [];
  }

  try {
    const res = await fetchWithTimeout(`/agents/explorer/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `get_change_history { limit: ${limit} }` }),
    });

    if (!res.ok) {
      console.warn(`Failed to fetch change history: HTTP ${res.status}`);
      return [];
    }

    const reader = res.body?.getReader();
    if (!reader) return [];

    const decoder = new TextDecoder();
    let buffer = '';
    let changes: Change[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const payload = JSON.parse(data);
            const events = Array.isArray(payload) ? payload : [payload];

            for (const event of events) {
              if (event.type === 'tool_call' && event.name === 'get_change_history' && event.result) {
                try {
                  changes = JSON.parse(event.result as string) as Change[];
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return changes;
  } catch {
    return [];
  }
}

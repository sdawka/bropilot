<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { sendMessage, streamState, abortStream } from '../lib/api.svelte.js';
  import { appState, addMessage, setGraph, setFocusedPanel } from '../lib/stores.svelte.js';
  import type { Graph, Message } from '../lib/types.js';
  import LoadingSpinner from './LoadingSpinner.svelte';

  interface Props {
    onfocuspanel?: () => void;
  }

  let { onfocuspanel }: Props = $props();

  let input = $state('');
  let messagesEl: HTMLDivElement;
  let textareaEl: HTMLTextAreaElement;
  let streamTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let isStreamStuck = $state(false);

  const STREAM_TIMEOUT_MS = 60000; // 60 seconds

  // Track when we're waiting for first token
  const isWaitingForFirstToken = $derived(
    streamState.isStreaming && !streamState.text && streamState.toolCalls.length === 0
  );

  // Monitor stream for stuck state
  $effect(() => {
    if (streamState.isStreaming) {
      // Clear existing timeout
      if (streamTimeoutId) clearTimeout(streamTimeoutId);

      // Set new timeout
      streamTimeoutId = setTimeout(() => {
        if (streamState.isStreaming) {
          isStreamStuck = true;
        }
      }, STREAM_TIMEOUT_MS);
    } else {
      // Clear timeout when stream ends
      if (streamTimeoutId) {
        clearTimeout(streamTimeoutId);
        streamTimeoutId = null;
      }
      isStreamStuck = false;
    }
  });

  onDestroy(() => {
    abortStream();
    if (streamTimeoutId) clearTimeout(streamTimeoutId);
  });

  // Exported methods for parent to call
  export function blur() {
    textareaEl?.blur();
  }

  export function focus() {
    textareaEl?.focus();
    onfocuspanel?.();
  }

  export function setInput(text: string) {
    input = text;
    textareaEl?.focus();
    onfocuspanel?.();
  }

  async function handleSubmit() {
    if (!input.trim() || streamState.isStreaming) return;
    const content = input.trim();
    input = '';

    await sendMessage(
      content,
      (graph: Graph) => setGraph(graph),
      (msg: Message) => addMessage(msg),
    );

    await tick();
    messagesEl?.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  }

  function handleKeydown(e: KeyboardEvent) {
    const isMod = e.metaKey || e.ctrlKey;

    // Enter or Cmd+Enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Cmd+Enter also sends (alternative)
    if (e.key === 'Enter' && isMod) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Note: Escape handling is done at the App level
  }

  function handleFocus() {
    onfocuspanel?.();
  }
</script>

<div class="chat-pane">
  <div class="messages" bind:this={messagesEl}>
    {#each appState.messages as msg}
      <div class="message {msg.role}">
        <div class="role">{msg.role === 'user' ? 'You' : 'Bropilot'}</div>
        <div class="content">
          {msg.content}
          {#if msg.toolCalls && msg.toolCalls.length > 0}
            <div class="tool-calls">
              {#each msg.toolCalls as call}
                <span class="tool-call" title={JSON.stringify(call.input, null, 2)}>
                  {call.name}
                </span>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/each}

    {#if streamState.isStreaming}
      <div class="message assistant">
        <div class="role">Bropilot</div>
        <div class="content">
          {#if isWaitingForFirstToken}
            <div class="typing-indicator">
              <LoadingSpinner size="xs" inline />
              <span class="typing-text">Thinking...</span>
            </div>
          {:else}
            {streamState.text || '...'}
          {/if}
          {#if streamState.toolCalls.length > 0}
            <div class="tool-calls">
              {#each streamState.toolCalls as call}
                <span class="tool-call">
                  <LoadingSpinner size="xs" inline />
                  {call.name}
                </span>
              {/each}
            </div>
          {/if}
          {#if isStreamStuck}
            <div class="stream-stuck-warning">
              <span class="warning-text">Response is taking longer than expected.</span>
              <button class="cancel-btn" onclick={abortStream}>Cancel</button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <div class="input-area">
    <textarea
      bind:value={input}
      bind:this={textareaEl}
      placeholder="Describe your app idea... (Enter to send)"
      onkeydown={handleKeydown}
      onfocus={handleFocus}
      disabled={streamState.isStreaming}
      rows={3}
    ></textarea>
    <button
      class="primary send-btn"
      onclick={handleSubmit}
      disabled={!input.trim() || streamState.isStreaming}
    >
      {#if streamState.isStreaming}
        <LoadingSpinner size="xs" inline />
      {:else}
        Send
      {/if}
    </button>
  </div>
</div>

<style>
  .chat-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg);
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .message {
    max-width: 85%;
  }

  .message.user {
    align-self: flex-end;
  }

  .message.assistant {
    align-self: flex-start;
  }

  .role {
    font-size: 11px;
    color: var(--text3);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .content {
    padding: 10px 14px;
    border-radius: 12px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .message.user .content {
    background: var(--accent2);
    color: white;
  }

  .message.assistant .content {
    background: var(--bg3);
    color: var(--text);
  }

  .tool-calls {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .tool-call {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--bg4);
    border-radius: 4px;
    color: var(--accent);
    cursor: help;
  }

  .input-area {
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 8px;
    background: var(--bg2);
  }

  .input-area textarea {
    flex: 1;
    min-height: 60px;
  }

  .input-area button {
    align-self: flex-end;
  }

  .send-btn {
    min-width: 70px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .typing-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text2);
  }

  .typing-text {
    font-size: 13px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }

  .stream-stuck-warning {
    margin-top: 12px;
    padding: 10px 12px;
    background: rgba(248, 81, 73, 0.1);
    border: 1px solid rgba(248, 81, 73, 0.3);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .warning-text {
    font-size: 12px;
    color: #f85149;
  }

  .cancel-btn {
    font-size: 11px;
    padding: 4px 10px;
    background: rgba(248, 81, 73, 0.2);
    border: 1px solid rgba(248, 81, 73, 0.4);
    color: #f85149;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .cancel-btn:hover {
    background: rgba(248, 81, 73, 0.3);
    border-color: #f85149;
  }
</style>

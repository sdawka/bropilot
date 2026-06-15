<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    fallback?: Snippet<[{ error: Error; reset: () => void }]>;
  }

  let { children, fallback }: Props = $props();

  let hasError = $state(false);
  let error = $state<Error | null>(null);
  let errorInfo = $state<string>('');

  function handleError(e: ErrorEvent | PromiseRejectionEvent) {
    const err = 'error' in e ? e.error : e.reason;
    if (err instanceof Error) {
      error = err;
      errorInfo = err.stack || '';
      hasError = true;
      console.error('ErrorBoundary caught error:', err);
    }
  }

  function reset() {
    hasError = false;
    error = null;
    errorInfo = '';
  }

  onMount(() => {
    // Listen for uncaught errors
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleError);
    };
  });
</script>

{#if hasError && error}
  {#if fallback}
    {@render fallback({ error, reset })}
  {:else}
    <div class="error-boundary">
      <div class="error-content">
        <div class="error-icon">!</div>
        <h2>Something went wrong</h2>
        <p class="error-message">
          We encountered an unexpected error. This has been logged for investigation.
        </p>
        <div class="error-actions">
          <button class="primary" onclick={reset}>
            Try again
          </button>
          <button onclick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
        <details class="error-details">
          <summary>Technical details</summary>
          <pre>{error.message}</pre>
          {#if errorInfo}
            <pre class="stack">{errorInfo}</pre>
          {/if}
        </details>
      </div>
    </div>
  {/if}
{:else}
  {@render children()}
{/if}

<style>
  .error-boundary {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    padding: 40px;
    background: var(--bg);
  }

  .error-content {
    max-width: 500px;
    text-align: center;
  }

  .error-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    font-weight: bold;
    border-radius: 50%;
    background: rgba(248, 81, 73, 0.1);
    border: 2px solid #f85149;
    color: #f85149;
  }

  h2 {
    font-size: 20px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 12px;
  }

  .error-message {
    font-size: 14px;
    color: var(--text3);
    margin: 0 0 24px;
    line-height: 1.5;
  }

  .error-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-bottom: 24px;
  }

  .error-actions button {
    padding: 8px 16px;
    font-size: 13px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg2);
    color: var(--text);
    cursor: pointer;
  }

  .error-actions button:hover {
    background: var(--bg3);
  }

  .error-actions button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }

  .error-actions button.primary:hover {
    background: var(--accent2);
  }

  .error-details {
    text-align: left;
    font-size: 12px;
    color: var(--text3);
  }

  .error-details summary {
    cursor: pointer;
    padding: 8px 0;
  }

  .error-details summary:hover {
    color: var(--text);
  }

  .error-details pre {
    margin: 8px 0;
    padding: 12px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 11px;
  }

  .error-details .stack {
    max-height: 200px;
    overflow-y: auto;
  }
</style>

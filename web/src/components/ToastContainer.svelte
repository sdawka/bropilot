<script lang="ts">
  import { toastState, dismissToast, type Toast } from '../lib/toast.svelte.js';

  function getIcon(type: Toast['type']): string {
    switch (type) {
      case 'error': return '!';
      case 'warning': return '!';
      case 'success': return '*';
      case 'info': return 'i';
    }
  }

  function handleAction(toast: Toast) {
    if (toast.action) {
      toast.action.onClick();
      dismissToast(toast.id);
    }
  }
</script>

<div class="toast-container" aria-live="polite" aria-label="Notifications">
  {#each toastState.toasts as toast (toast.id)}
    <div class="toast toast-{toast.type}" role="alert">
      <span class="toast-icon">{getIcon(toast.type)}</span>
      <div class="toast-content">
        <span class="toast-message">{toast.message}</span>
        {#if toast.detail}
          <span class="toast-detail">{toast.detail}</span>
        {/if}
      </div>
      {#if toast.action}
        <button
          class="toast-action"
          onclick={() => handleAction(toast)}
        >
          {toast.action.label}
        </button>
      {/if}
      {#if toast.dismissable}
        <button
          class="toast-dismiss"
          onclick={() => dismissToast(toast.id)}
          aria-label="Dismiss"
        >
          x
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 400px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 8px;
    background: var(--bg2);
    border: 1px solid var(--border);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    pointer-events: auto;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .toast-error {
    border-color: #f85149;
    background: rgba(248, 81, 73, 0.1);
  }

  .toast-warning {
    border-color: #d29922;
    background: rgba(210, 153, 34, 0.1);
  }

  .toast-success {
    border-color: #3fb950;
    background: rgba(63, 185, 80, 0.1);
  }

  .toast-info {
    border-color: #58a6ff;
    background: rgba(88, 166, 255, 0.1);
  }

  .toast-icon {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 12px;
    border-radius: 50%;
  }

  .toast-error .toast-icon {
    background: #f85149;
    color: white;
  }

  .toast-warning .toast-icon {
    background: #d29922;
    color: white;
  }

  .toast-success .toast-icon {
    background: #3fb950;
    color: white;
  }

  .toast-info .toast-icon {
    background: #58a6ff;
    color: white;
  }

  .toast-content {
    flex: 1;
    min-width: 0;
  }

  .toast-message {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    line-height: 1.4;
  }

  .toast-detail {
    display: block;
    font-size: 12px;
    color: var(--text3);
    margin-top: 4px;
    line-height: 1.3;
  }

  .toast-action {
    flex-shrink: 0;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 500;
    border: none;
    border-radius: 4px;
    background: var(--accent);
    color: white;
    cursor: pointer;
    transition: background 0.15s;
  }

  .toast-action:hover {
    background: var(--accent2);
  }

  .toast-dismiss {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    padding: 0;
    font-size: 14px;
    line-height: 1;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toast-dismiss:hover {
    background: var(--bg4);
    color: var(--text);
  }
</style>

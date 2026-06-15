<script lang="ts">
  import { setKeyboardHelp } from '../lib/stores.svelte.js';

  function handleClose() {
    setKeyboardHelp(false);
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleClose();
    }
  }

  const shortcuts = [
    {
      section: 'Global',
      items: [
        { keys: ['Cmd+Z'], desc: 'Undo last change' },
        { keys: ['Cmd+Shift+Z'], desc: 'Redo last undone change' },
        { keys: ['/', 'Cmd+K'], desc: 'Focus search input' },
        { keys: ['Escape'], desc: 'Clear selection, close modals, blur inputs' },
        { keys: ['?'], desc: 'Show this help' },
      ]
    },
    {
      section: 'Graph Navigation',
      items: [
        { keys: ['Arrow Up'], desc: 'Select incoming node' },
        { keys: ['Arrow Down'], desc: 'Select outgoing node' },
        { keys: ['Arrow Left/Right'], desc: 'Select sibling node' },
        { keys: ['Enter'], desc: 'Expand/collapse selected node' },
        { keys: ['Space'], desc: 'Open inspector for selected node' },
        { keys: ['f'], desc: 'Fit graph to view' },
        { keys: ['1-4'], desc: 'Toggle space visibility' },
      ]
    },
    {
      section: 'Chat',
      items: [
        { keys: ['Enter'], desc: 'Send message' },
        { keys: ['Cmd+Enter'], desc: 'Send message (alternative)' },
        { keys: ['Escape'], desc: 'Blur input, focus graph' },
      ]
    },
  ];
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class="overlay"
  onclick={handleOverlayClick}
  role="dialog"
  aria-modal="true"
  aria-label="Keyboard shortcuts"
>
  <div class="modal">
    <div class="header">
      <h2>Keyboard Shortcuts</h2>
      <button class="close-btn" onclick={handleClose} aria-label="Close">x</button>
    </div>
    <div class="body">
      {#each shortcuts as group}
        <div class="section">
          <h3>{group.section}</h3>
          <div class="shortcuts">
            {#each group.items as item}
              <div class="shortcut">
                <span class="keys">
                  {#each item.keys as key, i}
                    <kbd>{key}</kbd>
                    {#if i < item.keys.length - 1}
                      <span class="or">or</span>
                    {/if}
                  {/each}
                </span>
                <span class="desc">{item.desc}</span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    <div class="footer">
      <span class="hint">Press <kbd>Escape</kbd> or <kbd>?</kbd> to close</span>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .modal {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: 90%;
    max-width: 480px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }

  .header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }

  .close-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 16px;
    line-height: 1;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text3);
    cursor: pointer;
  }

  .close-btn:hover {
    background: var(--bg3);
    color: var(--text);
  }

  .body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .section {
    margin-bottom: 20px;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  .section h3 {
    margin: 0 0 12px 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .shortcuts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .shortcut {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .keys {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 140px;
  }

  kbd {
    display: inline-block;
    padding: 3px 8px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    color: var(--text);
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  .or {
    font-size: 10px;
    color: var(--text3);
    padding: 0 2px;
  }

  .desc {
    font-size: 13px;
    color: var(--text2);
  }

  .footer {
    padding: 12px 20px;
    border-top: 1px solid var(--border);
    text-align: center;
  }

  .hint {
    font-size: 11px;
    color: var(--text3);
  }

  .hint kbd {
    font-size: 10px;
    padding: 2px 5px;
  }
</style>

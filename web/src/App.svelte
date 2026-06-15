<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import ChatPane from './components/ChatPane.svelte';
  import GraphCanvas from './components/GraphCanvas.svelte';
  import NodeInspector from './components/NodeInspector.svelte';
  import SuggestionsPanel from './components/SuggestionsPanel.svelte';
  import KeyboardHelp from './components/KeyboardHelp.svelte';
  import ToastContainer from './components/ToastContainer.svelte';
  import ErrorBoundary from './components/ErrorBoundary.svelte';
  import GlobalLoadingBar from './components/GlobalLoadingBar.svelte';
  import {
    appState,
    setFocusedPanel,
    toggleKeyboardHelp,
    setKeyboardHelp,
    selectNode,
    setExportModal,
    toggleLegend,
  } from './lib/stores.svelte.js';
  import { initNetworkListeners, networkState } from './lib/network.svelte.js';

  let searchInput: HTMLInputElement | undefined = $state();
  let graphCanvas: { focus: () => void; fitView: () => void; focusSearch: () => void; handleUndo: () => void; handleRedo: () => void } | undefined = $state();
  let chatPane: { blur: () => void; focus: () => void; setInput: (text: string) => void } | undefined = $state();

  // Initialize network listeners on mount
  let cleanupNetwork: (() => void) | undefined;

  onMount(() => {
    cleanupNetwork = initNetworkListeners();
  });

  onDestroy(() => {
    cleanupNetwork?.();
  });

  function handleSuggestionClick(prompt: string) {
    chatPane?.setInput(prompt);
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    const isMod = e.metaKey || e.ctrlKey;

    // Always handle Escape
    if (e.key === 'Escape') {
      // Close keyboard help if open
      if (appState.showKeyboardHelp) {
        setKeyboardHelp(false);
        return;
      }
      // Close export modal if open
      if (appState.showExportModal) {
        setExportModal(false);
        return;
      }
      // Clear selection
      selectNode(null);
      // Blur any focused input and switch to graph
      if (isInputFocused) {
        (target as HTMLElement).blur();
        setFocusedPanel('graph');
        graphCanvas?.focus();
      }
      return;
    }

    // Cmd+K or / to focus search (when not in input)
    if ((e.key === 'k' && isMod) || (e.key === '/' && !isInputFocused)) {
      e.preventDefault();
      graphCanvas?.focusSearch();
      return;
    }

    // ? to toggle keyboard help (when not in input)
    if (e.key === '?' && !isInputFocused) {
      e.preventDefault();
      toggleKeyboardHelp();
      return;
    }

    // Cmd+Z to undo, Cmd+Shift+Z to redo
    if (e.key === 'z' && isMod && !e.shiftKey) {
      e.preventDefault();
      graphCanvas?.handleUndo();
      return;
    }

    if (e.key === 'z' && isMod && e.shiftKey) {
      e.preventDefault();
      graphCanvas?.handleRedo();
      return;
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div id="layout">
  <header>
    <h1>Bropilot</h1>
    <span class="tagline">Think through your app, together</span>
    <button
      class="help-btn"
      onclick={() => toggleKeyboardHelp()}
      title="Keyboard shortcuts (?)"
    >
      ?
    </button>
  </header>

  <main>
    <div class="chat-col">
      <ChatPane bind:this={chatPane} onfocuspanel={() => setFocusedPanel('chat')} />
    </div>
    <div class="graph-col">
      <GraphCanvas bind:this={graphCanvas} onfocuspanel={() => setFocusedPanel('graph')} onSuggestionClick={handleSuggestionClick} />
      <NodeInspector />
      <SuggestionsPanel onSuggestionClick={handleSuggestionClick} />
    </div>
  </main>
</div>

{#if appState.showKeyboardHelp}
  <KeyboardHelp />
{/if}

<!-- Global loading indicator -->
<GlobalLoadingBar />

<!-- Toast notifications -->
<ToastContainer />

<!-- Offline indicator -->
{#if !networkState.isOnline}
  <div class="offline-banner" role="alert">
    <span class="offline-icon">!</span>
    <span>You are offline. Changes will sync when you reconnect.</span>
  </div>
{/if}

<style>
  .offline-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 16px;
    background: #d29922;
    color: #1c1c1c;
    font-size: 13px;
    font-weight: 500;
  }

  .offline-icon {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 12px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.2);
    color: #1c1c1c;
  }

  #layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 12px 20px;
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
  }

  h1 {
    font-size: 18px;
    font-weight: 700;
    color: var(--accent);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .tagline {
    font-size: 13px;
    color: var(--text3);
  }

  .help-btn {
    margin-left: auto;
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 14px;
    font-weight: 600;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: transparent;
    color: var(--text3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .help-btn:hover {
    background: var(--bg3);
    color: var(--text);
    border-color: var(--text3);
  }

  main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .chat-col {
    width: 400px;
    min-width: 320px;
    max-width: 500px;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    resize: horizontal;
    overflow: hidden;
  }

  .graph-col {
    flex: 1;
    position: relative;
    overflow: hidden;
  }
</style>

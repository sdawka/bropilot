<script lang="ts">
  import { appState, selectNode, focusNode } from '../lib/stores.svelte.js';
  import { fetchSuggestions } from '../lib/api.svelte.js';
  import { KIND_TO_SPACE, SPACE_COLORS, type AISuggestion, type NodeKind } from '../lib/types.js';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import SkeletonLoader from './SkeletonLoader.svelte';

  interface Props {
    onSuggestionClick: (text: string) => void;
  }

  let { onSuggestionClick }: Props = $props();

  let suggestions = $state<AISuggestion[]>([]);
  let isLoading = $state(false);
  let isCollapsed = $state(false);
  let lastGraphHash = $state('');

  // Compute a simple hash of the graph to detect changes
  function computeGraphHash(): string {
    const { nodes, edges } = appState.graph;
    return `${nodes.length}-${edges.length}-${nodes.map(n => n.id).join(',')}`;
  }

  // Refresh suggestions when graph changes or node selection changes
  $effect(() => {
    const currentHash = computeGraphHash();
    const selectedId = appState.selectedNodeId;

    // Only refresh if graph actually changed or selection changed
    if (currentHash !== lastGraphHash || selectedId !== undefined) {
      lastGraphHash = currentHash;
      refreshSuggestions();
    }
  });

  async function refreshSuggestions() {
    if (isLoading) return;

    // Don't fetch if graph is empty
    if (appState.graph.nodes.length === 0) {
      suggestions = [];
      return;
    }

    isLoading = true;
    try {
      const result = await fetchSuggestions(
        appState.selectedNodeId ?? undefined,
        undefined // Could track recent nodes if needed
      );
      suggestions = result;
    } catch (e) {
      console.error('Failed to fetch suggestions:', e);
      suggestions = [];
    } finally {
      isLoading = false;
    }
  }

  function handleSuggestionClick(suggestion: AISuggestion) {
    let prompt = suggestion.text;

    // If there's a suggested kind and title, include them in the prompt
    if (suggestion.suggestedKind && suggestion.suggestedTitle) {
      prompt = `Let's add a ${suggestion.suggestedKind} called "${suggestion.suggestedTitle}". ${suggestion.text}`;
    } else if (suggestion.suggestedKind) {
      prompt = `Let's discuss adding a ${suggestion.suggestedKind}. ${suggestion.text}`;
    }

    onSuggestionClick(prompt);
  }

  function handleFocusRelated(suggestion: AISuggestion) {
    if (suggestion.relatedNodeId) {
      focusNode(suggestion.relatedNodeId);
    }
  }

  function getPriorityIcon(priority: 'high' | 'medium' | 'low'): string {
    switch (priority) {
      case 'high': return '!';
      case 'medium': return '*';
      case 'low': return '-';
    }
  }

  function getCategoryIcon(category: AISuggestion['category']): string {
    switch (category) {
      case 'orphan': return 'o';
      case 'missing_connection': return '+';
      case 'missing_error_handling': return '?';
      case 'implicit_concept': return '~';
      case 'unbalanced_space': return '%';
      case 'missing_assumption': return 'A';
    }
  }

  function getKindColor(kind: NodeKind | null): string {
    if (!kind) return 'var(--text3)';
    const space = KIND_TO_SPACE[kind];
    return SPACE_COLORS[space] ?? 'var(--text3)';
  }
</script>

{#if appState.graph.nodes.length > 0}
  <div class="suggestions-panel" class:collapsed={isCollapsed}>
    <button class="panel-header" onclick={() => isCollapsed = !isCollapsed}>
      <span class="header-title">
        <span class="header-icon">{isCollapsed ? '+' : '-'}</span>
        Suggestions
        {#if !isCollapsed && suggestions.length > 0}
          <span class="suggestion-count">{suggestions.length}</span>
        {/if}
      </span>
      {#if isLoading}
        <LoadingSpinner size="xs" inline />
      {/if}
    </button>

    {#if !isCollapsed}
      <div class="panel-content">
        {#if suggestions.length === 0}
          {#if isLoading}
            <div class="loading-state">
              <SkeletonLoader height="80px" variant="rect" />
              <SkeletonLoader height="80px" variant="rect" />
            </div>
          {:else}
            <div class="empty-state">
              <span class="empty-icon">V</span>
              <p class="empty-text">Looking good! No suggestions right now.</p>
            </div>
          {/if}
        {:else}
          <ul class="suggestions-list">
            {#each suggestions as suggestion (suggestion.id)}
              <li class="suggestion-item" class:high={suggestion.priority === 'high'}>
                <div class="suggestion-header">
                  <span
                    class="priority-badge"
                    class:high={suggestion.priority === 'high'}
                    class:medium={suggestion.priority === 'medium'}
                    class:low={suggestion.priority === 'low'}
                    title={suggestion.priority + ' priority'}
                  >
                    {getPriorityIcon(suggestion.priority)}
                  </span>
                  <span class="category-badge" title={suggestion.category.replace('_', ' ')}>
                    {getCategoryIcon(suggestion.category)}
                  </span>
                  {#if suggestion.suggestedKind}
                    <span
                      class="kind-badge"
                      style="--kind-color: {getKindColor(suggestion.suggestedKind)}"
                    >
                      {suggestion.suggestedKind}
                    </span>
                  {/if}
                </div>
                <p class="suggestion-text">{suggestion.text}</p>
                <div class="suggestion-actions">
                  <button
                    class="add-btn"
                    onclick={() => handleSuggestionClick(suggestion)}
                  >
                    Discuss
                  </button>
                  {#if suggestion.relatedNodeId}
                    <button
                      class="focus-btn"
                      onclick={() => handleFocusRelated(suggestion)}
                    >
                      View
                    </button>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {/if}

        <button class="refresh-btn" onclick={refreshSuggestions} disabled={isLoading}>
          {#if isLoading}
            <LoadingSpinner size="xs" inline />
            <span>Refreshing...</span>
          {:else}
            Refresh
          {/if}
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .suggestions-panel {
    position: absolute;
    bottom: 12px;
    right: 12px;
    width: 320px;
    max-height: calc(100% - 24px);
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    z-index: 10;
  }

  .suggestions-panel.collapsed {
    max-height: auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 12px 16px;
    background: var(--bg3);
    border: none;
    border-radius: 0;
    cursor: pointer;
    transition: background 0.15s;
  }

  .panel-header:hover {
    background: var(--bg4);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .header-icon {
    font-family: monospace;
    font-size: 14px;
    color: var(--accent);
    width: 16px;
  }

  .suggestion-count {
    font-size: 10px;
    background: var(--accent2);
    color: var(--accent);
    padding: 2px 6px;
    border-radius: 10px;
  }


  .panel-content {
    padding: 12px;
    max-height: 350px;
    overflow-y: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px 0;
    text-align: center;
  }

  .empty-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 700;
    color: #3fb950;
    background: rgba(63, 185, 80, 0.15);
    border-radius: 50%;
    margin-bottom: 10px;
  }

  .empty-text {
    font-size: 12px;
    color: var(--text3);
    margin: 0;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px 0;
  }

  .suggestions-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .suggestion-item {
    background: var(--bg3);
    border-radius: 8px;
    padding: 10px 12px;
    border-left: 3px solid var(--border);
    transition: border-color 0.15s, background 0.15s;
  }

  .suggestion-item.high {
    border-left-color: #f85149;
  }

  .suggestion-item:hover {
    background: var(--bg4);
  }

  .suggestion-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .priority-badge {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
  }

  .priority-badge.high {
    background: color-mix(in srgb, #f85149 20%, transparent);
    color: #f85149;
  }

  .priority-badge.medium {
    background: color-mix(in srgb, #d29922 20%, transparent);
    color: #d29922;
  }

  .priority-badge.low {
    background: color-mix(in srgb, var(--text3) 20%, transparent);
    color: var(--text3);
  }

  .category-badge {
    font-size: 10px;
    color: var(--text3);
    background: var(--bg);
    padding: 2px 5px;
    border-radius: 3px;
    font-family: monospace;
  }

  .kind-badge {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--kind-color);
    background: color-mix(in srgb, var(--kind-color) 15%, transparent);
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: auto;
  }

  .suggestion-text {
    font-size: 12px;
    color: var(--text2);
    line-height: 1.4;
    margin: 0 0 8px;
  }

  .suggestion-actions {
    display: flex;
    gap: 6px;
  }

  .add-btn,
  .focus-btn {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 4px;
  }

  .add-btn {
    background: var(--accent2);
    border-color: var(--accent);
    color: var(--accent);
  }

  .add-btn:hover {
    background: var(--accent);
    color: var(--bg);
  }

  .focus-btn {
    background: transparent;
    border-color: var(--border);
    color: var(--text3);
  }

  .focus-btn:hover {
    border-color: var(--text3);
    color: var(--text);
  }

  .refresh-btn {
    width: 100%;
    margin-top: 12px;
    padding: 8px;
    font-size: 11px;
    background: transparent;
    border-color: var(--border);
    color: var(--text3);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .refresh-btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }

  .refresh-btn:disabled {
    opacity: 0.7;
    cursor: wait;
  }
</style>

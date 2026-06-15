<script lang="ts">
  import type { NodeKind, Space } from '../lib/types.js';
  import { KIND_TO_SPACE, SPACE_COLORS } from '../lib/types.js';
  import { appState, toggleExpanded, selectNode } from '../lib/stores.svelte.js';

  interface Props {
    data: {
      id: string;
      kind: NodeKind;
      title: string;
      description: string;
      sourceRefs?: { turnId: string; excerpt: string }[];
      isHighlighted?: boolean;
      isDimmed?: boolean;
      hasError?: boolean;
      hasWarning?: boolean;
    };
  }

  let { data }: Props = $props();

  const space = $derived(KIND_TO_SPACE[data.kind]);
  const color = $derived(SPACE_COLORS[space]);
  const isSelected = $derived(appState.selectedNodeId === data.id);
  const isExpanded = $derived(appState.expandedNodeIds.has(data.id));
  const isHighlighted = $derived(data.isHighlighted ?? false);
  const isDimmed = $derived(data.isDimmed ?? false);
  const hasError = $derived(data.hasError ?? false);
  const hasWarning = $derived(data.hasWarning ?? false);

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.key === 'Enter') {
        toggleExpanded(data.id);
      } else {
        selectNode(data.id);
      }
    }
  }
</script>

<div
  class="graph-node"
  class:selected={isSelected}
  class:expanded={isExpanded}
  class:highlighted={isHighlighted}
  class:dimmed={isDimmed}
  class:has-error={hasError}
  class:has-warning={hasWarning}
  style="--node-color: {color}"
  onclick={() => selectNode(data.id)}
  ondblclick={() => toggleExpanded(data.id)}
  onkeydown={handleKeydown}
  role="button"
  tabindex="0"
>
  {#if hasError || hasWarning}
    <div class="validation-indicator" class:error={hasError} class:warning={hasWarning && !hasError}>
      {hasError ? '!' : '~'}
    </div>
  {/if}
  <div class="header">
    <span class="kind">{data.kind}</span>
    <span class="title">{data.title}</span>
  </div>

  {#if isExpanded}
    <div class="body">
      <p class="description">{data.description}</p>
      {#if data.sourceRefs && data.sourceRefs.length > 0}
        <div class="sources">
          <span class="sources-label">Sources:</span>
          {#each data.sourceRefs as ref}
            <span class="source-ref" title={ref.excerpt}>"{ref.excerpt.slice(0, 30)}..."</span>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .graph-node {
    position: relative;
    background: var(--bg2);
    border: 2px solid var(--node-color);
    border-radius: 8px;
    min-width: 180px;
    max-width: 280px;
    cursor: pointer;
    transition: box-shadow 0.15s, transform 0.15s;
  }

  .graph-node:hover {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--node-color) 30%, transparent);
  }

  .graph-node.selected {
    box-shadow: 0 0 0 3px var(--node-color);
  }

  .graph-node.highlighted {
    box-shadow: 0 0 0 3px var(--accent), 0 0 20px color-mix(in srgb, var(--accent) 40%, transparent);
    transform: scale(1.02);
  }

  .graph-node.dimmed {
    opacity: 0.35;
  }

  .graph-node.has-error {
    border-color: #f85149;
    box-shadow: 0 0 0 1px rgba(248, 81, 73, 0.3);
  }

  .graph-node.has-warning {
    border-color: #d29922;
    box-shadow: 0 0 0 1px rgba(210, 153, 34, 0.3);
  }

  .graph-node.has-error.selected {
    box-shadow: 0 0 0 3px #f85149;
  }

  .graph-node.has-warning.selected:not(.has-error) {
    box-shadow: 0 0 0 3px #d29922;
  }

  .validation-indicator {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    z-index: 1;
  }

  .validation-indicator.error {
    background: #f85149;
    color: white;
  }

  .validation-indicator.warning {
    background: #d29922;
    color: white;
  }

  .header {
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .kind {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--node-color);
    font-weight: 600;
  }

  .title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .body {
    padding: 0 12px 10px;
    border-top: 1px solid var(--border);
  }

  .description {
    font-size: 12px;
    color: var(--text2);
    margin-top: 8px;
    line-height: 1.4;
  }

  .sources {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sources-label {
    font-size: 10px;
    color: var(--text3);
    text-transform: uppercase;
  }

  .source-ref {
    font-size: 11px;
    color: var(--accent);
    background: var(--bg3);
    padding: 2px 6px;
    border-radius: 4px;
    cursor: help;
  }
</style>

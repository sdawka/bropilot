<script lang="ts">
  import { appState, getSelectedNode, getReferencingNodes, focusNode, selectNode } from '../lib/stores.svelte.js';
  import { KIND_TO_SPACE, SPACE_COLORS } from '../lib/types.js';

  const node = $derived(getSelectedNode());
  const references = $derived(node ? getReferencingNodes(node.id) : []);
  const incomingRefs = $derived(references.filter(r => r.direction === 'in'));
  const outgoingRefs = $derived(references.filter(r => r.direction === 'out'));
  const space = $derived(node ? KIND_TO_SPACE[node.kind] : 'basics');
  const color = $derived(SPACE_COLORS[space]);

  let expandedSourceIndex = $state<number | null>(null);

  function toggleSourceExpand(index: number) {
    if (expandedSourceIndex === index) {
      expandedSourceIndex = null;
    } else {
      expandedSourceIndex = index;
    }
  }
</script>

{#if node}
  <div class="inspector" style="--node-color: {color}">
    <div class="header">
      <div class="kind-badge">{node.kind}</div>
      <button class="close" onclick={() => selectNode(null)} aria-label="Close inspector">×</button>
    </div>

    <h2 class="title">{node.title}</h2>
    <p class="description">{node.description}</p>

    {#if node.sourceRefs && node.sourceRefs.length > 0}
      <div class="section">
        <h3>Decision Trail</h3>
        <p class="decision-hint">Why was this node created?</p>
        <div class="source-list">
          {#each node.sourceRefs as ref, index}
            <div class="source-item" class:expanded={expandedSourceIndex === index}>
              <button class="source-toggle" onclick={() => toggleSourceExpand(index)}>
                <span class="toggle-icon">{expandedSourceIndex === index ? '-' : '+'}</span>
                <span class="excerpt-preview">
                  {#if expandedSourceIndex === index}
                    "{ref.excerpt}"
                  {:else}
                    "{ref.excerpt.length > 50 ? ref.excerpt.slice(0, 50) + '...' : ref.excerpt}"
                  {/if}
                </span>
              </button>
              {#if expandedSourceIndex === index}
                <div class="source-full">
                  <span class="turn-label">Turn: {ref.turnId}</span>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if incomingRefs.length > 0}
      <div class="section">
        <h3>Referenced By ({incomingRefs.length})</h3>
        <div class="connection-list">
          {#each incomingRefs as ref}
            <button
              class="connection-item"
              style="--conn-color: {SPACE_COLORS[KIND_TO_SPACE[ref.node.kind]]}"
              onclick={() => focusNode(ref.node.id)}
            >
              <span class="conn-kind">{ref.node.kind}</span>
              <span class="conn-title">{ref.node.title}</span>
              <span class="edge-type">{ref.edgeType}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if outgoingRefs.length > 0}
      <div class="section">
        <h3>References ({outgoingRefs.length})</h3>
        <div class="connection-list">
          {#each outgoingRefs as ref}
            <button
              class="connection-item"
              style="--conn-color: {SPACE_COLORS[KIND_TO_SPACE[ref.node.kind]]}"
              onclick={() => focusNode(ref.node.id)}
            >
              <span class="conn-kind">{ref.node.kind}</span>
              <span class="conn-title">{ref.node.title}</span>
              <span class="edge-type">{ref.edgeType}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="meta">
      <span>Created: {node.createdAt ? new Date(node.createdAt).toLocaleString() : 'Unknown'}</span>
      <span>Updated: {node.updatedAt ? new Date(node.updatedAt).toLocaleString() : 'Unknown'}</span>
    </div>
  </div>
{/if}

<style>
  .inspector {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 320px;
    max-height: calc(100% - 24px);
    overflow-y: auto;
    background: var(--bg2);
    border: 1px solid var(--node-color);
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .kind-badge {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--node-color);
    background: color-mix(in srgb, var(--node-color) 15%, transparent);
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: 600;
  }

  .close {
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 18px;
    line-height: 1;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 8px;
  }

  .description {
    font-size: 13px;
    color: var(--text2);
    line-height: 1.5;
    margin: 0 0 16px;
  }

  .section {
    margin-bottom: 16px;
  }

  .section h3 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text3);
    margin: 0 0 8px;
  }

  .decision-hint {
    font-size: 11px;
    color: var(--text3);
    margin-bottom: 8px;
    font-style: italic;
  }

  .source-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .source-item {
    background: var(--bg3);
    border-radius: 6px;
    overflow: hidden;
  }

  .source-item.expanded {
    background: var(--bg4);
  }

  .source-toggle {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: none;
    text-align: left;
  }

  .source-toggle:hover {
    background: var(--bg4);
  }

  .toggle-icon {
    font-size: 14px;
    color: var(--accent);
    font-weight: 600;
    width: 14px;
    flex-shrink: 0;
  }

  .excerpt-preview {
    font-size: 12px;
    color: var(--accent);
    font-style: italic;
    line-height: 1.4;
  }

  .source-full {
    padding: 0 10px 10px 32px;
  }

  .turn-label {
    font-size: 10px;
    color: var(--text3);
  }

  .connection-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .connection-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--bg3);
    border: 1px solid transparent;
    border-left: 3px solid var(--conn-color);
    text-align: left;
    transition: background 0.15s;
  }

  .connection-item:hover {
    background: var(--bg4);
  }

  .conn-kind {
    font-size: 10px;
    color: var(--conn-color);
    text-transform: uppercase;
  }

  .conn-title {
    font-size: 12px;
    color: var(--text);
    flex: 1;
  }

  .edge-type {
    font-size: 9px;
    color: var(--text3);
    background: var(--bg);
    padding: 2px 5px;
    border-radius: 3px;
    text-transform: lowercase;
  }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    font-size: 10px;
    color: var(--text3);
  }
</style>

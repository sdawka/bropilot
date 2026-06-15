<script lang="ts">
  import { appState, toggleValidationPanel, focusNode, setValidationPanel } from '../lib/stores.svelte.js';
  import type { ValidationIssue } from '../lib/types.js';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import SkeletonLoader from './SkeletonLoader.svelte';

  interface Props {
    onSuggestionClick?: (prompt: string) => void;
  }

  let { onSuggestionClick }: Props = $props();

  const validation = $derived(appState.validationResult);
  const isOpen = $derived(appState.showValidationPanel);
  const isLoading = $derived(!validation && appState.graph.nodes.length > 0);

  // Compute status indicator
  const status = $derived.by(() => {
    if (!validation) return { type: 'unknown' as const, label: 'Not validated' };
    if (validation.summary.errorCount > 0) {
      return { type: 'error' as const, label: `${validation.summary.errorCount} error${validation.summary.errorCount > 1 ? 's' : ''}` };
    }
    if (validation.summary.warningCount > 0) {
      return { type: 'warning' as const, label: `${validation.summary.warningCount} item${validation.summary.warningCount > 1 ? 's' : ''} need attention` };
    }
    if (validation.summary.suggestionCount > 0) {
      return { type: 'suggestion' as const, label: `${validation.summary.suggestionCount} suggestion${validation.summary.suggestionCount > 1 ? 's' : ''}` };
    }
    return { type: 'valid' as const, label: 'Looking good' };
  });

  function handleNodeClick(nodeId: string) {
    focusNode(nodeId);
  }

  function handleSuggestionDiscuss(issue: ValidationIssue) {
    const prompt = issue.suggestion
      ? `Help me fix this: ${issue.message}. Suggestion: ${issue.suggestion}`
      : `Help me understand and fix this: ${issue.message}`;
    onSuggestionClick?.(prompt);
  }

  function getStatusIcon(type: string): string {
    switch (type) {
      case 'valid': return 'V';
      case 'error': return '!';
      case 'warning': return '~';
      case 'suggestion': return '?';
      default: return '-';
    }
  }
</script>

<div class="validation-indicator">
  <button
    class="status-btn"
    class:error={status.type === 'error'}
    class:warning={status.type === 'warning'}
    class:suggestion={status.type === 'suggestion'}
    class:valid={status.type === 'valid'}
    class:loading={isLoading}
    onclick={toggleValidationPanel}
    title={isLoading ? 'Validating...' : status.label}
  >
    {#if isLoading}
      <LoadingSpinner size="xs" inline />
    {:else}
      <span class="status-icon">{getStatusIcon(status.type)}</span>
      {#if status.type !== 'valid' && validation}
        <span class="status-count">
          {validation.summary.errorCount + validation.summary.warningCount + validation.summary.suggestionCount}
        </span>
      {/if}
    {/if}
  </button>
</div>

{#if isOpen}
  <div class="validation-panel">
    <div class="panel-header">
      <div class="header-left">
        <span class="header-title">Health Check</span>
        <span class="status-badge" class:error={status.type === 'error'} class:warning={status.type === 'warning'} class:valid={status.type === 'valid'}>
          {status.label}
        </span>
      </div>
      <button class="close-btn" onclick={() => setValidationPanel(false)}>x</button>
    </div>

    {#if isLoading}
      <div class="panel-content">
        <div class="loading-state">
          <LoadingSpinner size="md" label="Validating graph..." />
          <div class="skeleton-issues">
            <SkeletonLoader height="60px" variant="rect" />
            <SkeletonLoader height="60px" variant="rect" />
          </div>
        </div>
      </div>
    {:else if validation}
      <div class="panel-content">
        {#if validation.errors.length > 0}
          <div class="issue-section">
            <h4 class="section-title error">Needs Fixing</h4>
            <div class="issues">
              {#each validation.errors as issue}
                <div class="issue-card error">
                  <p class="issue-message">{issue.message}</p>
                  {#if issue.suggestion}
                    <p class="issue-suggestion">{issue.suggestion}</p>
                  {/if}
                  <div class="issue-actions">
                    {#if issue.nodeIds && issue.nodeIds.length > 0}
                      <div class="affected-nodes">
                        {#each issue.nodeIds.slice(0, 3) as nodeId}
                          <button class="node-link" onclick={() => handleNodeClick(nodeId)}>
                            {appState.graph.nodes.find(n => n.id === nodeId)?.title ?? nodeId.slice(0, 8)}
                          </button>
                        {/each}
                        {#if issue.nodeIds.length > 3}
                          <span class="more-nodes">+{issue.nodeIds.length - 3} more</span>
                        {/if}
                      </div>
                    {/if}
                    <button class="discuss-btn" onclick={() => handleSuggestionDiscuss(issue)}>
                      Discuss
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if validation.warnings.length > 0}
          <div class="issue-section">
            <h4 class="section-title warning">Worth Addressing</h4>
            <div class="issues">
              {#each validation.warnings as issue}
                <div class="issue-card warning">
                  <p class="issue-message">{issue.message}</p>
                  {#if issue.suggestion}
                    <p class="issue-suggestion">{issue.suggestion}</p>
                  {/if}
                  <div class="issue-actions">
                    {#if issue.nodeIds && issue.nodeIds.length > 0}
                      <div class="affected-nodes">
                        {#each issue.nodeIds.slice(0, 3) as nodeId}
                          <button class="node-link" onclick={() => handleNodeClick(nodeId)}>
                            {appState.graph.nodes.find(n => n.id === nodeId)?.title ?? nodeId.slice(0, 8)}
                          </button>
                        {/each}
                        {#if issue.nodeIds.length > 3}
                          <span class="more-nodes">+{issue.nodeIds.length - 3} more</span>
                        {/if}
                      </div>
                    {/if}
                    <button class="discuss-btn" onclick={() => handleSuggestionDiscuss(issue)}>
                      Discuss
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if validation.suggestions.length > 0}
          <div class="issue-section">
            <h4 class="section-title suggestion">Ideas to Consider</h4>
            <div class="issues">
              {#each validation.suggestions as issue}
                <div class="issue-card suggestion">
                  <p class="issue-message">{issue.message}</p>
                  {#if issue.suggestion}
                    <p class="issue-suggestion">{issue.suggestion}</p>
                  {/if}
                  <div class="issue-actions">
                    {#if issue.nodeIds && issue.nodeIds.length > 0}
                      <div class="affected-nodes">
                        {#each issue.nodeIds.slice(0, 3) as nodeId}
                          <button class="node-link" onclick={() => handleNodeClick(nodeId)}>
                            {appState.graph.nodes.find(n => n.id === nodeId)?.title ?? nodeId.slice(0, 8)}
                          </button>
                        {/each}
                      </div>
                    {/if}
                    <button class="discuss-btn" onclick={() => handleSuggestionDiscuss(issue)}>
                      Discuss
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if validation.valid && validation.summary.suggestionCount === 0}
          <div class="all-good">
            <span class="all-good-icon">V</span>
            <p class="all-good-text">Your spec graph looks healthy. No issues found.</p>
          </div>
        {/if}
      </div>
    {:else}
      <div class="panel-content">
        <p class="no-validation">Validation will run automatically as you build your graph.</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .validation-indicator {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 15;
  }

  .status-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .status-btn:hover {
    background: var(--bg3);
  }

  .status-btn.valid {
    border-color: #3fb950;
  }

  .status-btn.valid .status-icon {
    color: #3fb950;
  }

  .status-btn.error {
    border-color: #f85149;
    background: rgba(248, 81, 73, 0.1);
  }

  .status-btn.error .status-icon {
    color: #f85149;
  }

  .status-btn.warning {
    border-color: #d29922;
    background: rgba(210, 153, 34, 0.1);
  }

  .status-btn.warning .status-icon {
    color: #d29922;
  }

  .status-btn.suggestion {
    border-color: #a371f7;
  }

  .status-btn.suggestion .status-icon {
    color: #a371f7;
  }

  .status-btn.loading {
    border-color: var(--accent);
  }

  .status-icon {
    font-size: 12px;
    font-weight: 700;
  }

  .status-count {
    font-size: 11px;
    color: var(--text);
    font-weight: 600;
  }

  .validation-panel {
    position: absolute;
    top: 50px;
    right: 12px;
    width: 320px;
    max-height: 70vh;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 20;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 14px;
    background: var(--bg3);
    border-bottom: 1px solid var(--border);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .status-badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--bg);
    color: var(--text2);
  }

  .status-badge.valid {
    background: rgba(63, 185, 80, 0.15);
    color: #3fb950;
  }

  .status-badge.error {
    background: rgba(248, 81, 73, 0.15);
    color: #f85149;
  }

  .status-badge.warning {
    background: rgba(210, 153, 34, 0.15);
    color: #d29922;
  }

  .close-btn {
    width: 22px;
    height: 22px;
    padding: 0;
    font-size: 14px;
    line-height: 1;
    border-radius: 4px;
    background: transparent;
    border: none;
    color: var(--text3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: var(--bg);
    color: var(--text);
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }

  .issue-section {
    margin-bottom: 16px;
  }

  .issue-section:last-child {
    margin-bottom: 0;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 8px;
  }

  .section-title.error {
    color: #f85149;
  }

  .section-title.warning {
    color: #d29922;
  }

  .section-title.suggestion {
    color: #a371f7;
  }

  .issues {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .issue-card {
    padding: 10px 12px;
    background: var(--bg);
    border-radius: 8px;
    border-left: 3px solid;
  }

  .issue-card.error {
    border-left-color: #f85149;
  }

  .issue-card.warning {
    border-left-color: #d29922;
  }

  .issue-card.suggestion {
    border-left-color: #a371f7;
  }

  .issue-message {
    font-size: 12px;
    color: var(--text);
    margin: 0 0 6px;
    line-height: 1.4;
  }

  .issue-suggestion {
    font-size: 11px;
    color: var(--text2);
    margin: 0 0 8px;
    font-style: italic;
    line-height: 1.4;
  }

  .issue-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .affected-nodes {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    flex: 1;
  }

  .node-link {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--accent);
    cursor: pointer;
    transition: all 0.15s;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .node-link:hover {
    background: var(--accent2);
    border-color: var(--accent);
  }

  .more-nodes {
    font-size: 10px;
    color: var(--text3);
    padding: 2px 4px;
  }

  .discuss-btn {
    font-size: 10px;
    padding: 4px 8px;
    background: transparent;
    border: 1px solid var(--accent);
    border-radius: 4px;
    color: var(--accent);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .discuss-btn:hover {
    background: var(--accent);
    color: var(--bg);
  }

  .all-good {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px;
    text-align: center;
  }

  .all-good-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
    color: #3fb950;
    background: rgba(63, 185, 80, 0.15);
    border-radius: 50%;
    margin-bottom: 12px;
  }

  .all-good-text {
    font-size: 12px;
    color: var(--text2);
    margin: 0;
  }

  .no-validation {
    font-size: 12px;
    color: var(--text3);
    text-align: center;
    padding: 16px;
    margin: 0;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 16px 0;
  }

  .skeleton-issues {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>

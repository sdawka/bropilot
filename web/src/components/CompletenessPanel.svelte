<script lang="ts">
  import { appState, toggleCompletenessPanel } from '../lib/stores.svelte.js';
  import { SPACE_COLORS, type Space } from '../lib/types.js';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import SkeletonLoader from './SkeletonLoader.svelte';

  interface Props {
    onSuggestionClick?: (prompt: string) => void;
  }

  let { onSuggestionClick }: Props = $props();

  const completeness = $derived(appState.completeness);
  const isCollapsed = $derived(!appState.showCompletenessPanel);
  const isLoading = $derived(!completeness && appState.graph.nodes.length > 0);
  const isEmpty = $derived(appState.graph.nodes.length === 0);

  function getScoreColor(score: number): string {
    if (score >= 80) return '#3fb950';
    if (score >= 50) return '#d29922';
    if (score >= 25) return '#f0883e';
    return '#f85149';
  }

  function handleSuggestionClick(prompt: string) {
    onSuggestionClick?.(prompt);
  }
</script>

{#if !isEmpty}
<div class="completeness-panel" class:collapsed={isCollapsed}>
  <button class="panel-header" onclick={toggleCompletenessPanel}>
    <span class="header-title">Completeness</span>
    {#if isLoading}
      <LoadingSpinner size="xs" inline />
    {:else if completeness}
      <span class="header-score" style="color: {getScoreColor(completeness.overall)}">{completeness.overall}%</span>
    {/if}
    <span class="toggle-icon">{isCollapsed ? '+' : '-'}</span>
  </button>

  {#if !isCollapsed && isLoading}
    <div class="panel-content">
      <div class="loading-state">
        <SkeletonLoader variant="circle" width="64px" />
        <div class="skeleton-bars">
          <SkeletonLoader height="4px" />
          <SkeletonLoader height="4px" />
          <SkeletonLoader height="4px" />
          <SkeletonLoader height="4px" />
        </div>
      </div>
    </div>
  {:else if !isCollapsed && completeness}
    <div class="panel-content">
      <!-- Overall progress ring -->
      <div class="overall-score">
        <svg class="progress-ring" viewBox="0 0 36 36">
          <path
            class="ring-bg"
            d="M18 2.0845
              a 15.9155 15.9155 0 0 1 0 31.831
              a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="var(--bg3)"
            stroke-width="3"
          />
          <path
            class="ring-progress"
            d="M18 2.0845
              a 15.9155 15.9155 0 0 1 0 31.831
              a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke={getScoreColor(completeness.overall)}
            stroke-width="3"
            stroke-dasharray="{completeness.overall}, 100"
            stroke-linecap="round"
          />
        </svg>
        <div class="score-text">
          <span class="score-value" style="color: {getScoreColor(completeness.overall)}">{completeness.overall}</span>
          <span class="score-label">%</span>
        </div>
      </div>

      <!-- Space scores -->
      <div class="space-scores">
        {#each completeness.spaces as spaceScore}
          {@const pct = Math.round((spaceScore.score / spaceScore.maxScore) * 100)}
          <div class="space-row">
            <span class="space-name" style="color: {SPACE_COLORS[spaceScore.space as Space]}">{spaceScore.space}</span>
            <div class="space-bar-container">
              <div
                class="space-bar"
                style="width: {pct}%; background: {SPACE_COLORS[spaceScore.space as Space]}"
              ></div>
            </div>
            <span class="space-pct">{pct}%</span>
          </div>
        {/each}
      </div>

      <!-- Missing items -->
      {#if completeness.missing.length > 0}
        <div class="section">
          <h4 class="section-title">Missing</h4>
          <ul class="missing-list">
            {#each completeness.missing.slice(0, 4) as item}
              <li class="missing-item" class:required={item.severity === 'required'}>
                <span class="severity-dot"></span>
                {item.message}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Suggestions -->
      {#if completeness.suggestions.length > 0}
        <div class="section">
          <h4 class="section-title">Next Steps</h4>
          <div class="suggestions">
            {#each completeness.suggestions.slice(0, 3) as suggestion}
              <button
                class="suggestion-btn"
                onclick={() => handleSuggestionClick(suggestion.prompt)}
              >
                <span class="suggestion-kind">{suggestion.kind}</span>
                <span class="suggestion-prompt">{suggestion.prompt}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
{/if}

<style>
  .completeness-panel {
    position: absolute;
    bottom: 12px;
    right: 12px;
    width: 280px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    z-index: 10;
    overflow: hidden;
  }

  .completeness-panel.collapsed {
    width: auto;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .panel-header:hover {
    background: var(--bg3);
  }

  .header-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .header-score {
    font-size: 12px;
    font-weight: 700;
    margin-left: auto;
  }

  .toggle-icon {
    font-size: 14px;
    color: var(--text3);
    width: 16px;
    text-align: center;
  }

  .panel-content {
    padding: 0 12px 12px;
  }

  .overall-score {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    position: relative;
  }

  .progress-ring {
    width: 64px;
    height: 64px;
    transform: rotate(-90deg);
  }

  .ring-progress {
    transition: stroke-dasharray 0.3s ease;
  }

  .score-text {
    position: absolute;
    display: flex;
    align-items: baseline;
    gap: 1px;
  }

  .score-value {
    font-size: 20px;
    font-weight: 700;
  }

  .score-label {
    font-size: 10px;
    color: var(--text3);
  }

  .space-scores {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  .space-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .space-name {
    font-size: 10px;
    font-weight: 600;
    text-transform: capitalize;
    width: 72px;
    flex-shrink: 0;
  }

  .space-bar-container {
    flex: 1;
    height: 4px;
    background: var(--bg3);
    border-radius: 2px;
    overflow: hidden;
  }

  .space-bar {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .space-pct {
    font-size: 10px;
    color: var(--text3);
    width: 28px;
    text-align: right;
  }

  .section {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .section-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text3);
    margin: 0 0 8px;
  }

  .missing-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .missing-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text2);
  }

  .severity-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text3);
    flex-shrink: 0;
  }

  .missing-item.required .severity-dot {
    background: #f85149;
  }

  .suggestions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .suggestion-btn {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    background: var(--bg3);
    border: 1px solid transparent;
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .suggestion-btn:hover {
    background: var(--bg4);
    border-color: var(--accent);
  }

  .suggestion-kind {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--accent);
    letter-spacing: 0.3px;
  }

  .suggestion-prompt {
    font-size: 11px;
    color: var(--text);
    line-height: 1.3;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 12px 0;
  }

  .skeleton-bars {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
</style>

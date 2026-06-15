<script lang="ts">
  import { appState } from '../lib/stores.svelte.js';
  import { streamState } from '../lib/api.svelte.js';

  // Track any global loading operation
  const isLoading = $derived(
    streamState.isStreaming ||
    appState.isUndoing ||
    appState.isRedoing
  );
</script>

{#if isLoading}
  <div class="global-loading-bar" aria-label="Operation in progress">
    <div class="bar"></div>
  </div>
{/if}

<style>
  .global-loading-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--bg3);
    z-index: 9999;
    overflow: hidden;
  }

  .bar {
    height: 100%;
    width: 40%;
    background: linear-gradient(90deg, var(--accent), var(--cyan), var(--accent));
    background-size: 200% 100%;
    animation: loading 1.5s ease-in-out infinite;
  }

  @keyframes loading {
    0% {
      transform: translateX(-100%);
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      transform: translateX(350%);
      background-position: 0% 50%;
    }
  }
</style>

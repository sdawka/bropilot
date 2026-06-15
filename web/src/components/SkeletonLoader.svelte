<script lang="ts">
  interface Props {
    width?: string;
    height?: string;
    variant?: 'text' | 'circle' | 'rect';
    lines?: number;
  }

  let { width = '100%', height = '1em', variant = 'text', lines = 1 }: Props = $props();
</script>

<div class="skeleton-container" aria-busy="true" aria-label="Loading content">
  {#if variant === 'circle'}
    <div class="skeleton circle" style="width: {width}; height: {width};"></div>
  {:else if variant === 'rect'}
    <div class="skeleton rect" style="width: {width}; height: {height};"></div>
  {:else}
    {#each Array(lines) as _, i}
      <div
        class="skeleton text"
        style="width: {i === lines - 1 && lines > 1 ? '70%' : width}; height: {height};"
      ></div>
    {/each}
  {/if}
</div>

<style>
  .skeleton-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton {
    background: linear-gradient(
      90deg,
      var(--bg3) 25%,
      var(--bg4) 50%,
      var(--bg3) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  .skeleton.text {
    border-radius: 4px;
  }

  .skeleton.circle {
    border-radius: 50%;
  }

  .skeleton.rect {
    border-radius: 8px;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
</style>

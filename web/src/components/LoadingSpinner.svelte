<script lang="ts">
  interface Props {
    size?: 'xs' | 'sm' | 'md' | 'lg';
    inline?: boolean;
    label?: string;
  }

  let { size = 'md', inline = false, label }: Props = $props();

  const sizeMap = {
    xs: 12,
    sm: 16,
    md: 24,
    lg: 32,
  };
</script>

<span class="spinner-wrapper" class:inline aria-busy="true" aria-label={label || 'Loading'}>
  <svg
    class="spinner"
    width={sizeMap[size]}
    height={sizeMap[size]}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle
      class="track"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      stroke-width="2.5"
    />
    <circle
      class="indicator"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-dasharray="31.4 31.4"
    />
  </svg>
  {#if label}
    <span class="label">{label}</span>
  {/if}
</span>

<style>
  .spinner-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .spinner-wrapper.inline {
    display: inline-flex;
  }

  .spinner {
    animation: rotate 1s linear infinite;
  }

  .track {
    opacity: 0.2;
  }

  .indicator {
    animation: dash 1.2s ease-in-out infinite;
    transform-origin: center;
  }

  .label {
    font-size: 12px;
    color: var(--text2);
  }

  @keyframes rotate {
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes dash {
    0% {
      stroke-dasharray: 1 62.8;
      stroke-dashoffset: 0;
    }
    50% {
      stroke-dasharray: 31.4 31.4;
      stroke-dashoffset: -15.7;
    }
    100% {
      stroke-dasharray: 1 62.8;
      stroke-dashoffset: -62.8;
    }
  }
</style>

import { expect, it } from 'vitest';
import { createLoadFence } from './load-fence';
it('rejects a stale request completion', () => { const fence = createLoadFence(); const first = fence.next(); const second = fence.next(); expect(fence.current(first)).toBe(false); expect(fence.current(second)).toBe(true); });

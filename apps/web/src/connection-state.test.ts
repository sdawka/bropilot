import { describe, expect, it } from 'vitest';
import { isCloudflareAccountId } from './connection-state';

describe('isCloudflareAccountId', () => {
  it('accepts the single 32-hex account id confirmation value', () => {
    expect(isCloudflareAccountId('a'.repeat(32))).toBe(true);
  });

  it('rejects a short or non-hex account id before the connection request', () => {
    expect(isCloudflareAccountId('a'.repeat(31))).toBe(false);
    expect(isCloudflareAccountId('g'.repeat(32))).toBe(false);
  });
});

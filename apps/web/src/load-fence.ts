export function createLoadFence() {
  let current = 0;
  return { next: () => ++current, current: (token: number) => token === current };
}

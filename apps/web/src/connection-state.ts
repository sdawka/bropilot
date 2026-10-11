export function isCloudflareAccountId(value: string) {
  return /^[a-f0-9]{32}$/i.test(value);
}

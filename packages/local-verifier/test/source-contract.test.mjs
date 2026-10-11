import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSource } from '../src/build.mjs';

test('verifier accepts exactly the shared Rust source contract corpus', async () => {
  const corpus = JSON.parse(await readFile(new URL('../../../tests/fixtures/source-contract.json', import.meta.url), 'utf8'));
  corpus.cases.push(
    { name: '64 files', files: Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`file-${index}.ts`, ''])), valid: true },
    { name: '65 files', files: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`file-${index}.ts`, ''])), valid: false },
    { name: 'path length', files: { ['a'.repeat(257)]: '' }, valid: false },
    { name: 'exact byte limit', files: { 'worker.ts': 'x'.repeat(65536 - 9) }, valid: true },
    { name: 'path bytes count', files: { 'worker.ts': 'x'.repeat(65536) }, valid: false },
  );
  for (const item of corpus.cases) {
    if (item.valid) assert.doesNotThrow(() => validateSource({ files: item.files }), item.name);
    else assert.throws(() => validateSource({ files: item.files }), undefined, item.name);
  }
});

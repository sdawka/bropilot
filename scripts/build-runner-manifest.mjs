import { writeFile } from 'node:fs/promises';
import { getRunnerHash, RUNNER_ID } from '../packages/local-verifier/src/index.mjs';

const hash = await getRunnerHash();
await writeFile(new URL('../apps/worker/src/runner-manifest.ts', import.meta.url),
  `// Generated from the protected local verifier executable; run npm run build:verifier.\nexport const RUNNER_HASH = ${JSON.stringify(hash)};\nexport const RUNNER_REF = ${JSON.stringify(RUNNER_ID)};\n`);
console.log(`Registered ${RUNNER_ID} verifier ${hash.slice(0, 12)}`);

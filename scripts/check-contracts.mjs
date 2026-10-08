import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
const output = mkdtempSync(join(tmpdir(), 'bropilot-contracts-'));
function files(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(root, join(directory, entry.name)) : [relative(root, join(directory, entry.name))]).sort();
}
try {
  execFileSync('cargo', ['run', '--locked', '-p', 'bropilot-contract-gen', '--', output], { stdio: 'inherit' });
  const committed = 'packages/contracts';
  const generatedFiles = files(output);
  const differences = generatedFiles.filter(file => {
    try { return !readFileSync(join(output, file)).equals(readFileSync(join(committed, file))); } catch { return true; }
  });
  differences.push(...files(committed).filter(file => !generatedFiles.includes(file)).map(file => `${file} (unexpected generated file)`));
  if (differences.length) throw new Error(`Generated contract drift: ${differences.join(', ')}`);
  console.log(`Contracts match Rust source (${generatedFiles.length} files).`);
} finally { rmSync(output, { recursive: true, force: true }); }

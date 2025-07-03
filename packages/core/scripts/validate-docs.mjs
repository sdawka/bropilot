import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { DocsManager } from '../dist/src/yamlgen/index.js';

console.log('Running standalone DocsManager validation script...');

let tempDir;
let docsDir;

(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bropilot-docs-test-'));
  docsDir = path.join(tempDir, 'docs');
  await fs.ensureDir(docsDir);

  // Valid application.yaml
  await fs.writeFile(
    path.join(docsDir, 'application.yaml'),
    `
application:
  name: "Test App"
  purpose: "Testing"
  current_phase: 1
  current_version: "1.0.0"
  constraints: []
  success_metrics: []
`,
  );

  // Invalid features.yaml (missing required fields)
  await fs.writeFile(
    path.join(docsDir, 'features.yaml'),
    `
features:
  FeatureA:
    description: "Missing purpose and requirements"
`,
  );

  const manager = new DocsManager(docsDir);
  const results = await manager.validate();

  // Print results
  for (const result of results) {
    console.log(
      `Type: ${result.type}, Valid: ${result.valid}, Missing: ${result.missing}, Errors: ${result.errors ? result.errors.join('; ') : 'None'}`,
    );
  }

  await fs.remove(tempDir);
})();

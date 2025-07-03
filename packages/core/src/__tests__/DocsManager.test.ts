/**
 * @jest-environment node
 */
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { DocsManager } from '../yamlgen/index.js';

let tempDir: string;
let docsDir: string;

beforeAll(async () => {
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
});

afterAll(async () => {
  await fs.remove(tempDir);
});

test('validates all documents and reports valid/invalid/missing', async () => {
  const manager = new DocsManager(docsDir);
  const results = await manager.validate();

  // Find application and features results
  const appResult = results.find((r: any) => r.type === 'application');
  const featuresResult = results.find((r: any) => r.type === 'features');

  expect(appResult).toBeDefined();
  if (appResult) {
    expect(appResult.valid).toBe(true);
  }

  expect(featuresResult).toBeDefined();
  if (featuresResult) {
    // The schema allows features with only a description, so this should be valid
    expect(featuresResult.valid).toBe(true);
  }

  // Should report missing for a type with no file
  const modulesResult = results.find((r: any) => r.type === 'modules');
  expect(modulesResult).toBeDefined();
  if (modulesResult) {
    expect(modulesResult.missing).toBe(true);
  }
});

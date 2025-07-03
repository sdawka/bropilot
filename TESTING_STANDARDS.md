# Testing Standards for Bropilot Monorepo

## Overview

This guide standardizes the approach to writing, running, and maintaining tests in the Bropilot monorepo. It addresses past issues with module system mismatches, especially the confusion between `require` and `import`, and ensures future tests are robust, maintainable, and compatible with the project's ESM/TypeScript setup.

---

## 1. File Naming and Placement

- **All test files must be TypeScript (`.ts`).**
- Place tests in `src/__tests__/` or a similar directory within each package.
- Name test files as `*.test.ts` (e.g., `SyncManager.test.ts`).

---

## 2. Module Syntax

- **Always use ESM syntax:**
  ```ts
  import { something } from '../path/to/module.js';
  ```
- **Never use `require` or `module.exports` in test files.**
- For dynamic imports, use:
  ```ts
  const mod = await import('../path/to/module.js');
  ```
  (Only inside async functions.)

---

## 3. TypeScript and Jest Configuration

- Ensure `tsconfig.json` in each package contains:
  ```json
  {
    "module": "nodenext",
    "moduleResolution": "nodenext"
  }
  ```
- Jest config should use:
  ```js
  preset: 'ts-jest/presets/default-esm',
  useESM: true
  ```
- Jest's `testMatch` should only include `.test.ts` files.

---

## 4. No `.js` or `.mjs` Test Files

- Do not create `.js` or `.mjs` test files.
- Convert any existing `.js`/`.mjs` test files to `.ts` with ESM imports.
- Remove legacy test files that do not conform.

---

## 5. Troubleshooting Common Errors

- **If you see errors about `import.meta` or ESM features:**
  - Ensure the test file is `.ts` and uses ESM imports.
  - Confirm the correct `tsconfig.json` is being used.
  - Check for and remove any legacy `.js`/`.mjs` test files.
- **If Jest cannot find your test:**
  - Make sure the file is named `*.test.ts` and is in a `__tests__` directory.

---

## 6. Linting and CI (Recommended)

- Add a lint rule or CI check to reject `.js`/`.mjs` test files or use of `require` in tests.
- Example ESLint rule (in `.eslintrc.js`):
  ```js
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "CallExpression[callee.name='require']",
        message: "Use ESM import syntax instead of require in tests."
      }
    ]
  }
  ```

---

## 7. Example Test File

```ts
import { SyncManager } from '../sync/SyncManager.js';

describe('SyncManager', () => {
  it('should do something', async () => {
    const sync = new SyncManager();
    // ...test logic...
  });
});
```

---

## 8. Test File & Config Flow

```mermaid
flowchart TD
    A[Developer writes test] --> B{File extension?}
    B -- ".ts" --> C{Uses import/export?}
    C -- Yes --> D[Passes lint/CI]
    C -- No --> E[FAIL: Must use import/export]
    B -- ".js" or ".mjs" --> F[FAIL: Must use .ts]
    D --> G[Jest runs test with ts-jest + nodenext]
    G --> H[Test passes/fails as expected]
```

---

## 9. Summary Checklist

- [ ] All test files are `.ts` and use ESM imports.
- [ ] No `require` or `.js`/`.mjs` test files.
- [ ] TypeScript and Jest configs are set for ESM (`nodenext`).
- [ ] Lint/CI checks are in place (recommended).

---

By following these standards, you will avoid module system confusion and ensure a consistent, maintainable test suite for all contributors.

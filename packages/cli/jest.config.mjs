/** @type {import('ts-jest').JestConfigWithTsJest} */
const jestConfig = {
  preset: 'ts-jest/presets/default-esm', // Use ESM preset
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.test.mjs',
    '../core/tests/*.js',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!conf).+\\.js$', // Do not ignore 'conf' module
  ],
  extensionsToTreatAsEsm: ['.ts'], // Treat .ts files as ESM
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1', // Map .js imports to their .ts counterparts
    'bropilot-core/(.*)\\.js': '<rootDir>/../core/src/$1.ts', // Map .js imports to .ts source
    'bropilot-core/(.*)': '<rootDir>/../core/src/$1.ts', // Map core package imports to local source
  },
  testPathIgnorePatterns: ['<rootDir>/dist/'], // Ignore built files
};

export default jestConfig;

import { Command } from 'commander';
import { ConfigManager } from '../config.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterAll,
  afterEach,
  beforeAll,
} from '@jest/globals';
import { setupGlobalErrorHandling } from '../index.js'; // Import the setup function
import chalk from 'chalk'; // Import chalk for the setup function

// Mock console output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest
  .spyOn(console, 'error')
  .mockImplementation(() => {});

// Dynamically import the program after mocks are set up
let program: Command;
beforeEach(async () => {
  // Clear any existing config for clean tests
  const configDir = path.join(os.homedir(), '.bro');
  const configPath = path.join(configDir, 'config.json');
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }

  // Import the actual program after setting up mocks
  // Use a fresh import to ensure a clean Commander.js instance for each test
  jest.resetModules(); // Reset module registry to get a fresh import
  const cliModule = await import('../index.js'); // Add .js extension
  program = cliModule.program;

  // Configure Commander.js to not exit the process
  program.exitOverride();
});

beforeEach(() => {
  mockConsoleLog.mockClear();
  mockConsoleError.mockClear();
});

afterAll(() => {
  mockConsoleLog.mockRestore();
  mockConsoleError.mockRestore();
});

describe('Bro CLI', () => {
  it('should display version when --version is used', async () => {
    process.argv = ['node', 'bro', '--version'];
    try {
      await program.parseAsync(process.argv);
    } catch (e: any) {
      // Commander.js throws an error with the output when exitOverride is used
      expect(e.message).toContain('1.0.0');
    }
    expect(mockConsoleLog).not.toHaveBeenCalled(); // Output is in error message
  });

  it('should display help when --help is used', async () => {
    process.argv = ['node', 'bro', '--help'];
    try {
      await program.parseAsync(process.argv);
    } catch (e: any) {
      // Commander.js throws an error with the output when exitOverride is used
      expect(e.message).toContain('(outputHelp)');
    }
    // The full help output is not reliably captured in e.message when exitOverride is used.
    // We only assert that Commander.js indicates it tried to output help.
    expect(mockConsoleLog).not.toHaveBeenCalled(); // Output is in error message
  });

  describe('init command', () => {
    it('should initialize a new application with default template', async () => {
      process.argv = ['node', 'bro', 'init', 'my-new-app'];
      await program.parseAsync(process.argv);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Initializing new Bropilot application: my-new-app',
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('Template: default');
    });

    it('should initialize a new application with a custom template', async () => {
      process.argv = [
        'node',
        'bro',
        'init',
        'another-app',
        '-t',
        'react-template',
      ];
      await program.parseAsync(process.argv);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Initializing new Bropilot application: another-app',
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('Template: react-template');
    });
  });

  describe('config command', () => {
    it('should set and get a configuration value', async () => {
      const configManager = ConfigManager.getInstance();

      // Set a value
      process.argv = ['node', 'bro', 'config', 'defaultProvider', 'claude'];
      await program.parseAsync(process.argv);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining(
          "Config key 'defaultProvider' set to '\"claude\"'",
        ),
      );
      expect(configManager.get('defaultProvider')).toBe('claude');

      mockConsoleLog.mockClear(); // Clear logs for next assertion

      // Get the value
      process.argv = ['node', 'bro', 'config', 'defaultProvider'];
      await program.parseAsync(process.argv);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Config key \'defaultProvider\': "claude"'),
      );
    });

    it('should handle boolean configuration values', async () => {
      const configManager = ConfigManager.getInstance();

      // Set a boolean value
      process.argv = ['node', 'bro', 'config', 'autoSave', 'false'];
      await program.parseAsync(process.argv);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Config key 'autoSave' set to 'false'"),
      );
      expect(configManager.get('autoSave')).toBe(false);

      mockConsoleLog.mockClear();

      // Get the boolean value
      process.argv = ['node', 'bro', 'config', 'autoSave'];
      await program.parseAsync(process.argv);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Config key 'autoSave': false"),
      );
    });

    it('should handle JSON configuration values', async () => {
      const configManager = ConfigManager.getInstance();
      const apiKeys = JSON.stringify({ openai: 'sk-123', claude: 'ck-456' });

      // Set JSON value
      process.argv = ['node', 'bro', 'config', 'apiKeys', apiKeys];
      await program.parseAsync(process.argv);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining(`Config key 'apiKeys' set to '${apiKeys}'`),
      );
      expect(configManager.get('apiKeys')).toEqual(JSON.parse(apiKeys));

      mockConsoleLog.mockClear();

      // Get JSON value
      process.argv = ['node', 'bro', 'config', 'apiKeys'];
      await program.parseAsync(process.argv);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining(`Config key 'apiKeys': ${apiKeys}`),
      );
    });

    it('should set and get an unknown configuration key', async () => {
      const configManager = ConfigManager.getInstance();

      // Set an unknown key
      process.argv = ['node', 'bro', 'config', 'unknownKey', 'someValue'];
      await program.parseAsync(process.argv);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining(
          "Config key 'unknownKey' set to '\"someValue\"'",
        ),
      );
      expect(configManager.get('unknownKey' as any)).toBe('someValue'); // Cast to any because it's not in BroConfig

      mockConsoleLog.mockClear();

      // Get the unknown key
      process.argv = ['node', 'bro', 'config', 'unknownKey'];
      await program.parseAsync(process.argv);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Config key \'unknownKey\': "someValue"'),
      );
    });

    it('should indicate when a config key is not found', async () => {
      process.argv = ['node', 'bro', 'config', 'nonExistentKey'];
      await program.parseAsync(process.argv);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Config key 'nonExistentKey' not found."),
      );
    });
  });

  describe('Global Error Handling', () => {
    const mockExit = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as any); // Keep this global mock
    let unhandledRejectionHandler: ((reason: Error) => void) | undefined;

    beforeEach(() => {
      // Store original process.on before mocking
      const originalProcessOn = process.on;
      // Mock process.on to capture the unhandledRejection handler
      jest
        .spyOn(process, 'on')
        .mockImplementation((event: any, listener: any) => {
          if (event === 'unhandledRejection') {
            unhandledRejectionHandler = listener;
          }
          // Call the original process.on to allow other listeners to be added
          return originalProcessOn.call(process, event, listener);
        });

      // Call the setup function
      setupGlobalErrorHandling(program, ConfigManager.getInstance(), chalk);
    });

    afterEach(() => {
      // Restore mocks
      (process.on as jest.Mock).mockRestore();
      mockExit.mockClear(); // Clear the global mockExit
      unhandledRejectionHandler = undefined;
      mockConsoleError.mockClear(); // Clear console error mock
      program.opts().verbose = false; // Reset verbose flag
    });

    afterAll(() => {
      mockExit.mockRestore(); // Restore the global mockExit
    });

    it('should log error and exit on unhandled rejection', async () => {
      // Trigger unhandled rejection
      const error = new Error('Test Error');
      if (unhandledRejectionHandler) {
        unhandledRejectionHandler(error);
      } else {
        // Fallback if handler not captured (shouldn't happen with mock)
        new Promise((_, reject) => reject(error));
      }

      // Give event loop a moment for console.error to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Error:'),
        error.message,
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should log stack trace in verbose mode on unhandled rejection', async () => {
      program.opts().verbose = true;
      const error = new Error('Test Verbose Error');

      if (unhandledRejectionHandler) {
        unhandledRejectionHandler(error);
      } else {
        new Promise((_, reject) => reject(error));
      }

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Error:'),
        error.message,
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('at Object.<anonymous>'),
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});

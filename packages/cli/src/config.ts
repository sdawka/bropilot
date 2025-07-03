import Conf from 'conf';
import * as os from 'os';
import * as path from 'path';

interface BroConfig {
  defaultProvider: 'openai' | 'claude' | 'gemini';
  apiKeys: Record<string, string>;
  defaultTemplate: string;
  autoSave: boolean;
}

class ConfigManager {
  private config: Conf<BroConfig>;
  private static instance: ConfigManager;

  private constructor() {
    const configDir = path.join(os.homedir(), '.bro');
    this.config = new Conf<BroConfig>({
      projectName: 'bro',
      configName: 'config',
      cwd: configDir,
      defaults: {
        defaultProvider: 'openai',
        apiKeys: {},
        defaultTemplate: 'default',
        autoSave: true,
      },
    });
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public get<T extends keyof BroConfig>(key: T): BroConfig[T] {
    return this.config.get(key);
  }

  public set<T extends keyof BroConfig>(key: T, value: BroConfig[T]): void {
    this.config.set(key, value);
  }

  public async load(): Promise<BroConfig> {
    // Conf automatically loads on instantiation, so we just return the current config
    return this.config.store;
  }

  public async save(newConfig: Partial<BroConfig>): Promise<void> {
    for (const key in newConfig) {
      if (Object.prototype.hasOwnProperty.call(newConfig, key)) {
        this.config.set(
          key as keyof BroConfig,
          newConfig[key as keyof BroConfig] as any,
        );
      }
    }
  }
}

export { ConfigManager, type BroConfig };

/**
 * Configuration management for the WebAuto Operations Framework
 * Handles configuration loading, validation, and hot-reloading
 */

import EventEmitter from 'events';
import { watch, FSWatcher } from 'chokidar';
import { Logger } from '../utils/Logger';
import {
  DaemonConfig,
  ConfigUpdate
} from '../types';

export class ConfigManager extends EventEmitter {
  private config: DaemonConfig;
  private logger: Logger;
  private isInitialized: boolean = false;
  private configPath?: string;
  private watcher?: FSWatcher;

  constructor(config: DaemonConfig) {
    super();
    this.config = { ...config };
    this.logger = new Logger(config);
  }

  /**
   * Initialize the configuration manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing configuration manager');

      // Set up file watching if config path is provided
      if (this.config.storagePath) {
        this.configPath = this.getConfigFilePath();
        await this.setupFileWatcher();
      }

      this.isInitialized = true;
      this.logger.info('Configuration manager initialized');

    } catch (error) {
      this.logger.error('Failed to initialize configuration manager', { error });
      throw error;
    }
  }

  /**
   * Shutdown the configuration manager
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down configuration manager');

    // Stop file watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }

    this.logger.info('Configuration manager shutdown completed');
  }

  /**
   * Get current configuration
   */
  getConfig(): DaemonConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<DaemonConfig>): Promise<void> {
    const oldConfig = { ...this.config };
    const newConfig = { ...this.config, ...updates };

    // Validate new configuration
    await this.validateConfig(newConfig);

    // Apply updates
    this.config = newConfig;

    // Save to file if path is available
    if (this.configPath) {
      await this.saveConfigToFile(newConfig);
    }

    // Emit update event
    this.emit('config:updated', {
      oldConfig,
      newConfig,
      timestamp: new Date(),
      source: 'api'
    });

    this.logger.info('Configuration updated', { updates });
  }

  /**
   * Get a specific configuration value
   */
  get<T extends keyof DaemonConfig>(key: T): DaemonConfig[T] {
    return this.config[key];
  }

  /**
   * Set a specific configuration value
   */
  async set<T extends keyof DaemonConfig>(key: T, value: DaemonConfig[T]): Promise<void> {
    await this.updateConfig({ [key]: value });
  }

  /**
   * Validate configuration
   */
  async validateConfig(config: DaemonConfig): Promise<void> {
    const errors: string[] = [];

    // Required fields
    if (!config.name || config.name.trim() === '') {
      errors.push('Name is required');
    }

    if (!config.version || config.version.trim() === '') {
      errors.push('Version is required');
    }

    // Numeric validations
    if (config.maxWorkers < 1) {
      errors.push('maxWorkers must be at least 1');
    }

    if (config.maxWorkers > 100) {
      errors.push('maxWorkers cannot exceed 100');
    }

    if (config.taskTimeout < 1000) {
      errors.push('taskTimeout must be at least 1000ms');
    }

    if (config.healthCheckInterval < 5000) {
      errors.push('healthCheckInterval must be at least 5000ms');
    }

    // Port validation
    if (config.port !== undefined) {
      if (config.port < 1 || config.port > 65535) {
        errors.push('Port must be between 1 and 65535');
      }
    }

    // Storage path validation
    if (!config.storagePath || config.storagePath.trim() === '') {
      errors.push('storagePath is required');
    }

    // Log level validation
    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLogLevels.includes(config.logLevel)) {
      errors.push(`logLevel must be one of: ${validLogLevels.join(', ')}`);
    }

    if (errors.length > 0) {
      const error = new Error(`Configuration validation failed: ${errors.join(', ')}`);
      this.logger.error('Configuration validation failed', { errors });
      throw error;
    }
  }

  /**
   * Load configuration from file
   */
  async loadConfigFromFile(filePath: string): Promise<DaemonConfig> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const absolutePath = path.resolve(filePath);
      const configData = fs.readFileSync(absolutePath, 'utf8');
      const config = JSON.parse(configData) as DaemonConfig;

      await this.validateConfig(config);

      this.logger.info('Configuration loaded from file', { filePath });
      return config;

    } catch (error) {
      this.logger.error('Failed to load configuration from file', { filePath, error });
      throw error;
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfigToFile(config: DaemonConfig): Promise<void> {
    if (!this.configPath) {
      this.logger.warn('No config path set, skipping file save');
      return;
    }

    try {
      const fs = await import('fs');
      const path = await import('path');

      // Ensure directory exists
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save configuration
      const configData = JSON.stringify(config, null, 2);
      fs.writeFileSync(this.configPath, configData);

      this.logger.info('Configuration saved to file', { path: this.configPath });

    } catch (error) {
      this.logger.error('Failed to save configuration to file', {
        path: this.configPath,
        error
      });
      throw error;
    }
  }

  /**
   * Get configuration file path
   */
  private getConfigFilePath(): string {
    const path = require('path');
    return path.join(this.config.storagePath, 'daemon-config.json');
  }

  /**
   * Set up file watcher for configuration changes
   */
  private async setupFileWatcher(): Promise<void> {
    if (!this.configPath) {
      return;
    }

    try {
      this.watcher = watch(this.configPath, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        usePolling: false
      });

      this.watcher.on('change', async () => {
        try {
          this.logger.info('Configuration file changed, reloading');
          await this.reloadConfigFromFile();
        } catch (error) {
          this.logger.error('Failed to reload configuration from file', { error });
        }
      });

      this.watcher.on('error', (error) => {
        this.logger.error('Configuration file watcher error', { error });
      });

      this.logger.debug('Configuration file watcher started', { path: this.configPath });

    } catch (error) {
      this.logger.error('Failed to set up configuration file watcher', {
        path: this.configPath,
        error
      });
      throw error;
    }
  }

  /**
   * Reload configuration from file
   */
  private async reloadConfigFromFile(): Promise<void> {
    if (!this.configPath) {
      return;
    }

    try {
      const newConfig = await this.loadConfigFromFile(this.configPath);
      const oldConfig = { ...this.config };

      // Apply new configuration
      this.config = newConfig;

      // Emit reload event
      this.emit('config:reloaded', {
        oldConfig,
        newConfig,
        timestamp: new Date(),
        source: 'file'
      });

      this.logger.info('Configuration reloaded from file');

    } catch (error) {
      this.logger.error('Failed to reload configuration from file', {
        path: this.configPath,
        error
      });
      throw error;
    }
  }

  /**
   * Apply environment variable overrides
   */
  applyEnvironmentOverrides(): void {
    const envOverrides: Record<string, keyof DaemonConfig> = {
      'WEBAUTO_NAME': 'name',
      'WEBAUTO_VERSION': 'version',
      'WEBAUTO_PORT': 'port',
      'WEBAUTO_HOST': 'host',
      'WEBAUTO_LOG_LEVEL': 'logLevel',
      'WEBAUTO_MAX_WORKERS': 'maxWorkers',
      'WEBAUTO_TASK_TIMEOUT': 'taskTimeout',
      'WEBAUTO_HEALTH_CHECK_INTERVAL': 'healthCheckInterval',
      'WEBAUTO_STORAGE_PATH': 'storagePath',
      'WEBAUTO_ENABLE_METRICS': 'enableMetrics',
      'WEBAUTO_ENABLE_WEBSOCKET': 'enableWebSocket'
    };

    const updates: Partial<DaemonConfig> = {};
    let hasUpdates = false;

    for (const [envVar, configKey] of Object.entries(envOverrides)) {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        try {
          // Type conversion based on config key
          let value: any = envValue;

          if (configKey === 'port' || configKey === 'maxWorkers' ||
              configKey === 'taskTimeout' || configKey === 'healthCheckInterval') {
            value = parseInt(envValue, 10);
          } else if (configKey === 'enableMetrics' || configKey === 'enableWebSocket') {
            value = envValue.toLowerCase() === 'true' || envValue === '1';
          }

          updates[configKey] = value;
          hasUpdates = true;

          this.logger.debug('Environment override applied', {
            envVar,
            configKey,
            value
          });

        } catch (error) {
          this.logger.warn('Failed to apply environment override', {
            envVar,
            configKey,
            value: envValue,
            error
          });
        }
      }
    }

    if (hasUpdates) {
      this.config = { ...this.config, ...updates };
      this.logger.info('Environment overrides applied', { overrides: Object.keys(updates) });
    }
  }

  /**
   * Get configuration schema for validation
   */
  getConfigurationSchema(): any {
    return {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          description: 'Name of the daemon instance'
        },
        version: {
          type: 'string',
          pattern: '^\\d+\\.\\d+\\.\\d+$',
          description: 'Version number in semantic format'
        },
        port: {
          type: 'number',
          minimum: 1,
          maximum: 65535,
          description: 'WebSocket server port'
        },
        host: {
          type: 'string',
          description: 'WebSocket server host'
        },
        logLevel: {
          type: 'string',
          enum: ['debug', 'info', 'warn', 'error'],
          description: 'Logging level'
        },
        maxWorkers: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of worker processes'
        },
        taskTimeout: {
          type: 'number',
          minimum: 1000,
          description: 'Default task timeout in milliseconds'
        },
        healthCheckInterval: {
          type: 'number',
          minimum: 5000,
          description: 'Health check interval in milliseconds'
        },
        storagePath: {
          type: 'string',
          minLength: 1,
          description: 'Path for storing daemon data'
        },
        enableMetrics: {
          type: 'boolean',
          description: 'Enable metrics collection'
        },
        enableWebSocket: {
          type: 'boolean',
          description: 'Enable WebSocket server'
        }
      },
      required: ['name', 'version', 'logLevel', 'maxWorkers', 'taskTimeout', 'healthCheckInterval', 'storagePath'],
      additionalProperties: false
    };
  }

  /**
   * Export configuration to a portable format
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from a portable format
   */
  async importConfig(configData: string): Promise<void> {
    try {
      const config = JSON.parse(configData) as DaemonConfig;
      await this.validateConfig(config);
      await this.updateConfig(config);

      this.logger.info('Configuration imported successfully');

    } catch (error) {
      this.logger.error('Failed to import configuration', { error });
      throw error;
    }
  }
}
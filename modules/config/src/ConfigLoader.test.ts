// ConfigLoader 单元测试

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ConfigLoader } from './ConfigLoader.js';
import type { Config } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('ConfigLoader', () => {
  let loader: ConfigLoader;
  let testConfigPath: string;

  before(() => {
    testConfigPath = path.join(__dirname, 'test-config.json');
    loader = new ConfigLoader({ configPath: testConfigPath });
  });

  after(async () => {
    try {
      await fs.unlink(testConfigPath);
    } catch {
      // 忽略文件不存在的错误
    }
  });

  describe('load()', () => {
    it('应该加载有效的配置文件', async () => {
      const validConfig: Config = {
        browserService: {
          host: '127.0.0.1',
          port: 7704,
          backend: { baseUrl: 'http://127.0.0.1:7701' },
          healthCheck: {
            autoCheck: true,
            strictMode: false,
            skipOnFirstSuccess: true,
            timeout: 30000
          }
        },
        ports: {
          unified_api: 7701,
          browser_service: 7704
        },
        environments: {
          development: {
            NODE_ENV: 'development',
            WEBAUTO_DEBUG: '1',
            WEBAUTO_LOG_LEVEL: 'debug'
          },
          production: {
            NODE_ENV: 'production',
            WEBAUTO_DEBUG: '0',
            WEBAUTO_LOG_LEVEL: 'info'
          }
        },
        ui: {
          window: {
            width: 800,
            height: 600,
            minWidth: 400,
            minHeight: 300
          },
          theme: 'auto'
        }
      };

      await fs.writeFile(testConfigPath, JSON.stringify(validConfig, null, 2), 'utf-8');
      
      const config = await loader.load();
      
      assert.deepStrictEqual(config, validConfig);
    });

    it('应该在配置文件不存在且 createIfMissing 为 false 时抛出错误', async () => {
      const tempPath = path.join(__dirname, 'non-existent-config.json');
      const tempLoader = new ConfigLoader({ configPath: tempPath });

      await assert.rejects(
        tempLoader.load({ createIfMissing: false }),
        /配置文件不存在/
      );
    });

    it('应该在配置文件不存在且 createIfMissing 为 true 时创建默认配置', async () => {
      const tempPath = path.join(__dirname, 'auto-create-config.json');
      const tempLoader = new ConfigLoader({ configPath: tempPath });

      const config = await tempLoader.load({ createIfMissing: true });
      
      assert.ok(config);
      assert.ok(config.browserService);
      assert.ok(config.ports);
      
      // 清理
      await fs.unlink(tempPath).catch(() => {});
    });

    it('应该缓存配置', async () => {
      const config1 = await loader.load();
      const config2 = await loader.load();
      
      assert.strictEqual(config1, config2);
    });

    it('应该拒绝无效的配置', async () => {
      const invalidConfig = {
        browserService: {
          port: 'invalid'
        }
      };

      await fs.writeFile(testConfigPath, JSON.stringify(invalidConfig), 'utf-8');
      
      await assert.rejects(
        loader.reload(),
        /配置验证失败/
      );
    });
  });

  describe('ensureExists()', () => {
    it('应该创建配置文件如果不存在', async () => {
      const tempPath = path.join(__dirname, 'ensure-test-config.json');
      const tempLoader = new ConfigLoader({ configPath: tempPath });

      await tempLoader.ensureExists();
      
      const exists = await fs.access(tempPath).then(() => true).catch(() => false);
      assert.ok(exists);
      
      // 清理
      await fs.unlink(tempPath).catch(() => {});
    });

    it('应该不覆盖已存在的配置文件', async () => {
      const tempPath = path.join(__dirname, 'no-overwrite-config.json');
      const tempLoader = new ConfigLoader({ configPath: tempPath });

      // 创建配置文件
      const testConfig: Config = tempLoader.getDefaultConfig();
      testConfig.ui.theme = 'dark';
      await tempLoader.save(testConfig);
      
      // 调用 ensureExists
      await tempLoader.ensureExists();
      
      // 验证配置未被覆盖
      const config = await tempLoader.load();
      assert.strictEqual(config.ui.theme, 'dark');
      
      // 清理
      await fs.unlink(tempPath).catch(() => {});
    });
  });

  describe('save()', () => {
    it('应该保存有效的配置', async () => {
      const config: Config = loader.getDefaultConfig();
      
      await loader.save(config);
      
      const content = await fs.readFile(testConfigPath, 'utf-8');
      const saved = JSON.parse(content);
      
      assert.deepStrictEqual(saved, config);
    });

    it('应该拒绝无效的配置', async () => {
      const invalidConfig = {
        browserService: {
          port: 'invalid'
        }
      } as unknown as Config;
      
      await assert.rejects(
        loader.save(invalidConfig),
        /配置验证失败/
      );
    });

    it('应该更新缓存', async () => {
      const config1 = await loader.load();
      config1.ui.theme = 'dark';
      
      await loader.save(config1);
      const config2 = loader.get();
      
      assert.strictEqual(config2?.ui.theme, 'dark');
    });
  });

  describe('reload()', () => {
    it('应该重新加载配置', async () => {
      const config1 = await loader.load();
      
      const currentContent = await fs.readFile(testConfigPath, 'utf-8');
      const updatedConfig = JSON.parse(currentContent);
      updatedConfig.ui.theme = 'light';
      await fs.writeFile(testConfigPath, JSON.stringify(updatedConfig, null, 2), 'utf-8');
      
      const config2 = await loader.reload();
      
      assert.strictEqual(config2.ui.theme, 'light');
    });
  });

  describe('get()', () => {
    it('应该返回缓存的配置', async () => {
      await loader.load();
      const cached = loader.get();
      
      assert.ok(cached);
    });

    it('应该在未加载时返回 null', () => {
      const newLoader = new ConfigLoader({ configPath: path.join(__dirname, 'temp.json') });
      const result = newLoader.get();
      
      assert.strictEqual(result, null);
    });
  });

  describe('validate()', () => {
    it('应该验证有效的配置文件', async () => {
      const validConfig = loader.getDefaultConfig();
      await fs.writeFile(testConfigPath, JSON.stringify(validConfig, null, 2), 'utf-8');
      
      const result = await loader.validate();
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors, undefined);
    });

    it('应该检测无效的配置', async () => {
      const invalidConfig = { invalid: 'config' };
      await fs.writeFile(testConfigPath, JSON.stringify(invalidConfig), 'utf-8');
      
      const result = await loader.validate();
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors);
      assert.ok(result.errors!.length > 0);
    });
  });

  describe('getConfigPath()', () => {
    it('应该返回配置文件路径', () => {
      const configPath = loader.getConfigPath();
      
      assert.strictEqual(configPath, testConfigPath);
    });

    it('应该在未指定 configPath 且无 WEBAUTO_CONFIG_PATH 时使用默认路径', () => {
      const originalEnv = process.env.WEBAUTO_CONFIG_PATH;
      delete process.env.WEBAUTO_CONFIG_PATH;

      try {
        const defaultLoader = new ConfigLoader();
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        assert.ok(homeDir, '测试环境应存在 HOME 或 USERPROFILE');
        assert.strictEqual(defaultLoader.getConfigPath(), path.join(homeDir, '.webauto', 'config.json'));
      } finally {
        if (originalEnv === undefined) {
          delete process.env.WEBAUTO_CONFIG_PATH;
        } else {
          process.env.WEBAUTO_CONFIG_PATH = originalEnv;
        }
      }
    });
  });

  describe('getDefaultConfig()', () => {
    it('应该返回默认配置', () => {
      const defaultConfig = loader.getDefaultConfig();
      
      assert.ok(defaultConfig);
      assert.ok(defaultConfig.browserService);
      assert.ok(defaultConfig.ports);
      assert.ok(defaultConfig.environments);
      assert.ok(defaultConfig.ui);
    });
  });

  describe('merge()', () => {
    it('应该合并配置', () => {
      const base = loader.getDefaultConfig();
      const override = {
        ui: {
          theme: 'dark' as const,
          window: {
            width: 1024,
            height: 768,
            minWidth: 400,
            minHeight: 300
          }
        }
      };
      
      const merged = loader.merge(base, override);
      
      assert.strictEqual(merged.ui.theme, 'dark');
      assert.strictEqual(merged.ui.window.width, 1024);
      assert.deepStrictEqual(merged.browserService, base.browserService);
    });

    it('应该深度合并嵌套对象', () => {
      const base = loader.getDefaultConfig();
      const override = {
        browserService: {
          port: 8080,
          backend: {
            baseUrl: 'http://localhost:8080'
          }
        }
      };
      
      const merged = loader.merge(base, override);
      
      assert.strictEqual(merged.browserService.port, 8080);
      assert.strictEqual(merged.browserService.backend.baseUrl, 'http://localhost:8080');
      assert.strictEqual(merged.browserService.host, base.browserService.host);
    });
  });
});

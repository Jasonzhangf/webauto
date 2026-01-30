// 配置模块集成测试

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ConfigLoader } from './ConfigLoader.js';
import { ConfigValidator } from './ConfigValidator.js';

type ConfigApi = typeof import('./index.js');

let api: ConfigApi;
let tempDir = '';
let tempConfigPath = '';
let originalEnvPath: string | undefined;

describe('配置模块集成测试', () => {
  before(async () => {
    // 使用临时目录，避免读写用户真实配置（~/.webauto/config.json）
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-config-test-'));
    tempConfigPath = path.join(tempDir, 'config.json');

    originalEnvPath = process.env.WEBAUTO_CONFIG_PATH;
    process.env.WEBAUTO_CONFIG_PATH = tempConfigPath;

    api = await import('./index.js');
    await api.loader.ensureExists();
  });

  after(async () => {
    if (originalEnvPath === undefined) {
      delete process.env.WEBAUTO_CONFIG_PATH;
    } else {
      process.env.WEBAUTO_CONFIG_PATH = originalEnvPath;
    }
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  describe('完整的配置生命周期', () => {
    it('应该能够加载、修改、保存和重新加载配置', async () => {
      // 1. 加载配置
      const config1 = await api.loadConfig();
      assert.ok(config1);
      assert.ok(config1.ui.theme);

      // 2. 修改配置
      config1.ui.theme = 'dark';
      config1.ui.window.width = 1024;

      // 3. 保存配置
      await api.saveConfig(config1);

      // 4. 重新加载配置
      const config2 = await api.reloadConfig();

      // 5. 验证修改已保存
      assert.strictEqual(config2.ui.theme, 'dark');
      assert.strictEqual(config2.ui.window.width, 1024);

      // 6. 恢复原始值
      config2.ui.theme = 'auto';
      config2.ui.window.width = 800;
      await api.saveConfig(config2);
    });

    it('应该能够使用缓存', async () => {
      const config1 = await api.loadConfig();
      const config2 = api.getConfig();

      assert.strictEqual(config1, config2);
    });

    it('应该在重新加载后更新缓存', async () => {
      const config1 = await api.loadConfig();
      config1.ui.theme = 'light';
      await api.saveConfig(config1);

      const config2 = await api.reloadConfig();
      const cached = api.getConfig();

      assert.strictEqual(config2.ui.theme, 'light');
      assert.strictEqual(cached?.ui.theme, 'light');
      assert.strictEqual(config2, cached);

      // 恢复
      config2.ui.theme = 'auto';
      await api.saveConfig(config2);
    });
  });

  describe('配置验证集成', () => {
    it('应该验证当前配置文件', async () => {
      const result = await api.validateConfig();
      assert.strictEqual(result.valid, true);
    });

    it('应该在保存无效配置时拒绝', async () => {
      const config = await api.loadConfig();
      const originalTheme = config.ui.theme;

      // 尝试保存无效配置
      (config as any).ui.theme = 'invalid';
      
      await assert.rejects(
        api.saveConfig(config as any),
        /配置验证失败/
      );

      // 恢复有效配置
      config.ui.theme = originalTheme;
      await api.saveConfig(config);

      // 验证配置仍然有效
      const result = await api.validateConfig();
      assert.strictEqual(result.valid, true);
    });
  });

  describe('多加载器实例', () => {
    it('应该支持多个独立的加载器实例', async () => {
      const configPath1 = path.join(tempDir, 'test-instance-1.json');
      const configPath2 = path.join(tempDir, 'test-instance-2.json');

      const loader1 = new ConfigLoader({ configPath: configPath1 });
      const loader2 = new ConfigLoader({ configPath: configPath2 });

      const config1 = await loader1.load({ createIfMissing: true });
      const config2 = await loader2.load({ createIfMissing: true });

      config1.ui.theme = 'dark';
      config2.ui.theme = 'light';

      await loader1.save(config1);
      await loader2.save(config2);

      const reloaded1 = await loader1.load();
      const reloaded2 = await loader2.load();

      assert.strictEqual(reloaded1.ui.theme, 'dark');
      assert.strictEqual(reloaded2.ui.theme, 'light');
      assert.notStrictEqual(reloaded1.ui.theme, reloaded2.ui.theme);

      // 清理
      await fs.unlink(configPath1).catch(() => {});
      await fs.unlink(configPath2).catch(() => {});
    });
  });

  describe('默认配置', () => {
    it('应该提供一致的默认配置', () => {
      const default1 = api.getDefaultConfig();
      const default2 = api.getDefaultConfig();

      assert.deepStrictEqual(default1, default2);
      assert.strictEqual(default1.ui.theme, 'auto');
      assert.strictEqual(default1.browserService.port, 7704);
    });

    it('默认配置应该通过验证', () => {
      const defaultConfig = api.getDefaultConfig();
      const validator = new ConfigValidator();
      const result = validator.validate(defaultConfig);

      assert.strictEqual(result.valid, true);
    });
  });

  describe('配置合并', () => {
    it('应该能够合并部分配置', () => {
      const base = api.getDefaultConfig();
      const override = {
        ui: {
          theme: 'dark' as const,
          window: {
            width: 1200,
            height: 800,
            minWidth: 400,
            minHeight: 300
          }
        }
      };

      const merged = api.loader.merge(base, override);

      assert.strictEqual(merged.ui.theme, 'dark');
      assert.strictEqual(merged.ui.window.width, 1200);
      assert.deepStrictEqual(merged.browserService, base.browserService);
      assert.deepStrictEqual(merged.ports, base.ports);
    });
  });

  describe('错误处理', () => {
    it('应该处理配置文件不存在的情况', async () => {
      const tempConfigPath = path.join(tempDir, 'non-existent-config.json');
      const tempLoader = new ConfigLoader({ configPath: tempConfigPath });

      await assert.rejects(
        tempLoader.load(),
        /配置文件不存在/
      );

      // 清理
      await fs.unlink(tempConfigPath).catch(() => {});
    });

    it('应该处理损坏的 JSON 配置文件', async () => {
      const tempConfigPath = path.join(tempDir, 'corrupted-config.json');
      const tempLoader = new ConfigLoader({ configPath: tempConfigPath });

      await fs.writeFile(tempConfigPath, '{ invalid json }', 'utf-8');

      await assert.rejects(
        tempLoader.load()
      );

      // 清理
      await fs.unlink(tempConfigPath).catch(() => {});
    });
  });

  describe('配置文件路径', () => {
    it('应该使用正确的默认配置路径', () => {
      const defaultLoader = new ConfigLoader();
      const configPath = defaultLoader.getConfigPath();

      assert.ok(configPath);
      assert.ok(configPath.endsWith('config.json'));
    });

    it('应该支持自定义配置路径', () => {
      const customPath = path.join(tempDir, 'custom-config.json');
      const customLoader = new ConfigLoader({ configPath: customPath });

      assert.strictEqual(customLoader.getConfigPath(), customPath);
    });

    it('应该支持环境变量覆盖', () => {
      const originalPath = process.env.WEBAUTO_CONFIG_PATH;
      process.env.WEBAUTO_CONFIG_PATH = path.join(tempDir, 'custom', 'path', 'config.json');

      const envLoader = new ConfigLoader();
      const configPath = envLoader.getConfigPath();

      assert.strictEqual(configPath, process.env.WEBAUTO_CONFIG_PATH);

      // 恢复环境变量
      if (originalPath === undefined) {
        delete process.env.WEBAUTO_CONFIG_PATH;
      } else {
        process.env.WEBAUTO_CONFIG_PATH = originalPath;
      }
    });
  });
});

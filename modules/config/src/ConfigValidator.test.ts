// ConfigValidator 单元测试

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigValidator } from './ConfigValidator.js';
import type { Config } from './types.js';

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator();
  });

  describe('validate()', () => {
    it('应该验证有效的配置', () => {
      const validConfig: Config = {
        browserService: {
          host: '0.0.0.0',
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

      const result = validator.validate(validConfig);
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors, undefined);
    });

    it('应该检测缺少必需字段', () => {
      const invalidConfig = {
        browserService: {
          host: '0.0.0.0'
        }
      };

      const result = validator.validate(invalidConfig);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors);
      assert.ok(result.errors!.length > 0);
    });

    it('应该检测无效的端口范围', () => {
      const invalidConfig: Partial<Config> = {
        browserService: {
          host: '0.0.0.0',
          port: 99999,
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

      const result = validator.validate(invalidConfig);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors);
    });

    it('应该检测无效的主题值', () => {
      const invalidConfig: Partial<Config> = {
        browserService: {
          host: '0.0.0.0',
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
          theme: 'invalid' as any
        }
      };

      const result = validator.validate(invalidConfig);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors);
    });

    it('应该检测无效的 NODE_ENV', () => {
      const invalidConfig: Partial<Config> = {
        browserService: {
          host: '0.0.0.0',
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
            NODE_ENV: 'invalid' as any,
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

      const result = validator.validate(invalidConfig);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors);
    });

    it('应该提供详细的错误路径', () => {
      const invalidConfig = {
        browserService: {
          port: 'not-a-number'
        }
      };

      const result = validator.validate(invalidConfig);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors);
      assert.ok(result.errors!.some(e => e.path.includes('browserService') || e.path.includes('port')));
    });

    it('应该在错误字段缺失时使用默认错误信息与路径', () => {
      const fakeValidateFn = ((_: unknown) => false) as any;
      fakeValidateFn.errors = [{ instancePath: '', message: '' }];
      (validator as any).validateFn = fakeValidateFn;

      const result = validator.validate({});
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors?.length);
      assert.strictEqual(result.errors?.[0]?.path, '/root');
      assert.strictEqual(result.errors?.[0]?.message, '未知错误');
    });

    it('应该在 errors 为空时返回空 errors 数组', () => {
      const fakeValidateFn = ((_: unknown) => false) as any;
      fakeValidateFn.errors = undefined;
      (validator as any).validateFn = fakeValidateFn;

      const result = validator.validate({});
      assert.strictEqual(result.valid, false);
      assert.deepStrictEqual(result.errors, []);
    });
  });

  describe('getDefaultConfig()', () => {
    it('应该返回有效的默认配置', () => {
      const defaultConfig = validator.getDefaultConfig();
      
      const result = validator.validate(defaultConfig);
      
      assert.strictEqual(result.valid, true);
    });

    it('应该包含所有必需字段', () => {
      const defaultConfig = validator.getDefaultConfig();
      
      assert.ok(defaultConfig.browserService);
      assert.ok(defaultConfig.ports);
      assert.ok(defaultConfig.environments);
      assert.ok(defaultConfig.ui);
      
      assert.ok(defaultConfig.browserService.host);
      assert.ok(defaultConfig.browserService.port);
      assert.ok(defaultConfig.browserService.backend);
      assert.ok(defaultConfig.browserService.healthCheck);
    });

    it('应该使用合理的默认值', () => {
      const defaultConfig = validator.getDefaultConfig();
      
      assert.strictEqual(defaultConfig.browserService.host, '0.0.0.0');
      assert.strictEqual(defaultConfig.browserService.port, 7704);
      assert.strictEqual(defaultConfig.ports.unified_api, 7701);
      assert.strictEqual(defaultConfig.ports.browser_service, 7704);
      assert.strictEqual(defaultConfig.ui.theme, 'auto');
    });
  });

  describe('validateFile()', () => {
    it('应该在文件不存在时返回 valid=false', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-config-validator-test-'));
      try {
        const missingPath = path.join(tempDir, 'missing.json');
        const result = await validator.validateFile(missingPath);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors?.length);
        assert.strictEqual(result.errors?.[0]?.path, missingPath);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('应该在 JSON 损坏时返回 valid=false', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-config-validator-test-'));
      const badPath = path.join(tempDir, 'bad.json');
      try {
        await fs.writeFile(badPath, '{ invalid json }', 'utf-8');
        const result = await validator.validateFile(badPath);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors?.length);
        assert.strictEqual(result.errors?.[0]?.path, badPath);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('应该在 parse 抛出非 Error 时走 fallback message', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-config-validator-test-'));
      const okPath = path.join(tempDir, 'ok.json');
      const originalParse = JSON.parse;
      try {
        await fs.writeFile(okPath, JSON.stringify({ ok: true }), 'utf-8');
        // 覆盖 JSON.parse，让 validateFile 的 catch 分支拿到非 Error
        (JSON as any).parse = () => {
          throw 'boom';
        };
        const result = await validator.validateFile(okPath);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors?.length);
        assert.strictEqual(result.errors?.[0]?.path, okPath);
        assert.strictEqual(result.errors?.[0]?.message, '读取或解析配置文件失败');
      } finally {
        (JSON as any).parse = originalParse;
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('应该验证有效的配置文件并返回 valid=true', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-config-validator-test-'));
      const cfgPath = path.join(tempDir, 'config.json');
      try {
        const cfg = validator.getDefaultConfig();
        await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
        const result = await validator.validateFile(cfgPath);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.errors, undefined);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  });
});

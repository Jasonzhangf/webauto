/**
 * 运行时导入防护（最佳努力）
 *
 * 目标：禁止在 libs/browser 之外直接 require('camoufox') / require('playwright')。
 * 说明：
 * - 限制 CommonJS require 路径；ESM import 无法在不使用 loader 的情况下全局拦截，
 *   但本项目使用 ESM + 我们在内部通过 createRequire 加载 camoufox，外部如用 require 将被拦截。
 */

import Module from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const FORBIDDEN = new Set(['camoufox', 'playwright']);
const ALLOW_PREFIX = resolve(root); // 允许 libs/browser/* 内部使用

try {
  const origLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (FORBIDDEN.has(request)) {
      const parentFile = parent && parent.filename ? parent.filename : '';
      // 仅允许在 libs/browser 路径内加载底层库
      if (!String(parentFile).startsWith(ALLOW_PREFIX)) {
        const mod = request;
        throw new Error(`Forbidden import: ${mod}. Use libs/browser/browser.js high-level APIs instead.`);
      }
    }
    return origLoad.apply(this, arguments);
  };
} catch {}


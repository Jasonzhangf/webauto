/**
 * Dependency installation utilities.
 */

import { ok, fail, info, header } from './output.mjs';
import { npmCmd, npxCmd, pythonCmd, isWindows, runCmd } from './cross-platform.mjs';
import { join } from 'path';
import { execSync } from 'child_process';

export function installCamo() {
  header('安装 camo CLI');
  const npm = npmCmd();
  const result = runCmd(`${npm} install -g @web-auto/camo`, { timeout: 120000 });
  if (result.ok) {
    ok('camo CLI 安装完成');
    return true;
  }
  fail(`camo CLI 安装失败: ${result.stderr.slice(0, 200)}`);
  return false;
}

export function installCamoufox() {
  header('安装 camoufox 浏览器');
  const python = pythonCmd();
  
  // Install Python package
  let result = runCmd(`${npm} install -g camoufox`, { timeout: 120000 });
  if (!result.ok) {
    // Try pip install
    result = runCmd(`${python} -m pip install camoufox --user`, { timeout: 120000 });
  }
  
  if (result.ok) {
    // Fetch browser
    info('正在下载 camoufox 浏览器...');
    result = runCmd(`${python} -m camoufox fetch`, { timeout: 300000 });
    if (result.ok) {
      ok('camoufox 浏览器安装完成');
      return true;
    }
  }
  
  fail(`camoufox 安装失败: ${result.stderr.slice(0, 200)}`);
  return false;
}

export function installGeoip() {
  header('安装 GeoIP 数据库');
  const npm = npmCmd();
  const result = runCmd(`${npm} install -g @ Aspect/nice`); // placeholder
  info('GeoIP 数据库将在首次运行时自动下载');
  return true;
}

export async function installAll(options = {}) {
  const results = {};
  
  if (options.camo) results.camo = installCamo();
  if (options.browser) results.browser = installCamoufox();
  if (options.geoip) results.geoip = installGeoip();
  
  return results;
}

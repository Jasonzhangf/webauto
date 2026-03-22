/**
 * Environment checking utilities.
 */

import { ok, fail, warn } from './output.mjs';
import { isWindows, runCmd } from './cross-platform.mjs';
import { existsSync } from 'fs';
import { join } from 'path';
import { configDir } from './config.mjs';

export function checkNodeVersion() {
  const version = process.versions?.node;
  const major = parseInt(version?.split('.')[0] || '0', 10);
  if (major >= 18) {
    ok(`Node.js v${version}`);
    return true;
  }
  fail(`Node.js v${version} (需要 >= 18)`);
  return false;
}

export function checkPlatform() {
  const platform = `${process.platform} ${process.arch}`;
  ok(`平台: ${platform}`);
  return true;
}

export function checkCamoCli() {
  const cmd = isWindows ? 'camo.cmd' : 'camo';
  const result = runCmd(`${cmd} --version`);
  if (result.ok && result.stdout) {
    ok(`camo CLI: ${result.stdout.split('\n')[0]}`);
    return true;
  }
  fail('camo CLI 未安装');
  return false;
}

export function checkCamoufox() {
  const python = isWindows ? 'python' : 'python3';
  const result = runCmd(`${python} -m camoufox --version`);
  if (result.ok && result.stdout) {
    ok(`camoufox: ${result.stdout.split('\n')[0]}`);
    return true;
  }
  fail('camoufox 未安装');
  return false;
}

export function checkGeoip() {
  const python = isWindows ? 'python' : 'python3';
  const result = runCmd(`${python} -c "from maxminddb import open_database; print('ok')"`);
  if (result.ok) {
    ok('GeoIP 模块已安装');
    return true;
  }
  fail('GeoIP 模块未安装');
  return false;
}

export function checkUnifiedApi() {
  const result = runCmd('curl -s http://127.0.0.1:7701/health');
  if (result.ok && result.stdout?.includes('"ok":true')) {
    ok('Unified API 服务运行中');
    return true;
  }
  warn('Unified API 服务未运行');
  return false;
}

export function checkCamoRuntime() {
  const result = runCmd('curl -s http://127.0.0.1:7704/health');
  if (result.ok && result.stdout?.includes('"ok":true')) {
    ok('Camo Runtime 服务运行中');
    return true;
  }
  warn('Camo Runtime 服务未运行');
  return false;
}

export function checkProfile(profileId) {
  const id = profileId || 'default';
  const dir = join(configDir(), 'profiles', id);
  if (existsSync(dir) && existsSync(join(dir, 'profile.json'))) {
    ok(`Profile "${id}" 存在`);
    return true;
  }
  fail(`Profile "${id}" 不存在`);
  return false;
}

export async function checkAll(options = {}) {
  const results = {};
  
  results.node = checkNodeVersion();
  results.platform = checkPlatform();
  
  if (options.checkCamo !== false) results.camo = checkCamoCli();
  if (options.checkBrowser !== false) results.browser = checkCamoufox();
  if (options.checkGeoip !== false) results.geoip = checkGeoip();
  if (options.checkServices !== false) {
    results.unifiedApi = checkUnifiedApi();
    results.camoRuntime = checkCamoRuntime();
  }
  if (options.profile) results.profile = checkProfile(options.profile);
  
  return results;
}

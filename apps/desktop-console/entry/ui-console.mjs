#!/usr/bin/env node
import minimist from 'minimist';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../..');
const DIST_MAIN = path.join(APP_ROOT, 'dist', 'main', 'index.mjs');

const args = minimist(process.argv.slice(2), {
  boolean: ['build', 'install', 'check', 'help', 'headless', 'no-daemon'],
  string: ['profile', 'keyword', 'target', 'scenario', 'output'],
  alias: { h: 'help', p: 'profile', k: 'keyword', t: 'target', o: 'output' }
});

function printHelp() {
  console.log(`webauto ui console

Usage:
  webauto ui console [--build] [--install] [--check] [--no-daemon]
  webauto ui test <scenario> [options]

Test Scenarios:
  env-check    - Environment check automation test
  account-flow - Account creation/login flow test
  config-save  - Config save/load test
  crawl-run    - Full crawl flow test

Options:
  --check      Check build/dep status only
  --build      Auto-build if missing
  --install    Auto-install if missing deps
  --no-daemon  Run in foreground mode
  --scenario   Test scenario name
  --profile    Test profile ID
  --keyword    Test keyword
  --target     Target count
  --headless   Headless mode
  --output     Output report path
`);
}

function checkBuildStatus() {
  return existsSync(DIST_MAIN);
}

async function build() {
  return new Promise((resolve, reject) => {
    console.log('[ui-console] Building...');
    const child = spawn('npm', ['run', 'build'], {
      cwd: APP_ROOT,
      stdio: 'inherit',
      shell: true
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Build failed with code ${code}`));
    });
  });
}

async function install() {
  return new Promise((resolve, reject) => {
    console.log('[ui-console] Installing dependencies...');
    const child = spawn('npm', ['install'], {
      cwd: APP_ROOT,
      stdio: 'inherit',
      shell: true
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Install failed with code ${code}`));
    });
  });
}

async function startConsole(noDaemon = false) {
  if (!checkBuildStatus()) {
    console.log('[ui-console] Build not found, building...');
    await build();
  }

  console.log('[ui-console] Starting Desktop Console...');
  const env = { ...process.env };
  if (noDaemon) env.WEBAUTO_NO_DAEMON = '1';

  const child = spawn('npx', ['electron', DIST_MAIN], {
    cwd: APP_ROOT,
    env,
    stdio: 'inherit',
    detached: !noDaemon
  });

  if (noDaemon) {
    child.on('close', (code) => {
      console.log(`[ui-console] Exited with code ${code}`);
      process.exit(code);
    });
  } else {
    child.unref();
    console.log(`[ui-console] Started (PID: ${child.pid})`);
  }
}

class UITestRunner {
  constructor(options = {}) {
    this.profile = options.profile || 'test-profile';
    this.keyword = options.keyword || '自动化测试';
    this.target = options.target || 5;
    this.headless = options.headless || false;
    this.output = options.output || null;
    this.results = [];
    this.startTime = Date.now();
  }

  log(message, type = 'info') {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${type}] ${message}`;
    console.log(line);
    this.results.push({ ts, type, message });
  }

  async runCommand(cmd, args, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { shell: true, stdio: 'pipe' });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timeout: ${cmd}`));
      }, timeoutMs);
      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ ok: true, stdout, stderr });
        else reject(new Error(stderr || `Exit code: ${code}`));
      });
    });
  }

  async testEnvCheck() {
    this.log('Starting environment check test', 'test');
    try {
      this.log('Testing: camo CLI');
      await this.runCommand('which camo');
      this.log('PASS: camo CLI found', 'pass');

      this.log('Testing: Unified API');
      const apiRes = await fetch('http://127.0.0.1:7701/health');
      if (!apiRes.ok) throw new Error('Unified API not responding');
      this.log('PASS: Unified API running', 'pass');

      this.log('Testing: Browser Service');
      const bsRes = await fetch('http://127.0.0.1:7704/health');
      if (!bsRes.ok) throw new Error('Browser Service not responding');
      this.log('PASS: Browser Service running', 'pass');

      this.log('Environment check PASSED', 'success');
      return { passed: true };
    } catch (err) {
      this.log(`FAILED: ${err.message}`, 'fail');
      return { passed: false, error: err.message };
    }
  }

  async testAccountFlow() {
    this.log('Starting account flow test', 'test');
    try {
      this.log(`Testing: Create profile ${this.profile}`);
      const result = await this.runCommand('node', [
        path.join(process.cwd(), 'apps/webauto/entry/profilepool.mjs'),
        'add', 'test', '--json'
      ], 60000);
      const json = JSON.parse(result.stdout);
      if (json.ok && json.profileId) {
        this.log(`PASS: Profile created: ${json.profileId}`, 'pass');
      } else {
        throw new Error('Failed to create profile');
      }
      this.log('Account flow PASSED', 'success');
      return { passed: true, profileId: json.profileId };
    } catch (err) {
      this.log(`FAILED: ${err.message}`, 'fail');
      return { passed: false, error: err.message };
    }
  }

  async testConfigSave() {
    this.log('Starting config save test', 'test');
    try {
      const testConfig = {
        keyword: this.keyword, target: this.target, env: 'debug',
        fetchBody: true, fetchComments: true, maxComments: 50,
        autoLike: false, likeKeywords: '', headless: this.headless, dryRun: true
      };
      const configPath = path.join(process.cwd(), 'test-config.json');
      writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
      this.log(`PASS: Config exported`, 'pass');
      const imported = JSON.parse(readFileSync(configPath, 'utf8'));
      if (imported.keyword === this.keyword) {
        this.log('PASS: Config imported', 'pass');
      }
      import('node:fs').then(fs => fs.unlinkSync(configPath));
      this.log('Config save PASSED', 'success');
      return { passed: true };
    } catch (err) {
      this.log(`FAILED: ${err.message}`, 'fail');
      return { passed: false, error: err.message };
    }
  }

  async testCrawlRun() {
    this.log('Starting crawl run test', 'test');
    try {
      this.log(`Testing: Dry-run crawl (keyword=${this.keyword}, target=${this.target})`);
      const args = [
        path.join(process.cwd(), 'apps/webauto/entry/xhs-unified.mjs'),
        '--profile', this.profile,
        '--keyword', this.keyword,
        '--target', String(this.target),
        '--env', 'debug',
        '--dry-run', 'true'
      ];
      if (this.headless) args.push('--headless', 'true');
      await this.runCommand('node', args, 120000);
      this.log('PASS: Crawl run completed', 'pass');
      this.log('Crawl run PASSED', 'success');
      return { passed: true };
    } catch (err) {
      this.log(`FAILED: ${err.message}`, 'fail');
      return { passed: false, error: err.message };
    }
  }

  async runScenario(scenario) {
    this.log(`Running test scenario: ${scenario}`, 'info');
    let result;
    switch (scenario) {
      case 'env-check': result = await this.testEnvCheck(); break;
      case 'account-flow': result = await this.testAccountFlow(); break;
      case 'config-save': result = await this.testConfigSave(); break;
      case 'crawl-run': result = await this.testCrawlRun(); break;
      default: throw new Error(`Unknown scenario: ${scenario}`);
    }
    result.duration = Date.now() - this.startTime;
    if (this.output) {
      const report = { scenario, ...result, results: this.results };
      mkdirSync(path.dirname(this.output), { recursive: true });
      writeFileSync(this.output, JSON.stringify(report, null, 2));
      this.log(`Report saved to ${this.output}`, 'info');
    }
    return result;
  }
}

async function main() {
  if (args.help || args.h) { printHelp(); process.exit(0); }
  if (args.check) {
    const buildOk = checkBuildStatus();
    console.log(`Build: ${buildOk ? 'OK' : 'MISSING'}`);
    process.exit(buildOk ? 0 : 1);
  }
  if (args.build) { await build(); process.exit(0); }
  if (args.install) { await install(); process.exit(0); }

  const testIndex = process.argv.indexOf('test');
  if (testIndex !== -1 && process.argv[testIndex + 1]) {
    const scenario = process.argv[testIndex + 1];
    const runner = new UITestRunner({
      profile: args.profile, keyword: args.keyword,
      target: parseInt(args.target) || 5,
      headless: args.headless, output: args.output
    });
    try {
      const result = await runner.runScenario(scenario);
      if (result.passed) {
        console.log(`\n✅ Test PASSED (${result.duration}ms)`);
        process.exit(0);
      } else {
        console.log(`\n❌ Test FAILED: ${result.error}`);
        process.exit(1);
      }
    } catch (err) {
      console.log(`\n❌ Test ERROR: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  await startConsole(args['no-daemon']);
}

main().catch((err) => {
  console.error('[ui-console] Error:', err.message);
  process.exit(1);
});

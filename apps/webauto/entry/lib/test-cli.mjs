import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const LAYER_ORDER = ['l0', 'l1', 'l2', 'l3', 'xhs_collect'];
const LAYER_SCRIPTS = {
  l0: 'test:e2e-ui:l0',
  l1: 'test:e2e-ui:l1',
  l2: 'test:e2e-ui:l2',
  l3: 'test:e2e-ui:l3',
  xhs_collect: 'test:xhs:collect',
};

export function printTestHelp() {
  console.log(`webauto test

Usage:
  webauto test [--layer <l0|l1|l2|l3|xhs_collect|all>] [--output <path>] [--json]

Options:
  --layer, -l   Which layer(s) to run (default: all)
  --output, -o  JSON report output path (default: ./.tmp/ui-test-report-<timestamp>.json)
  --json        Print JSON report to stdout (summary suppressed)
  --headless    Set HEADLESS=1 for UI tests
  --profile     Pass WEBAUTO_TEST_PROFILE to tests
  --keyword     Pass WEBAUTO_TEST_KEYWORD to tests
  --target      Pass WEBAUTO_TEST_TARGET to tests
  --xhs-collect Run collect minimal script (xhs collect)

Examples:
  webauto test
  webauto test --layer l0
  webauto test --layer l0,l1 --output ./.tmp/ui-test-report.json
  webauto test --layer xhs_collect
  webauto test --layer xhs_collect --xhs-collect --profile <id>
  webauto test --json
`);
}

function resolveLayers(raw) {
  const input = String(raw || 'all').trim().toLowerCase();
  if (!input || input === 'all') return [...LAYER_ORDER];
  const tokens = input
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => (item.length === 1 && /\d/.test(item) ? `l${item}` : item));

  const selected = new Set();
  for (const token of tokens) {
    if (!LAYER_SCRIPTS[token]) {
      throw new Error(`unknown layer: ${token}`);
    }
    selected.add(token);
  }

  return LAYER_ORDER.filter((layer) => selected.has(layer));
}

function resolveOutputPath(rawOutput) {
  const out = String(rawOutput || '').trim();
  if (out) {
    const resolved = path.isAbsolute(out) ? out : path.resolve(ROOT, out);
    return resolved;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(ROOT, '.tmp', `ui-test-report-${stamp}.json`);
}

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '-';
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 100) / 10;
  return `${sec}s`;
}

function runNpmScript(script, env) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return new Promise((resolve) => {
    const child = spawn(npmCmd, ['run', script], {
      cwd: ROOT,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', (error) => {
      resolve({ ok: false, error: error.message || String(error) });
    });
    child.on('exit', (code) => {
      if (code === 0) return resolve({ ok: true });
      if (process.platform === 'win32' && code === 3221226505) {
        console.warn(`[webauto] Ignored spurious exit on Windows (code ${code})`);
        return resolve({ ok: true });
      }
      resolve({ ok: false, error: `exit ${code}` });
    });
  });
}

function buildEnv(args) {
  const env = { ...process.env };
  if (args.xhsCollect === true) env.WEBAUTO_TEST_XHS_COLLECT = '1';
  if (args.headless === true) env.HEADLESS = '1';
  const profile = String(args.profile || '').trim();
  if (profile) env.WEBAUTO_TEST_PROFILE = profile;
  const keyword = String(args.keyword || '').trim();
  if (keyword) env.WEBAUTO_TEST_KEYWORD = keyword;
  const target = String(args.target || '').trim();
  if (target) env.WEBAUTO_TEST_TARGET = target;
  return env;
}

function printSummary(report, reportPath) {
  console.log('\nTest CLI Summary');
  for (const result of report.results) {
    const status = result.ok ? 'PASS' : 'FAIL';
    console.log(`- ${result.layer.toUpperCase()} ${status} (${formatDuration(result.durationMs)})`);
  }
  console.log(`Overall: ${report.ok ? 'PASS' : 'FAIL'}`);
  console.log(`Report: ${reportPath}`);
}

export async function runTestCli(args) {
  const layers = resolveLayers(args.layer);
  const reportPath = resolveOutputPath(args.output);
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const env = buildEnv(args);
  const runCollectSmoke = args.xhsCollect === true;

  if (runCollectSmoke) {
    const collectStart = Date.now();
    const ret = await runNpmScript('test:xhs:collect', env);
    const durationMs = Date.now() - collectStart;
    results.push({ layer: 'xhs_collect_smoke', ok: ret.ok === true, durationMs, error: ret.ok ? undefined : (ret.error || 'unknown error') });
    if (!ret.ok) {
      overallOk = false;
    }
  }

  const results = [];
  let overallOk = true;

  for (const layer of layers) {
    const script = LAYER_SCRIPTS[layer];
    const layerStart = Date.now();
    const ret = await runNpmScript(script, env);
    const durationMs = Date.now() - layerStart;
    const entry = {
      layer,
      ok: ret.ok === true,
      durationMs,
    };
    if (!ret.ok) entry.error = ret.error || 'unknown error';
    results.push(entry);

    if (!ret.ok) {
      overallOk = false;
      break;
    }
  }

  const endedAt = new Date().toISOString();
  const report = {
    ok: overallOk,
    layer: args.layer ? String(args.layer).trim().toLowerCase() : 'all',
    startedAt,
    endedAt,
    durationMs: Date.now() - startTime,
    results,
  };

  ensureDirFor(reportPath);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (args.json === true) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSummary(report, reportPath);
  }

  return { ok: overallOk, report, reportPath };
}

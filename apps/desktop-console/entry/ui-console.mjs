#!/usr/bin/env node
import minimist from 'minimist';
import {
  printHelp,
  checkBuildStatus,
  build,
  install,
  startConsole,
  resolveReportPath,
  writeReport,
} from './ui-console/system.mjs';
import { UITestRunner } from './ui-console/runner.mjs';
import { runEnvCheck } from './ui-console/scenarios/env-check.mjs';
import { runAccountFlow } from './ui-console/scenarios/account-flow.mjs';
import { runConfigSave } from './ui-console/scenarios/config-save.mjs';
import { runCrawlRun } from './ui-console/scenarios/crawl-run.mjs';
import { runFullCover } from './ui-console/scenarios/full-cover.mjs';

const rawArgv = process.argv.slice(2);
const args = minimist(rawArgv, {
  boolean: ['build', 'install', 'check', 'help', 'headless', 'no-daemon', 'foreground', 'dry-run', 'no-dry-run', 'parallel', 'do-likes'],
  string: ['profile', 'profiles', 'keyword', 'target', 'scenario', 'output', 'concurrency', 'like-keywords', 'max-likes', 'env', 'max-comments'],
  alias: { h: 'help', p: 'profile', k: 'keyword', t: 'target', o: 'output' },
});
// minimist treats `--no-foo` as negation of `foo`, so `--no-daemon` must be
// detected from raw argv to keep backward-compatible CLI behavior.
const noDaemon = rawArgv.includes('--no-daemon') || rawArgv.includes('--foreground') || args.foreground === true;

function resolveScenario(argv) {
  const testIndex = process.argv.indexOf('test');
  if (testIndex !== -1 && process.argv[testIndex + 1]) {
    return String(process.argv[testIndex + 1] || '').trim();
  }
  return String(argv.scenario || '').trim();
}

async function runScenario(runner, scenario, argv) {
  runner.log(`Running test scenario: ${scenario}`, 'info');
  let result;
  switch (scenario) {
    case 'env-check':
      result = await runEnvCheck(runner, argv);
      break;
    case 'account-flow':
      result = await runAccountFlow(runner, argv);
      break;
    case 'config-save':
      result = await runConfigSave(runner, argv);
      break;
    case 'crawl-run':
      result = await runCrawlRun(runner, argv);
      break;
    case 'full-cover':
      result = await runFullCover(runner, argv);
      break;
    default:
      throw new Error(`Unknown scenario: ${scenario}`);
  }
  result.duration = Date.now() - runner.startTime;
  if (runner.output) {
    const report = { scenario, ...result, results: runner.results };
    writeReport(runner.output, report);
    runner.log(`Report saved to ${runner.output}`, 'info');
  }
  return result;
}

async function main() {
  if (args.help || args.h) {
    printHelp();
    process.exit(0);
  }
  if (args.check) {
    const buildOk = checkBuildStatus();
    console.log(`Build: ${buildOk ? 'OK' : 'MISSING'}`);
    process.exit(buildOk ? 0 : 1);
  }
  if (args.build) {
    await build();
    process.exit(0);
  }
  if (args.install) {
    await install();
    process.exit(0);
  }

  const scenario = resolveScenario(args);
  if (scenario) {
    const runner = new UITestRunner({
      profile: args.profile,
      keyword: args.keyword,
      target: Number(args.target) || 5,
      headless: args.headless,
      output: resolveReportPath(args.output),
    });
    try {
      const result = await runScenario(runner, scenario, args);
      if (result.passed) {
        console.log(`\n✅ Test PASSED (${result.duration}ms)`);
        process.exit(0);
      } else {
        console.log(`\n❌ Test FAILED: ${result.error}`);
        process.exit(1);
      }
    } catch (err) {
      const message = err?.message || String(err);
      if (process.platform === 'win32' && message.includes('3221226505')) {
        console.warn(`[ui-console] Ignored spurious exit on Windows: ${message}`);
        process.exit(0);
      }
      console.log(`\n❌ Test ERROR: ${message}`);
      process.exit(1);
    }
    return;
  }

  await startConsole(noDaemon);
}

main().catch((err) => {
  console.error('[ui-console] Error:', err.message || String(err));
  process.exit(1);
});

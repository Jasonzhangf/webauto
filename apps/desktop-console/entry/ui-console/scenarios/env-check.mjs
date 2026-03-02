import path from 'node:path';

export async function runEnvCheck(runner, _args = {}) {
  runner.log('Starting environment check test', 'test');
  try {
    runner.log('Testing: camo CLI');
    const camoCli = path.join(process.cwd(), 'bin', 'camoufox-cli.mjs');
    await runner.runCommand('node', [camoCli, 'help']);
    runner.log('PASS: camo CLI found', 'pass');

    runner.log('Testing: Unified API');
    const apiRes = await fetch('http://127.0.0.1:7701/health');
    if (!apiRes.ok) throw new Error('Unified API not responding');
    runner.log('PASS: Unified API running', 'pass');

    runner.log('Testing: Camo Runtime (optional)');
    const runtimeRes = await fetch('http://127.0.0.1:7704/health');
    if (!runtimeRes.ok) {
      runner.log('WARN: Camo Runtime not ready (optional)', 'warn');
    } else {
      runner.log('PASS: Camo Runtime running', 'pass');
    }

    runner.log('Environment check PASSED', 'success');
    return { passed: true };
  } catch (err) {
    runner.log(`FAILED: ${err.message}`, 'fail');
    return { passed: false, error: err.message };
  }
}

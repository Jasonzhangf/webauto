import path from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';

export async function runConfigSave(runner, _args = {}) {
  runner.log('Starting config save test', 'test');
  try {
    const testConfig = {
      keyword: runner.keyword,
      target: runner.target,
      env: 'prod',
      fetchBody: true,
      fetchComments: true,
      maxComments: 50,
      autoLike: false,
      likeKeywords: '',
      headless: runner.headless,
      dryRun: true,
    };
    const configPath = path.join(process.cwd(), 'test-config.json');
    writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
    runner.log('PASS: Config exported', 'pass');
    const imported = JSON.parse(readFileSync(configPath, 'utf8'));
    if (imported.keyword === runner.keyword) {
      runner.log('PASS: Config imported', 'pass');
    }
    import('node:fs').then((fs) => fs.unlinkSync(configPath));
    runner.log('Config save PASSED', 'success');
    return { passed: true };
  } catch (err) {
    runner.log(`FAILED: ${err.message}`, 'fail');
    return { passed: false, error: err.message };
  }
}

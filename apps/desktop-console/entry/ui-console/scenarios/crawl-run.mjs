import path from 'node:path';
import { findLatestSummary } from '../system.mjs';

export async function runCrawlRun(runner, args) {
  runner.log('Starting crawl run test', 'test');
  try {
    const runProfilesRaw = String(args.profiles || '').trim();
    const runProfiles = runProfilesRaw
      ? runProfilesRaw.split(',').map((p) => p.trim()).filter(Boolean)
      : [];
    const profileFlag = runProfiles.length > 0
      ? ['--profiles', runProfiles.join(',')]
      : ['--profile', runner.profile];
    runner.log(`Testing: Crawl run (keyword=${runner.keyword}, target=${runner.target})`);
    const env = String(args.env || 'prod').trim() || 'prod';
    const runArgs = [
      path.join(process.cwd(), 'apps/webauto/entry/xhs-unified.mjs'),
      ...profileFlag,
      '--keyword', runner.keyword,
      '--target', String(runner.target),
      '--env', env,
    ];
    if (runProfiles.length > 1 && (args.parallel === true || args.parallel === undefined)) {
      runArgs.push('--parallel', 'true');
      const conc = String(args.concurrency || '').trim();
      if (conc) runArgs.push('--concurrency', conc);
    }
    const likeKeywords = String(args['like-keywords'] || '').trim();
    const doLikes = args['do-likes'] === true || Boolean(likeKeywords);
    if (doLikes) {
      runArgs.push('--do-likes', 'true');
      if (likeKeywords) runArgs.push('--like-keywords', likeKeywords);
      const maxLikes = String(args['max-likes'] || '').trim();
      if (maxLikes) runArgs.push('--max-likes', maxLikes);
    }
    const maxComments = String(args['max-comments'] || '').trim();
    if (maxComments) runArgs.push('--max-comments', maxComments);
    const forceDryRun = args['dry-run'] === true && args['no-dry-run'] !== true;
    const dryFlag = forceDryRun ? '--dry-run' : '--no-dry-run';
    runArgs.push(dryFlag, 'true');
    if (runner.headless) runArgs.push('--headless', 'true');
    await runner.runCommand('node', runArgs, 0, { env: { WEBAUTO_BUS_EVENTS: '1' } });
    const summaryPath = findLatestSummary(runner.keyword);
    if (summaryPath) {
      try {
        const summary = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(summaryPath, 'utf8')));
        const totals = summary?.totals || {};
        const profiles = Array.isArray(summary?.profiles) ? summary.profiles : [];
        const reasons = profiles.map((p) => `${p.profileId}:${p.reason || p.stats?.stopReason || 'unknown'}`).join(', ');
        runner.log(`Summary: profilesSucceeded=${totals.profilesSucceeded ?? '-'} profilesFailed=${totals.profilesFailed ?? '-'} openedNotes=${totals.openedNotes ?? '-'} operationErrors=${totals.operationErrors ?? '-'} recoveryFailed=${totals.recoveryFailed ?? '-'}`, 'info');
        if (reasons) runner.log(`Stop reasons: ${reasons}`, 'info');
        runner.log(`Summary path: ${summaryPath}`, 'info');
      } catch (err) {
        runner.log(`Summary parse failed: ${err.message || String(err)}`, 'warn');
      }
    } else {
      runner.log('Summary not found after crawl run', 'warn');
    }
    runner.log('PASS: Crawl run completed', 'pass');
    runner.log('Crawl run PASSED', 'success');
    return { passed: true };
  } catch (err) {
    runner.log(`FAILED: ${err.message}`, 'fail');
    return { passed: false, error: err.message };
  }
}

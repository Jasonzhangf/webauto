// Compatibility wrapper: consumer orchestration now lives in weibo-v3.
import { pathToFileURL } from 'node:url';

export async function runWeiboConsumerTask(args = {}) {
  const { runWeiboCli } = await import('../weibo-v3/cli.mjs');
  return runWeiboCli('consumer', args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: minimist } = await import('minimist');
  const argv = minimist(process.argv.slice(2));
  const { assertDaemonAdmission, runWeiboCli } = await import('../weibo-v3/cli.mjs');
  if (!argv.help && !argv.h) assertDaemonAdmission();
  const result = await runWeiboCli('consumer', argv);
  if (!result?.help) console.log(JSON.stringify(result, null, 2));
  if (result?.ok === false || result?.success === false) process.exitCode = 1;
}

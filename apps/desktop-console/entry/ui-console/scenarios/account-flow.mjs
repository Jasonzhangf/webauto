import path from 'node:path';

export async function runAccountFlow(runner, _args = {}) {
  runner.log('Starting account flow test', 'test');
  try {
    runner.log(`Testing: Create profile ${runner.profile}`);
    const result = await runner.runCommand('node', [
      path.join(process.cwd(), 'apps/webauto/entry/profilepool.mjs'),
      'add', 'test', '--json',
    ], 60000);
    const json = JSON.parse(result.stdout);
    if (json.ok && json.profileId) {
      runner.log(`PASS: Profile created: ${json.profileId}`, 'pass');
    } else {
      throw new Error('Failed to create profile');
    }
    runner.log('Account flow PASSED', 'success');
    return { passed: true, profileId: json.profileId };
  } catch (err) {
    runner.log(`FAILED: ${err.message}`, 'fail');
    return { passed: false, error: err.message };
  }
}

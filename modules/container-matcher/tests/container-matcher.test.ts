import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContainerMatcher } from '../src/index.js';
import { createFixtureSessionFromFile } from '../src/fixtureSession.js';
import { run as runCli } from '../src/cli.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.join(__dirname, 'fixtures', 'weibo.html');
const url = 'https://weibo.com/';

test('matchRoot returns container for fixture session', async () => {
  const matcher = new ContainerMatcher();
  const session = createFixtureSessionFromFile(fixturePath, url);
  const match = await matcher.matchRoot(session as any, { url });
  assert.ok(match, 'should match root container');
  assert.equal(match?.container?.id, 'weibo_main_page');
});

test('inspectTree returns container tree for fixture session', async () => {
  const matcher = new ContainerMatcher();
  const session = createFixtureSessionFromFile(fixturePath, url);
  const snapshot = await matcher.inspectTree(session as any, { url }, {});
  assert.equal(snapshot.root_match.container.id, 'weibo_main_page');
  assert.ok(snapshot.container_tree.children?.length);
});

test('cli match-root works with fixture', async () => {
  const result = await runCli(['match-root', '--url', url, '--fixture', fixturePath]);
  assert.equal(result.success, true);
  assert.equal(result.data.container.id, 'weibo_main_page');
});

test('cli inspect-tree works with fixture', async () => {
  const result = await runCli(['inspect-tree', '--url', url, '--fixture', fixturePath]);
  assert.equal(result.success, true);
  assert.equal(result.data.root_match.container.id, 'weibo_main_page');
});

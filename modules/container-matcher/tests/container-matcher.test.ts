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

test('inspectDomBranch returns branch for fixture session', async () => {
  const matcher = new ContainerMatcher();
  const session = createFixtureSessionFromFile(fixturePath, url);
  const snapshot = await matcher.inspectTree(session as any, { url }, { max_depth: 2 });
  const rootChild = snapshot.dom_tree.children?.[0];
  assert.ok(rootChild, 'fixture should have dom children');
  const branch = await matcher.inspectDomBranch(session as any, { url }, {
    path: rootChild.path,
    root_selector: snapshot.metadata?.root_selector,
  });
  assert.equal(branch.path, rootChild.path);
  assert.ok(branch.node.children);
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

test('cli inspect-branch works with fixture', async () => {
  const tree = await runCli(['inspect-tree', '--url', url, '--fixture', fixturePath]);
  assert.equal(tree.success, true);
  const childPath = tree.data?.dom_tree?.children?.[0]?.path;
  const rootSelector = tree.data?.metadata?.root_selector;
  assert.ok(childPath, 'should have dom child path');
  const branch = await runCli([
    'inspect-branch',
    '--url',
    url,
    '--fixture',
    fixturePath,
    '--path',
    childPath,
    '--root-selector',
    rootSelector,
  ]);
  assert.equal(branch.success, true);
  assert.equal(branch.data.path, childPath);
  assert.ok(branch.data.node);
});

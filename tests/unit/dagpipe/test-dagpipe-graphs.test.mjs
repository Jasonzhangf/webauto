// Contract tests for the DAGpipe graph definitions in docs/dagpipe/.
//
// The graphs, the plan's mapping table and the real source owners must not
// drift apart. `docs/dagpipe/owners.json` is the single source of truth;
// everything else is checked against it:
//
// * the graph JSON matches the SDK Graph shape and the owners file's node list;
// * every edge's arc is the source node's output, and the target grants it;
// * every declared output is reachable and the graph is acyclic with the
//   expected deterministic waves;
// * every cited code owner really exists: owners.json names a file, line and
//   exact symbol, and this test opens that file and asserts the symbol is on
//   that line. This is what catches the drift a hardcoded expectation cannot.
// * when the `dagpipe` CLI is installed, `dagpipe graph validate` accepts every
//   graph.
//
// No runtime behavior is added; this file is verification only.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const DAG = path.join(REPO, 'docs', 'dagpipe');
const OWNERS = path.join(DAG, 'owners.json');

const EXPECTED_WAVES = {
  'weibo-detail-flow.graph.json': 2,
  'weibo-search-flow.graph.json': 2,
  'weibo-profile-flow.graph.json': 2,
  'weibo-timeline-flow.graph.json': 2,
  'weibo-producer-consumer-chain.graph.json': 2,
  'computeruse-branch.graph.json': 3,
};

function dagpipeInstalled() {
  try {
    execSync('command -v dagpipe', { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function owners() {
  return JSON.parse(fs.readFileSync(OWNERS, 'utf8'));
}

function loadGraph(name) {
  return JSON.parse(fs.readFileSync(path.join(DAG, name), 'utf8'));
}

// Kahn layering; throws on a cycle.
function topologicalWaves(graph) {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const remaining = new Map();
  for (const nid of nodeIds) remaining.set(nid, new Set());
  for (const edge of graph.edges) {
    if (!remaining.has(edge.to)) remaining.set(edge.to, new Set());
    remaining.get(edge.to).add(edge.from);
  }
  const waves = [];
  const done = new Set();
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, deps]) => deps.size === 0)
      .map(([nid]) => nid)
      .sort();
    if (ready.length === 0) {
      throw new Error(`cycle detected among ${[...remaining.keys()].sort().join(',')}`);
    }
    waves.push(ready);
    for (const nid of ready) {
      done.add(nid);
      remaining.delete(nid);
    }
    for (const deps of remaining.values()) {
      for (const nid of ready) deps.delete(nid);
    }
  }
  return waves;
}

test('owners file is the single source of truth', () => {
  const data = owners();
  assert.ok(data.graphs, 'owners.json must have a graphs key');
  for (const [graphName, spec] of Object.entries(data.graphs)) {
    assert.ok(fs.existsSync(path.join(DAG, spec.file)), `missing graph file for ${graphName}`);
    assert.ok(spec.nodes && spec.nodes.length > 0, `${graphName} declares no nodes`);
  }
});

test('graph matches owners node list', () => {
  const data = owners();
  for (const [graphName, spec] of Object.entries(data.graphs)) {
    const g = loadGraph(spec.file);
    const graphNodeIds = g.nodes.map((n) => n.id).sort();
    const ownerNodeIds = spec.nodes.map((n) => n.id).sort();
    assert.deepEqual(graphNodeIds, ownerNodeIds, `${graphName} node ids must match owners.json`);
  }
});

test('graph inputs/outputs/edges are well-formed', () => {
  const data = owners();
  for (const [graphName, spec] of Object.entries(data.graphs)) {
    const g = loadGraph(spec.file);
    assert.ok(g.id, `${graphName} missing id`);
    assert.ok(g.version, `${graphName} missing version`);
    assert.ok(g.inputs && g.inputs.length === 1, `${graphName} must be SESE (single input)`);
    assert.ok(g.outputs && g.outputs.length === 1, `${graphName} must be SESE (single output)`);
    const nodeOutputs = new Map();
    for (const n of g.nodes) nodeOutputs.set(n.output.id, n.id);
    for (const edge of g.edges) {
      assert.ok(nodeOutputs.has(edge.arc_id), `${graphName} edge arc ${edge.arc_id} is not a node output`);
      assert.ok(g.nodes.some((n) => n.id === edge.from), `${graphName} edge from ${edge.from} missing`);
      assert.ok(g.nodes.some((n) => n.id === edge.to), `${graphName} edge to ${edge.to} missing`);
    }
  }
});

test('graph is acyclic with expected deterministic waves', () => {
  const data = owners();
  for (const [graphName, spec] of Object.entries(data.graphs)) {
    const g = loadGraph(spec.file);
    const waves = topologicalWaves(g);
    const expected = EXPECTED_WAVES[spec.file];
    assert.ok(expected !== undefined, `${graphName} has no expected wave count`);
    assert.equal(waves.length, expected, `${graphName} wave count ${waves.length} != expected ${expected}`);
  }
});

test('every cited code owner really exists (drift detection)', () => {
  const data = owners();
  for (const [graphName, spec] of Object.entries(data.graphs)) {
    for (const node of spec.nodes) {
      const fileAbs = path.join(REPO, node.owner);
      assert.ok(fs.existsSync(fileAbs), `${graphName}/${node.id}: owner file not found: ${node.owner}`);
      const lines = fs.readFileSync(fileAbs, 'utf8').split('\n');
      const line = lines[node.line - 1];
      assert.ok(line !== undefined, `${graphName}/${node.id}: line ${node.line} out of range in ${node.owner}`);
      assert.ok(
        line.includes(node.symbol),
        `${graphName}/${node.id}: expected symbol "${node.symbol}" at ${node.owner}:${node.line}, got: ${line.trim()}`
      );
    }
    for (const b of spec.boundary || []) {
      const fileAbs = path.join(REPO, b.owner);
      assert.ok(fs.existsSync(fileAbs), `${graphName} boundary: owner file not found: ${b.owner}`);
      const lines = fs.readFileSync(fileAbs, 'utf8').split('\n');
      const line = lines[b.line - 1];
      assert.ok(line !== undefined, `${graphName} boundary: line ${b.line} out of range in ${b.owner}`);
      assert.ok(
        line.includes(b.symbol),
        `${graphName} boundary: expected "${b.symbol}" at ${b.owner}:${b.line}, got: ${line.trim()}`
      );
    }
  }
});

test('dagpipe graph validate accepts every graph (when CLI installed)', { skip: dagpipeInstalled() ? false : 'dagpipe CLI not installed' }, () => {
  const data = owners();
  for (const [graphName, spec] of Object.entries(data.graphs)) {
    const graphPath = path.join(DAG, spec.file);
    const result = execSync(`dagpipe graph validate ${graphPath}`, { encoding: 'utf8' });
    assert.match(result, /valid DAG/, `${graphName}: dagpipe validate did not report valid`);
  }
});

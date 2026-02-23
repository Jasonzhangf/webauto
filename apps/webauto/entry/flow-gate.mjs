#!/usr/bin/env node
import minimist from 'minimist';
import {
  listPlatformFlowGates,
  loadFlowGateDoc,
  patchPlatformFlowGate,
  resetPlatformFlowGate,
  resolveFlowGatePath,
  resolvePlatformFlowGate,
} from './lib/flow-gate.mjs';

function normalizePlatform(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 'xiaohongshu';
  if (text === 'xhs') return 'xiaohongshu';
  return text;
}

function toJsonMode(argv) {
  return argv.json === true || argv.j === true;
}

function printHelp() {
  console.log([
    'Usage: node apps/webauto/entry/flow-gate.mjs <get|list|set|reset|path> [options]',
    'Options:',
    '  --platform <name>       平台名（默认 xiaohongshu）',
    '  --patch-json <json>     set 动作补丁 JSON（对象）',
    '  --json                  输出 JSON',
    '',
    'Examples:',
    '  node apps/webauto/entry/flow-gate.mjs get --platform xiaohongshu --json',
    '  node apps/webauto/entry/flow-gate.mjs list --json',
    '  node apps/webauto/entry/flow-gate.mjs set --platform xiaohongshu --patch-json \'{"noteInterval":{"minMs":2600,"maxMs":5200}}\' --json',
    '  node apps/webauto/entry/flow-gate.mjs reset --platform xiaohongshu --json',
  ].join('\n'));
}

function parsePatchJson(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('missing --patch-json');
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid --patch-json: ${error?.message || String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--patch-json must be object JSON');
  }
  return parsed;
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    boolean: ['help', 'h', 'json', 'j'],
    string: ['platform', 'patch-json'],
  });
  if (argv.help || argv.h) {
    printHelp();
    return;
  }

  const action = String(argv._[0] || 'get').trim().toLowerCase();
  const platform = normalizePlatform(argv.platform);
  const jsonMode = toJsonMode(argv);
  const path = resolveFlowGatePath();

  if (action === 'path') {
    if (jsonMode) {
      console.log(JSON.stringify({ ok: true, path }, null, 2));
    } else {
      console.log(path);
    }
    return;
  }

  if (action === 'get') {
    const gate = await resolvePlatformFlowGate(platform);
    if (jsonMode) {
      console.log(JSON.stringify({ ok: true, platform, path, gate }, null, 2));
    } else {
      console.log(`[flow-gate] platform=${platform}`);
      console.log(JSON.stringify(gate, null, 2));
      console.log(`[flow-gate] file=${path}`);
    }
    return;
  }

  if (action === 'list') {
    const gates = await listPlatformFlowGates();
    if (jsonMode) {
      console.log(JSON.stringify({ ok: true, path, platforms: gates }, null, 2));
    } else {
      console.log(JSON.stringify(gates, null, 2));
      console.log(`[flow-gate] file=${path}`);
    }
    return;
  }

  if (action === 'set') {
    const patch = parsePatchJson(argv['patch-json']);
    const gate = await patchPlatformFlowGate(platform, patch);
    if (jsonMode) {
      console.log(JSON.stringify({ ok: true, action, platform, path, gate }, null, 2));
    } else {
      console.log(`[flow-gate] updated platform=${platform}`);
      console.log(JSON.stringify(gate, null, 2));
      console.log(`[flow-gate] file=${path}`);
    }
    return;
  }

  if (action === 'reset') {
    const gate = await resetPlatformFlowGate(platform);
    if (jsonMode) {
      console.log(JSON.stringify({ ok: true, action, platform, path, gate }, null, 2));
    } else {
      console.log(`[flow-gate] reset platform=${platform}`);
      console.log(JSON.stringify(gate, null, 2));
      console.log(`[flow-gate] file=${path}`);
    }
    return;
  }

  if (action === 'show-doc') {
    const doc = await loadFlowGateDoc();
    if (jsonMode) console.log(JSON.stringify({ ok: true, path, doc }, null, 2));
    else console.log(JSON.stringify(doc, null, 2));
    return;
  }

  throw new Error(`unknown action: ${action}`);
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});

#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WorkflowOrchestrator } from './src/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const [maybeCommand, ...rest] = argv;
  const command = maybeCommand && !maybeCommand.startsWith('--') ? maybeCommand : 'run';
  const args = command === maybeCommand ? rest : argv;
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    flags[key] = value;
  }
  return { command, flags };
}

function assertFlag(flags, name) {
  if (!flags[name]) {
    throw new Error(`Missing required flag --${name}`);
  }
  return flags[name];
}

function parseNumberFlag(flags, name) {
  if (!flags[name]) return undefined;
  const num = Number(flags[name]);
  return Number.isFinite(num) ? num : undefined;
}

function parseBooleanFlag(flags, name, defaultValue) {
  if (flags[name] === undefined) return defaultValue;
  const value = flags[name];
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return defaultValue;
}

function resolveDefinitionPaths(raw) {
  const parts = raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (!parts.length) {
    throw new Error('至少提供一个 --definition <file>');
  }
  return parts;
}

async function handleRun(flags) {
  const definitionFlag = assertFlag(flags, 'definition');
  const definitionPaths = resolveDefinitionPaths(definitionFlag);
  const profile = assertFlag(flags, 'profile');
  const orchestrator = new WorkflowOrchestrator({
    profile,
    definitionPaths,
    url: flags.url,
    containerSite: flags.site,
    wsUrl: flags.ws,
    browserHost: flags['browser-host'] || flags.browserHost,
    browserPort: parseNumberFlag(flags, 'browser-port'),
    testMode: parseBooleanFlag(flags, 'test', false),
  });
  await orchestrator.start();
  if (orchestrator && !parseBooleanFlag(flags, 'test', false)) {
    const shutdown = async () => {
      await orchestrator.stop().catch(() => {});
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else {
    await orchestrator.stop().catch(() => {});
  }
}

async function main() {
  try {
    const { command, flags } = parseArgs(process.argv.slice(2));
    if (command === 'run') {
      await handleRun(flags);
      return;
    }
    console.log('可用命令: run');
    process.exit(1);
  } catch (err) {
    console.error('[workflow]', err?.message || err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${__filename}`) {
  main();
}

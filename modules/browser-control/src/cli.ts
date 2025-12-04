#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchDomHtml, DomFetchOptions } from './domSource.js';
import { buildDomTree } from './domTree.js';
import { launchOneClick, stopProfile, getServiceStatus, type LaunchOptions } from './launcher.js';

interface CliResult {
  success: boolean;
  data?: any;
  error?: string;
}

interface ParsedArgs {
  command: string;
  flags: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [maybeCommand, ...rest] = argv;
  const command = maybeCommand && !maybeCommand.startsWith('--') ? maybeCommand : 'dom-dump';
  const args = command === maybeCommand ? rest : argv;
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    flags[key] = value;
  }
  return { command, flags };
}

function assertFlag(flags: Record<string, string>, key: string) {
  const value = flags[key];
  if (!value) {
    throw new Error(`Missing required flag --${key}`);
  }
  return value;
}

async function handleDomDump(flags: Record<string, string>): Promise<CliResult> {
  const url = flags.url;
  if (!url && !flags.fixture) {
    throw new Error('Either --url or --fixture must be provided');
  }
  const fetchOptions: DomFetchOptions = {
    url: url || 'about:blank',
    profileDir: flags.profile,
    headless: flags.headless ? flags.headless !== 'false' : true,
    waitFor: flags.waitFor ? Number(flags.waitFor) : undefined,
    fixture: flags.fixture,
  };
  const html = await fetchDomHtml(fetchOptions);
  if (flags.output) {
    const resolved = path.resolve(flags.output);
    await fs.promises.writeFile(resolved, html, 'utf-8');
    return { success: true, data: { output: resolved, bytes: html.length } };
  }
  return { success: true, data: { html } };
}

async function handleDomTree(flags: Record<string, string>): Promise<CliResult> {
  const url = flags.url;
  if (!url && !flags.fixture) {
    throw new Error('Either --url or --fixture must be provided');
  }
  const html = await fetchDomHtml({
    url: url || 'about:blank',
    profileDir: flags.profile,
    headless: flags.headless ? flags.headless !== 'false' : true,
    waitFor: flags.waitFor ? Number(flags.waitFor) : undefined,
    fixture: flags.fixture,
  });
  const tree = buildDomTree({
    html,
    selector: flags.selector,
    maxDepth: flags.maxDepth ? Number(flags.maxDepth) : undefined,
    maxChildren: flags.maxChildren ? Number(flags.maxChildren) : undefined,
  });
  return { success: Boolean(tree), data: { tree } };
}

function parseBooleanFlag(flags: Record<string, string>, key: string, defaultValue: boolean | undefined) {
  if (flags[key] === undefined) return defaultValue;
  const value = flags[key];
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return true;
}

function parseNumberFlag(flags: Record<string, string>, key: string) {
  if (!flags[key]) return undefined;
  const num = Number(flags[key]);
  return Number.isFinite(num) ? num : undefined;
}

async function handleLaunch(flags: Record<string, string>): Promise<CliResult> {
  const options: LaunchOptions = {
    host: flags.host,
    port: parseNumberFlag(flags, 'port'),
    wsHost: flags['ws-host'] || flags.wsHost,
    wsPort: parseNumberFlag(flags, 'ws-port'),
    profile: flags.profile,
    headless: parseBooleanFlag(flags, 'headless', undefined),
    url: flags.url,
    restart: parseBooleanFlag(flags, 'restart', parseBooleanFlag(flags, 'force-restart', false)),
    devConsole: flags['no-dev'] ? false : parseBooleanFlag(flags, 'dev', undefined),
  };
  const result = await launchOneClick(options);
  return { success: result.success, data: result };
}

async function handleStop(flags: Record<string, string>): Promise<CliResult> {
  const profile = flags.profile;
  if (!profile) {
    throw new Error('--profile is required for stop command');
  }
  const result = await stopProfile({
    host: flags.host,
    port: parseNumberFlag(flags, 'port'),
    profile,
  });
  return { success: result.success, data: result };
}

async function handleStatus(flags: Record<string, string>): Promise<CliResult> {
  const result = await getServiceStatus({
    host: flags.host,
    port: parseNumberFlag(flags, 'port'),
  });
  return { success: result.success, data: result };
}

export async function run(argv = process.argv.slice(2)): Promise<CliResult> {
  const { command, flags } = parseArgs(argv);
  if (command === 'dom-dump') {
    return handleDomDump(flags);
  }
  if (command === 'dom-tree') {
    return handleDomTree(flags);
  }
  if (command === 'launch') {
    return handleLaunch(flags);
  }
  if (command === 'stop') {
    return handleStop(flags);
  }
  if (command === 'status') {
    return handleStatus(flags);
  }
  throw new Error(`Unknown command: ${command}`);
}

async function main() {
  const result = await run();
  if (result.success) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  console.error(result.error || 'Command failed');
  process.exit(1);
}

const currentFile = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] || '') === currentFile) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}

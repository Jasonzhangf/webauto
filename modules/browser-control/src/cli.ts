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
    if (command === 'highlight') {
        return handleHighlight(flags);
    }
    if (command === 'highlight-dom-path') {
        return handleHighlightDomPath(flags);
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

async function handleHighlight(flags: Record<string, string>): Promise<CliResult> {
    const url = flags.url;
    if (!url && !flags.fixture) {
        throw new Error('Either --url or --fixture must be provided');
    }
    const selector = assertFlag(flags, 'selector');
    const color = flags.color || 'green';
    const duration = Number(flags.duration || 1500);

    // 复用 dom-dump 的 session 打开逻辑
    const fetchOptions: DomFetchOptions = {
        url: url || 'about:blank',
        profileDir: flags.profile,
        headless: flags.headless ? flags.headless !== 'false' : true,
        fixture: flags.fixture,
    };
    const html = await fetchDomHtml(fetchOptions);
    // 上面只是拿到 session，下面真正高亮
    const page = (global as any).__browserPage; // 复用全局 page
    if (!page) throw new Error('no active page');

    const result = await page.evaluate((data: any) => {
        const nodes = Array.from(document.querySelectorAll(data.selector));
        if (!nodes.length) return { success: false, error: 'element not found', count: 0 };
        const cleanups = nodes.map((el: any) => {
            const orig = el.style.outline;
            el.style.outline = data.style;
            return () => { el.style.outline = orig; };
        });
        const cleanup = () => cleanups.forEach((fn: any) => { try { fn(); } catch {} });
        if (data.duration > 0) setTimeout(cleanup, data.duration);
        return { success: true, count: nodes.length };
    }, { selector, style: `4px solid ${color}`, duration });

    return { success: result.success !== false, data: result };
}

async function handleHighlightDomPath(flags: Record<string, string>): Promise<CliResult> {
    const url = flags.url;
    if (!url && !flags.fixture) {
        throw new Error('Either --url or --fixture must be provided');
    }
    const path = assertFlag(flags, 'dom-path');
    const color = flags.color || 'green';
    const duration = Number(flags.duration || 1500);

    const fetchOptions: DomFetchOptions = {
        url: url || 'about:blank',
        profileDir: flags.profile,
        headless: flags.headless ? flags.headless !== 'false' : true,
        fixture: flags.fixture,
    };
    await fetchDomHtml(fetchOptions); // 打开 session
    const page = (global as any).__browserPage;
    if (!page) throw new Error('no active page');

    const result = await page.evaluate((data: any) => {
        const parts = data.path.split('/').filter((t: string) => t.length);
        if (parts[0] !== 'root') parts.unshift('root');
        let node = document.body || document.documentElement;
        for (let i = 1; i < parts.length; i++) {
            const idx = Number(parts[i]);
            const children = node.children ? Array.from(node.children) : [];
            if (!Number.isFinite(idx) || idx < 0 || idx >= children.length) {
                return { success: false, error: 'dom path not found', count: 0 };
            }
            node = children[idx] as any;
            if (!node) return { success: false, error: 'dom path not found', count: 0 };
        }
        const orig = (node as any).style.outline;
        (node as any).style.outline = data.style;
        if (data.duration > 0) setTimeout(() => { (node as any).style.outline = orig; }, data.duration);
        return { success: true, count: 1 };
    }, { path, style: `4px solid ${color}`, duration });

    return { success: result.success !== false, data: result };
}

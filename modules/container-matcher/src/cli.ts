#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContainerMatcher } from './index.js';
import { createFixtureSessionFromFile } from './fixtureSession.js';

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
  const command = maybeCommand && !maybeCommand.startsWith('--') ? maybeCommand : 'match-root';
  const flags: Record<string, string> = {};
  const args = command === maybeCommand ? rest : argv;
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    flags[key] = value;
  }
  return { command, flags };
}

function requireFlag(flags: Record<string, string>, name: string) {
  const value = flags[name];
  if (!value) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

export async function run(argv = process.argv.slice(2)): Promise<CliResult> {
  const matcher = new ContainerMatcher();
  const { command, flags } = parseArgs(argv);
  const url = requireFlag(flags, 'url');
  const fixture = flags.fixture;
  if (!fixture) {
    throw new Error('For now, --fixture <htmlFile> is required');
  }
  const session = createFixtureSessionFromFile(fixture, url);
  if (command === 'match-root') {
    const match = await matcher.matchRoot(session as any, { url });
    if (!match) {
      return { success: false, error: 'No container matched' };
    }
    return { success: true, data: match };
  }
  if (command === 'inspect-tree') {
    const options: Record<string, any> = {};
    if (flags['root-container-id']) options.root_container_id = flags['root-container-id'];
    if (flags['root-selector']) options.root_selector = flags['root-selector'];
    if (flags['max-depth']) options.max_depth = Number(flags['max-depth']);
    if (flags['max-children']) options.max_children = Number(flags['max-children']);
    const snapshot = await matcher.inspectTree(session as any, { url }, options);
    return { success: true, data: snapshot };
  }
  if (command === 'inspect-branch') {
    const path = requireFlag(flags, 'path');
    const options: Record<string, any> = {
      path,
    };
    if (flags['root-selector']) options.root_selector = flags['root-selector'];
    if (flags['root-container-id']) options.root_container_id = flags['root-container-id'];
    if (flags['max-depth']) options.max_depth = Number(flags['max-depth']);
    if (flags['max-children']) options.max_children = Number(flags['max-children']);
    const branch = await matcher.inspectDomBranch(session as any, { url }, options);
    return { success: true, data: branch };
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

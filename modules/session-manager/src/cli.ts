#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSession,
  deleteSession,
  listSessions,
  type CreateSessionOptions,
  type DeleteSessionOptions,
  type SessionManagerOptions,
} from './index.js';

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
  const command = maybeCommand && !maybeCommand.startsWith('--') ? maybeCommand : 'list';
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

function parseBaseOptions(flags: Record<string, string>): SessionManagerOptions {
  return {
    host: flags.host,
    port: flags.port ? Number(flags.port) : undefined,
  };
}

function parseBoolean(value: string | undefined, fallback: boolean | undefined): boolean | undefined {
  if (value === undefined) return fallback;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return true;
}

async function handleList(flags: Record<string, string>): Promise<CliResult> {
  const result = await listSessions(parseBaseOptions(flags));
  return { success: result.success, data: result };
}

async function handleCreate(flags: Record<string, string>): Promise<CliResult> {
  const profile = flags.profile || flags.session || flags.id;
  if (!profile) {
    throw new Error('create command requires --profile <id>');
  }
  const options: CreateSessionOptions = {
    ...parseBaseOptions(flags),
    profile,
    headless: parseBoolean(flags.headless, undefined),
    url: flags.url,
    keepOpen: parseBoolean(flags['keep-open'], undefined),
  };
  const result = await createSession(options);
  return { success: result.success, data: result };
}

async function handleDelete(flags: Record<string, string>): Promise<CliResult> {
  const profile = flags.profile || flags.session || flags.id;
  if (!profile) {
    throw new Error('delete command requires --profile <id>');
  }
  const options: DeleteSessionOptions = {
    ...parseBaseOptions(flags),
    profile,
  };
  const result = await deleteSession(options);
  return { success: result.success, data: result };
}

export async function run(argv = process.argv.slice(2)): Promise<CliResult> {
  const { command, flags } = parseArgs(argv);
  if (command === 'list') {
    return handleList(flags);
  }
  if (command === 'create') {
    return handleCreate(flags);
  }
  if (command === 'delete' || command === 'remove' || command === 'stop') {
    return handleDelete(flags);
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

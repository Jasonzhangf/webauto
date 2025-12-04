#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLogFile, streamLog, flushLog, type StreamOptions } from './index.js';

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
  const command = maybeCommand && !maybeCommand.startsWith('--') ? maybeCommand : 'stream';
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

function toStreamOptions(flags: Record<string, string>): StreamOptions {
  return {
    source: flags.source,
    session: flags.session || flags.profile,
    file: flags.file,
    maxLines: flags.lines ? Number(flags.lines) : undefined,
  };
}

async function handleStream(flags: Record<string, string>): Promise<CliResult> {
  const result = await streamLog(toStreamOptions(flags));
  return { success: true, data: result };
}

async function handleFlush(flags: Record<string, string>): Promise<CliResult> {
  const truncate = flags.truncate !== 'false';
  const options = toStreamOptions(flags);
  const file = resolveLogFile(options);
  const result = await flushLog(options, truncate);
  return {
    success: true,
    data: {
      file,
      lines: result.lines,
      truncated: truncate,
    },
  };
}

export async function run(argv = process.argv.slice(2)): Promise<CliResult> {
  const { command, flags } = parseArgs(argv);
  if (command === 'stream' || command === 'tail') {
    return handleStream(flags);
  }
  if (command === 'flush') {
    return handleFlush(flags);
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

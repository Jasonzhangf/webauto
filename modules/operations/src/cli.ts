#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerOperation, getOperation, listOperations, type OperationContext } from './registry.js';
import { highlightOperation } from './operations/highlight.js';
import { scrollOperation } from './operations/scroll.js';
import { mouseMoveOperation, mouseClickOperation } from './system/mouse.js';

registerOperation(highlightOperation);
registerOperation(scrollOperation);
registerOperation(mouseMoveOperation);
registerOperation(mouseClickOperation);

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

function parseJson(json: string | undefined) {
  if (!json) return undefined;
  try {
    return JSON.parse(json);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err?.message || err}`);
  }
}

async function handleList(): Promise<CliResult> {
  return {
    success: true,
    data: listOperations().map((op) => ({ id: op.id, description: op.description, requiredCapabilities: op.requiredCapabilities })),
  };
}

async function handleRun(flags: Record<string, string>): Promise<CliResult> {
  const opId = flags.op || flags.operation || flags.id;
  if (!opId) {
    throw new Error('--op <operationId> is required');
  }
  const operation = getOperation(opId);
  if (!operation) {
    throw new Error(`Unknown operation: ${opId}`);
  }
  const config = parseJson(flags.config) || {};
  const context = createContext(flags);
  const result = await operation.run(context, config);
  return { success: true, data: result };
}

function createContext(flags: Record<string, string>): OperationContext {
  const context: OperationContext = {
    page: {
      async evaluate(fn: (...args: any[]) => any, ...args: any[]) {
        return { success: true, mock: true, args };
      },
    },
    logger: console,
  };
  if (flags.system === 'mock') {
    context.systemInput = {
      mouseMove: async () => ({ mock: true }),
      mouseClick: async () => ({ mock: true }),
    };
  }
  return context;
}

export async function run(argv = process.argv.slice(2)): Promise<CliResult> {
  const { command, flags } = parseArgs(argv);
  if (command === 'list') {
    return handleList();
  }
  if (command === 'run') {
    return handleRun(flags);
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

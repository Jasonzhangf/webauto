#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContainerRegistry } from './index.js';
import { ContainerMatcher } from '../../container-matcher/src/index.js';
import { createFixtureSessionFromFile } from '../../container-matcher/src/fixtureSession.js';

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

function assertFlag(flags: Record<string, string>, name: string) {
  if (!flags[name]) {
    throw new Error(`Missing required flag --${name}`);
  }
  return flags[name];
}

export async function run(argv = process.argv.slice(2)): Promise<CliResult> {
  const registry = new ContainerRegistry();
  const { command, flags } = parseArgs(argv);
  if (command === 'list') {
    const url = assertFlag(flags, 'url');
    const containers = registry.getContainersForUrl(url);
    return {
      success: true,
      data: {
        url,
        ids: Object.keys(containers),
        containers,
      },
    };
  }
  if (command === 'sites') {
    return {
      success: true,
      data: {
        sites: registry.listSites(),
      },
    };
  }
  if (command === 'show') {
    const url = assertFlag(flags, 'url');
    const id = assertFlag(flags, 'id');
    const containers = registry.getContainersForUrl(url);
    const container = containers[id];
    if (!container) {
      return {
        success: false,
        error: `Container ${id} not found for url ${url}`,
      };
    }
    return {
      success: true,
      data: { url, container },
    };
  }
  if (command === 'test') {
    const url = assertFlag(flags, 'url');
    if (!flags.fixture) {
      throw new Error('test command currently requires --fixture <htmlFile>');
    }
    const matcher = new ContainerMatcher();
    const session = createFixtureSessionFromFile(flags.fixture, url);
    const snapshot = await matcher.inspectTree(session as any, { url }, {});
    return {
      success: true,
      data: {
        root_container: snapshot.root_match.container.id,
        match_count: snapshot.matches ? Object.keys(snapshot.matches).length : 0,
      },
    };
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

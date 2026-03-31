#!/usr/bin/env node
import minimist from 'minimist';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCamoEnv } from '../apps/webauto/entry/lib/camo-env.mjs';
import { resolveDefaultProfileId } from '../apps/webauto/entry/lib/profilepool.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const activeChildren = new Set();
let cachedWindowsSessionId = null;

function resolveWindowsSessionIdSync() {
  if (process.platform !== 'win32') return null;
  if (Number.isFinite(cachedWindowsSessionId)) return cachedWindowsSessionId;
  try {
    const psScript = [
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${process.pid}" | Select-Object -First 1 -ExpandProperty SessionId`,
      'if ($null -ne $p) { Write-Output $p }',
    ].join('; ');
    const ret = spawnSync('powershell', ['-NoProfile', '-Command', psScript], {
      encoding: 'utf8',
      timeout: 4_000,
      windowsHide: true,
    });
    if (ret.status !== 0) return null;
    const sid = Number(String(ret.stdout || '').trim());
    cachedWindowsSessionId = Number.isFinite(sid) ? Math.floor(sid) : null;
    return cachedWindowsSessionId;
  } catch {
    return null;
  }
}

function isWindowsSessionZero() {
  const sid = resolveWindowsSessionIdSync();
  return Number.isFinite(sid) && sid === 0;
}

function parsePositiveInt(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function daemonSocketRequest(socketPath, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);
    let timer = setTimeout(() => {
      timer = null;
      client.destroy(new Error(`daemon_request_timeout_${timeoutMs}ms`));
    }, timeoutMs);
    let buffer = '';
    client.on('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    client.on('connect', () => {
      client.write(`${JSON.stringify(payload)}\n`);
    });
    client.on('data', (chunk) => {
      buffer += String(chunk || '');
      const idx = buffer.indexOf('\n');
      if (idx < 0) return;
      const line = buffer.slice(0, idx).trim();
      if (timer) clearTimeout(timer);
      try {
        resolve(JSON.parse(line || '{}'));
      } catch (error) {
        reject(error);
      } finally {
        client.end();
      }
    });
    client.on('close', () => {
      if (timer) clearTimeout(timer);
    });
  });
}

function stopActiveChildrenBestEffort() {
  for (const child of Array.from(activeChildren.values())) {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
}

function createDaemonWorkerSupervisor() {
  const socketPath = String(process.env.WEBAUTO_DAEMON_SOCKET || '').trim();
  const workerId = String(process.env.WEBAUTO_DAEMON_WORKER_ID || '').trim();
  const token = String(process.env.WEBAUTO_DAEMON_WORKER_TOKEN || '').trim();
  const daemonSessionId = Number(process.env.WEBAUTO_DAEMON_SESSION_ID);
  if (!socketPath || !workerId || !token) {
    return {
      stop: async () => {},
    };
  }

  const intervalMs = parsePositiveInt(process.env.WEBAUTO_DAEMON_HEARTBEAT_INTERVAL_MS, 30_000);
  const missLimit = parsePositiveInt(process.env.WEBAUTO_DAEMON_HEARTBEAT_MISS_LIMIT, 3);
  const timeoutMs = Math.min(8_000, Math.max(1_500, Math.floor(intervalMs * 0.6)));
  let misses = 0;
  let closing = false;
  let timer = null;
  const localSessionId = resolveWindowsSessionIdSync();

  const sendWorkerExit = async (source = 'webauto-bin') => {
    try {
      await daemonSocketRequest(socketPath, {
        method: 'worker.exit',
        params: {
          workerId,
          token,
          pid: process.pid,
          source,
          ts: new Date().toISOString(),
        },
      }, timeoutMs);
    } catch {
      // daemon may already be down
    }
  };

  const selfCleanupExit = async (reason) => {
    if (closing) return;
    closing = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    stopActiveChildrenBestEffort();
    await sendWorkerExit(`self_cleanup:${reason}`);
    process.exit(0);
  };

  const ensureSessionMatch = async () => {
    if (process.platform !== 'win32') return true;
    if (!Number.isFinite(daemonSessionId)) return true;
    if (!Number.isFinite(localSessionId)) return true;
    if (daemonSessionId !== localSessionId) {
      await selfCleanupExit('daemon_session_mismatch');
      return false;
    }
    return true;
  };

  const heartbeat = async (source = 'tick') => {
    if (closing) return;
    if (!(await ensureSessionMatch())) return;
    try {
      const ret = await daemonSocketRequest(socketPath, {
        method: 'worker.heartbeat',
        params: {
          workerId,
          token,
          pid: process.pid,
          sessionId: Number.isFinite(localSessionId) ? localSessionId : null,
          source: `webauto-bin:${source}`,
          ts: new Date().toISOString(),
        },
      }, timeoutMs);
      if (ret?.ok) {
        misses = 0;
        if (ret.shuttingDown === true) {
          await selfCleanupExit('daemon_shutting_down');
        }
        return;
      }
      misses += 1;
    } catch {
      misses += 1;
    }
    if (misses >= missLimit) {
      await selfCleanupExit('daemon_heartbeat_lost');
    }
  };

  void heartbeat('init');
  timer = setInterval(() => {
    void heartbeat('interval');
  }, intervalMs);
  timer.unref();

  return {
    stop: async () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (!closing) {
        closing = true;
        await sendWorkerExit('stop');
      }
    },
  };
}

function normalizePathForPlatform(raw, platform = process.platform) {
  const input = String(raw || '').trim();
  const isWinPath = platform === 'win32' || /^[A-Za-z]:[\\/]/.test(input);
  const pathApi = isWinPath ? path.win32 : path;
  return isWinPath ? pathApi.normalize(input) : path.resolve(input);
}

function normalizeLegacyWebautoRoot(raw, platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path;
  const resolved = normalizePathForPlatform(raw, platform);
  const base = pathApi.basename(resolved).toLowerCase();
  return (base === '.webauto' || base === 'webauto')
    ? resolved
    : pathApi.join(resolved, '.webauto');
}

function resolveWebautoHome(env = process.env, platform = process.platform) {
  const explicitHome = String(env.WEBAUTO_HOME || '').trim();
  if (explicitHome) return normalizePathForPlatform(explicitHome, platform);

  const legacyRoot = String(env.WEBAUTO_ROOT || env.WEBAUTO_PORTABLE_ROOT || '').trim();
  if (legacyRoot) return normalizeLegacyWebautoRoot(legacyRoot, platform);

  const homeDir = platform === 'win32'
    ? (env.USERPROFILE || os.homedir())
    : (env.HOME || os.homedir());
  if (platform === 'win32') {
    try {
      if (existsSync('D:\\')) return 'D:\\webauto';
    } catch {
      // ignore drive detection errors
    }
    return path.win32.join(homeDir, '.webauto');
  }
  return path.join(homeDir, '.webauto');
}

function applyDefaultRuntimeEnv() {
  if (!String(process.env.WEBAUTO_REPO_ROOT || '').trim()) {
    process.env.WEBAUTO_REPO_ROOT = ROOT;
  }
  if (
    !String(process.env.WEBAUTO_HOME || '').trim()
    && !String(process.env.WEBAUTO_ROOT || process.env.WEBAUTO_PORTABLE_ROOT || '').trim()
  ) {
    process.env.WEBAUTO_HOME = resolveWebautoHome();
  }
  applyCamoEnv({ env: process.env, repoRoot: ROOT });
}

applyDefaultRuntimeEnv();

function resolveOnPath(candidates) {
  const pathEnv = process.env.PATH || process.env.Path || '';
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of candidates) {
      const full = path.join(dir, name);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

function wrapWindowsRunner(cmdPath, prefix = []) {
  if (process.platform !== 'win32') return { cmd: cmdPath, prefix };
  const lower = String(cmdPath || '').toLowerCase();
  const quotedCmdPath = /\s/.test(String(cmdPath || '')) ? `"${cmdPath}"` : cmdPath;
  if (lower.endsWith('.ps1')) {
    return {
      cmd: 'powershell.exe',
      prefix: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', cmdPath, ...prefix],
    };
  }
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
    return {
      cmd: 'cmd.exe',
      prefix: ['/d', '/s', '/c', quotedCmdPath, ...prefix],
    };
  }
  return { cmd: cmdPath, prefix };
}

function npmRunner() {
  if (process.platform !== 'win32') return { cmd: 'npm', prefix: [] };
  // Always prefer PATH-resolved npm.cmd to avoid space-path quoting issues
  // like "C:\Program Files\..." when invoking via cmd /c.
  return wrapWindowsRunner('npm.cmd');
}

function daemonScriptPath() {
  return path.join(ROOT, 'apps', 'webauto', 'entry', 'daemon.mjs');
}

function readRootVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return String(pkg.version || '').trim() || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const ROOT_VERSION = readRootVersion();

function printMainHelp() {
  console.log(`webauto CLI

Usage:
  webauto               # show help
  webauto --help
  webauto account --help
  webauto profilepool --help
  webauto schedule --help
  webauto deps --help
  webauto daemon --help
  webauto xhs --help

Core Commands:
  webauto account <list|sync|add|get|update|delete|login|sync-alias> [options]
  webauto profilepool <list|add|login|login-profile|goto-profile|migrate-fingerprints> [options]
  webauto schedule <list|get|add|update|delete|import|export|run|run-due|daemon> [options]
  webauto deps <check|auto|install|uninstall|reinstall> [options]
  webauto test [--layer <l0|l1|l2|l3|xhs_collect|all>] [--output <path>] [--json]
  webauto xhs install [--download-browser] [--download-geoip] [--ensure-backend]
  webauto xhs [xhs options...]        # default = unified
  webauto xhs status [--run-id <id>] [--json]
  webauto xhs gate <get|list|set|reset|path> [--platform <name>] [--patch-json <json>] [--json]
  webauto xhs orchestrate [xhs options...]
  webauto version [--json]
  webauto version bump [patch|minor|major]

Build & Release:
  webauto build:dev        # Local link mode
  webauto build:daemon     # Daemon build (isolated / no-op by default)
  webauto build:release    # Full release gate (auto bump patch by default)
  webauto build:release -- --bump minor
  webauto build:release -- --no-bump
  webauto build:release -- --skip-tests
  webauto build:release -- --skip-pack

Examples (standard):
  webauto daemon start
  webauto xhs install --ensure-backend
  webauto xhs login --wait-sync false --idle-timeout off
  webauto daemon task submit --detach -- xhs feed-like --keywords "鍥㈤槦寤鸿,鍥㈠缓绛栧垝,娣卞湷鍥㈠缓,骞夸笢鍥㈠缓"
  webauto xhs status --json
  webauto daemon task list --limit 5
  webauto daemon task stop --job-id <id>
  webauto daemon stop

Tips:
  - xhs commands forward to apps/webauto/entry/xhs-*.mjs
  - account commands forward to apps/webauto/entry/account.mjs
  - schedule commands forward to apps/webauto/entry/schedule.mjs
  - xhs unified/collect/like/feed-like/unlike must run via daemon task submit
  - profile is optional when exactly one default profile exists (profile-0)
  - full options: webauto xhs --help
  - CLI version: ${readRootVersion()}
`);
}


function printTestHelp() {
  console.log(`webauto test

Usage:
  webauto test [--layer <l0|l1|l2|l3|xhs_collect|all>] [--output <path>] [--json]

Options:
  --layer, -l   Which layer(s) to run (default: all)
  --output, -o  JSON report output path (default: ./.tmp/ui-test-report-<timestamp>.json)
  --json        Print JSON report to stdout (summary suppressed)
  --profile     Pass WEBAUTO_TEST_PROFILE to tests
  --keyword     Pass WEBAUTO_TEST_KEYWORD to tests
  --target      Pass WEBAUTO_TEST_TARGET to tests
  --xhs-collect Run collect minimal script (xhs collect)

Examples:
  webauto test
  webauto test --layer l0
  webauto test --layer l0,l1 --output ./.tmp/ui-test-report.json
  webauto test --layer xhs_collect
  webauto test --layer xhs_collect --xhs-collect --profile <id>
  webauto test --json
`);
}

function printDaemonHelp() {
  console.log(`webauto daemon

Usage:
  webauto daemon <start|stop|status|restart|run|task|autostart>
  webauto daemon task submit [--detach|--wait] -- <webauto args...>
  webauto daemon task status --job-id <id>
  webauto daemon task list [--limit <n>] [--status <running|completed|failed|stopped>]
  webauto daemon task stop --job-id <id>
  webauto daemon task delete --job-id <id>

Examples:
  webauto daemon start
  webauto daemon status --json
  webauto daemon task submit --detach -- xhs feed-like --keywords "团队建设,团建策划,深圳团建,广东团建"
  webauto daemon task list --limit 5
  webauto daemon task stop --job-id <id>
  webauto daemon stop
  webauto daemon autostart install
  webauto daemon autostart status --json
`);
}

function printWeiboHelp() {
  console.log(`webauto weibo

Usage:
  webauto weibo collect --profile <id> --keyword <kw> [options...]
  webauto weibo detail --profile <id> --links-file <path> [options...]

Subcommands:
  collect      脙聝脗娄脙聜脗聬脙聜脗聹脙聝脗搂脙聜脗麓脙聜脗垄脙聝脗楼脙聜脗戮脙聜脗庐脙聝脗楼脙聜脗聧脙聜脗職脙聝脗楼脙聜脗鹿脙聜脗露脙聝脗漏脙聜脗聡脙聜脗聡脙聝脗漏脙聜脗聸脙聜脗聠脙聝脗陇脙聜脗赂脙聜脗聧脙聝脗漏脙聜脗聡脙聜脗聧脙聝脗楼脙聜脗陇脙聜脗聧脙聝脗搂脙聜脗職脙聜脗聞脙聝脗漏脙聜脗聯脙聜脗戮脙聝脗娄脙聜脗聨脙聜脗楼脙聝脗漏脙聜脗聸脙聜脗聠脙聝脗楼脙聜脗聬脙聜脗聢脙聝脗炉脙聜脗录脙聜脗聢脙聝脗楼脙聜脗聢脙聜脗聠脙聝脗漏脙聜脗隆脙聜脗碌脙聝脗漏脙聜脗聛脙聜脗聧脙聝脗楼脙聜脗聨脙聜脗聠 + URL 脙聝脗楼脙聜脗聨脙聜脗禄脙聝脗漏脙聜脗聡脙聜脗聧脙聝脗炉脙聜脗录?
  detail       脙聝脗漏脙聜脗聡脙聜脗聡脙聝脗漏脙聜脗聸脙聜脗聠脙聝脗楼脙聜脗戮脙聜脗庐脙聝脗楼脙聜脗聧脙聜脗職脙聝脗楼脙聜脗赂脙聜脗聳脙聝脗楼脙聜脗颅脙聜脗聬脙聝脗篓脙聜脗炉脙聜脗娄脙聝脗娄脙聜脗聝脙聜脗聟脙聝脗炉脙聜脗录脙聜脗聢脙聝脗娄脙聜脗颅脙聜脗拢脙聝脗娄脙聜脗聳脙聜脗聡脙聝脗拢脙聜脗聙脙聜脗聛脙聝脗楼脙聜脗聸脙聜脗戮脙聝脗搂脙聜脗聣脙聜脗聡脙聝脗拢脙聜脗聙脙聜脗聛脙聝脗篓脙聜脗搂脙聜脗聠脙聝脗漏脙聜脗垄脙聜脗聭脙聝脗拢脙聜脗聙脙聜脗聛脙聝脗楼脙聜脗陇脙聜脗聳脙聝脗漏脙聜脗聯脙聜脗戮脙聝脗拢脙聜脗聙脙聜脗聛脙聝脗篓脙聜脗炉脙聜脗聞脙聝脗篓脙聜脗庐脙聜脗潞脙聝脗炉脙聜脗录脙聜脗聣

Required:
  --profile <id>       camo profile ID脙聝脗炉脙聜脗录脙聜脗聢脙聝脗楼脙聜脗驴脙聜脗聟脙聝脗漏脙聜脗隆脙聜脗禄脙聝脗陇脙聜脗赂脙聜脗潞脙聝脗楼脙聜脗路脙聜脗虏脙聝脗搂脙聜脗聶脙聜脗禄脙聝脗楼脙聜脗陆脙聜脗聲脙聝脗搂脙聜脗職脙聜脗聞脙聝脗楼脙聜脗戮脙聜脗庐脙聝脗楼脙聜脗聧脙聜脗職 profile脙聝脗炉脙聜脗录?
  --keyword <kw>       脙聝脗娄脙聜脗聬脙聜脗聹脙聝脗搂脙聜脗麓脙聜脗垄脙聝脗楼脙聜脗聟脙聜脗鲁脙聝脗漏脙聜脗聰脙聜脗庐脙聝脗篓脙聜脗炉?

Options:
  --target <n>         脙聝脗搂脙聜脗聸脙聜脗庐脙聝脗娄脙聜脗聽脙聜脗聡脙聝脗漏脙聜脗聯脙聜脗戮脙聝脗娄脙聜脗聨脙聜脗楼脙聝脗娄脙聜脗聲脙聜脗掳脙聝脗炉脙聜脗录脙聜脗聢脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐脙聜脗陇 10脙聝脗炉脙聜脗录?
  --max-notes <n>      target 脙聝脗楼脙聜脗聢脙聜脗芦脙聝脗楼脙聜脗聬脙聜脗聧
  --max-pages <n>      脙聝脗娄脙聜脗聹脙聜脗聙脙聝脗楼脙聜脗陇脙聜脗搂脙聝脗搂脙聜脗驴脙聜脗禄脙聝脗漏脙聜脗隆脙聜脗碌脙聝脗娄脙聜脗聲脙聜脗掳脙聝脗炉脙聜脗录脙聜脗聢脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐?50脙聝脗炉脙聜脗录?
  --page-delay <ms>    脙聝脗搂脙聜脗驴脙聜脗禄脙聝脗漏脙聜脗隆脙聜脗碌脙聝脗漏脙聜脗聴脙聜脗麓脙聝脗漏脙聜脗職脙聜脗聰脙聝脗炉脙聜脗录脙聜脗聢脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐?2000脙聝脗炉脙聜脗录?
  --env <name>         脙聝脗篓脙聜脗戮脙聜脗聯脙聝脗楼脙聜脗聡脙聜脗潞脙聝脗搂脙聜脗聨脙聜脗炉脙聝脗楼脙聜脗垄脙聜脗聝脙聝脗搂脙聜脗聸脙聜脗庐脙聝脗楼脙聜脗陆脙聜脗聲脙聝脗炉脙聜脗录脙聜脗聢脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐?prod脙聝脗炉脙聜脗录?
  --output-root <p>    脙聝脗篓脙聜脗聡脙聜脗陋脙聝脗楼脙聜脗庐脙聜脗職脙聝脗陇脙聜脗鹿脙聜脗聣脙聝脗篓脙聜脗戮脙聜脗聯脙聝脗楼脙聜脗聡脙聜脗潞脙聝脗娄脙聜脗聽脙聜脗鹿脙聝脗搂脙聜脗聸脙聜脗庐脙聝脗楼脙聜脗陆脙聜脗聲

Output:
  脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐脙聜脗陇脙聝脗搂脙聜脗聸脙聜脗庐脙聝脗楼脙聜脗陆脙聜脗聲: ~/.webauto/download/weibo/<env>/search:<keyword>/
`);
}

function printWeiboDetailHelp() {
  console.log(`webauto weibo detail --profile <id> --links-file <path> [options]

Required:
  --profile <id>          camo profile ID
  --links-file <path>     links.jsonl 脙聝脗娄脙聜脗聳脙聜脗聡脙聝脗陇脙聜脗禄脙聜脗露脙聝脗篓脙聜脗路脙聜脗炉脙聝脗楼脙聜脗戮脙聜脗聞脙聝脗炉脙聜脗录脙聜脗聢weibo collect 脙聝脗搂脙聜脗職脙聜脗聞脙聝脗篓脙聜脗戮脙聜脗聯脙聝脗楼脙聜脗聡脙聜脗潞脙聝脗炉脙聜脗录脙聜脗聣

Options:
  --max-posts <n>         脙聝脗娄脙聜脗聹脙聜脗聙脙聝脗楼脙聜脗陇脙聜脗搂脙聝脗漏脙聜脗聡脙聜脗聡脙聝脗漏脙聜脗聸脙聜脗聠脙聝脗楼脙聜脗赂脙聜脗聳脙聝脗楼脙聜脗颅脙聜脗聬脙聝脗娄脙聜脗聲脙聜脗掳脙聝脗炉脙聜脗录脙聜脗聢脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐?10脙聝脗炉脙聜脗录?
  --content-enabled       脙聝脗漏脙聜脗聡脙聜脗聡脙聝脗漏脙聜脗聸脙聜脗聠脙聝脗娄脙聜脗颅脙聜脗拢脙聝脗娄脙聜脗聳脙聜脗聡脙聝脗炉脙聜脗录脙聜脗聢脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐?true脙聝脗炉脙聜脗录?
  --images-enabled        脙聝脗陇脙聜脗赂脙聜脗聥脙聝脗篓脙聜脗陆脙聜脗陆脙聝脗楼脙聜脗聸脙聜脗戮脙聝脗搂脙聜脗聣脙聜脗聡脙聝脗炉脙聜脗录脙聜脗聢脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐?true脙聝脗炉脙聜脗录?
  --videos-enabled        脙聝脗陇脙聜脗赂脙聜脗聥脙聝脗篓脙聜脗陆脙聜脗陆脙聝脗篓脙聜脗搂脙聜脗聠脙聝脗漏脙聜脗垄脙聜脗聭脙聝脗炉脙聜脗录脙聜脗聢脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐?false脙聝脗炉脙聜脗录?
  --comments-enabled      脙聝脗漏脙聜脗聡脙聜脗聡脙聝脗漏脙聜脗聸脙聜脗聠脙聝脗篓脙聜脗炉脙聜脗聞脙聝脗篓脙聜脗庐脙聜脗潞脙聝脗炉脙聜脗录脙聜脗聢脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐?true脙聝脗炉脙聜脗录?
  --expand-all-replies    脙聝脗楼脙聜脗卤脙聜脗聲脙聝脗楼脙聜脗录脙聜脗聙脙聝脗娄脙聜脗聣脙聜脗聙脙聝脗娄脙聜脗聹脙聜脗聣脙聝脗楼脙聜脗颅脙聜脗聬脙聝脗楼脙聜脗聸脙聜脗聻脙聝脗楼脙聜脗陇脙聜脗聧脙聝脗炉脙聜脗录脙聜脗聢脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐?true脙聝脗炉脙聜脗录?
  --max-comments <n>      脙聝脗篓脙聜脗炉脙聜脗聞脙聝脗篓脙聜脗庐脙聜脗潞脙聝脗娄脙聜脗聲脙聜脗掳脙聝脗漏脙聜脗聡脙聜脗聫脙聝脗陇脙聜脗赂脙聜脗聤脙聝脗漏脙聜脗聶脙聜脗聬脙聝脗炉脙聜脗录?=脙聝脗楼脙聜脗聟脙聜脗篓脙聝脗漏脙聜脗聝脙聜脗篓脙聝脗炉脙聜脗录?
  --post-interval-min-ms  脙聝脗楼脙聜脗赂脙聜脗聳脙聝脗楼脙聜脗颅脙聜脗聬脙聝脗漏脙聜脗聴脙聜脗麓脙聝脗漏脙聜脗職脙聜脗聰脙聝脗娄脙聜脗聹脙聜脗聙脙聝脗楼脙聜脗掳脙聜脗聫脙聝脗楼脙聜脗聙脙聜脗录脙聝脗炉脙聜脗录脙聜脗聢脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐脙聜脗陇 2000脙聝脗炉脙聜脗录?
  --post-interval-max-ms  脙聝脗楼脙聜脗赂脙聜脗聳脙聝脗楼脙聜脗颅脙聜脗聬脙聝脗漏脙聜脗聴脙聜脗麓脙聝脗漏脙聜脗職脙聜脗聰脙聝脗娄脙聜脗聹脙聜脗聙脙聝脗楼脙聜脗陇脙聜脗搂脙聝脗楼脙聜脗聙脙聜脗录脙聝脗炉脙聜脗录脙聜脗聢脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐脙聜脗陇 5000脙聝脗炉脙聜脗录?
  --env <name>            脙聝脗篓脙聜脗戮脙聜脗聯脙聝脗楼脙聜脗聡脙聜脗潞脙聝脗搂脙聜脗聨脙聜脗炉脙聝脗楼脙聜脗垄脙聜脗聝脙聝脗搂脙聜脗聸脙聜脗庐脙聝脗楼脙聜脗陆脙聜脗聲脙聝脗炉脙聜脗录脙聜脗聢脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐?prod脙聝脗炉脙聜脗录?
  --output-root <p>       脙聝脗篓脙聜脗聡脙聜脗陋脙聝脗楼脙聜脗庐脙聜脗職脙聝脗陇脙聜脗鹿脙聜脗聣脙聝脗篓脙聜脗戮脙聜脗聯脙聝脗楼脙聜脗聡脙聜脗潞脙聝脗娄脙聜脗聽脙聜脗鹿脙聝脗搂脙聜脗聸脙聜脗庐脙聝脗楼脙聜脗陆脙聜脗聲
  --keyword <kw>          脙聝脗楼脙聜脗聟脙聜脗鲁脙聝脗漏脙聜脗聰脙聜脗庐脙聝脗篓脙聜脗炉脙聜脗聧脙聝脗炉脙聜脗录脙聜脗聦脙聝脗搂脙聜脗聰脙聜脗篓脙聝脗陇脙聜脗潞脙聜脗聨脙聝脗篓脙聜脗戮脙聜脗聯脙聝脗楼脙聜脗聡脙聜脗潞脙聝脗搂脙聜脗聸脙聜脗庐脙聝脗楼脙聜脗陆脙聜脗聲脙聝脗楼脙聜脗聭脙聜脗陆脙聝脗楼脙聜脗聬脙聜脗聧 (default: detail)
`);
}
function printXhsHelp() {
  console.log(`webauto xhs

Usage:
  webauto xhs install [--download-browser] [--download-geoip] [--ensure-backend] [--install|--reinstall|--uninstall] [--browser|--geoip|--all]
  webauto xhs --keyword <kw> [options...]
  webauto xhs collect --keyword <kw> [options...]
  webauto xhs like --keyword <kw> [options...]
  webauto xhs feed-like --keywords <a,b,c> [options...]
  webauto xhs feed-unlike --keywords <a,b,c> [options...]
  webauto xhs login [options...]
  webauto xhs deps <check|auto|install|uninstall|reinstall> [options...]
  webauto xhs status [--run-id <id>] [--json]
  webauto xhs gate <get|list|set|reset|path> [--platform <name>] [--patch-json <json>] [--json]
  webauto xhs orchestrate --keyword <kw> [options...]

Notes:
  - xhs unified/collect/like/feed-like/unlike must run via daemon task submit
  - profile is optional when exactly one default profile exists
  - default profile naming: profile-0, profile-1, ...

Subcommands:
  install      manage resources (browser/geoip/backend)
  unified      run unified flow (search + detail + comments + likes)
  collect      links-only collection
  like         unified --stage like
  feed-like    unified --stage feed-like
  feed-unlike  unified --stage feed-unlike
  login        open login window via profilepool login-profile
  deps         manage dependencies (alias to webauto deps)
`);
}


function printAccountHelp() {
  console.log(`webauto account

Usage:
  webauto account --help
  webauto account list [--json]
  webauto account list --records [--json]
  webauto account add [--platform <name>] [--alias <alias>] [--name <name>] [--username <username>] [--profile <id>] [--fingerprint <id>] [--json]
  webauto account get <id|alias> [--json]
  webauto account update <id|alias> [--alias <alias>|--clear-alias] [--name <name>] [--username <name>] [--profile <id>] [--fingerprint <id>] [--status active|disabled|archived] [--json]
  webauto account delete <id|alias> [--delete-profile] [--delete-fingerprint] [--json]
  webauto account login <id|alias> [--url <url>] [--sync-alias] [--json]
  webauto account sync-alias <id|alias> [--selector <css>] [--alias <value>] [--json]
  webauto account sync <profileId|all> [--json]

Examples:
  webauto account list
  webauto account sync all
  webauto account list --records
  webauto account login xiaohongshu-batch-1 --url https://www.xiaohongshu.com
`);
}

function printScheduleHelp() {
  console.log(`webauto schedule

Usage:
  webauto schedule --help
  webauto schedule list [--json]
  webauto schedule get <taskId> [--json]
  webauto schedule add [options]
  webauto schedule update <taskId> [options]
  webauto schedule delete <taskId> [--json]
  webauto schedule import [--file <path> | --payload-json <json>] [--json]
  webauto schedule export [taskId] [--file <path>] [--json]
  webauto schedule run <taskId> [--json]
  webauto schedule run-due [--limit <n>] [--json]
  webauto schedule daemon [--interval-sec <n>] [--limit <n>] [--once] [--json]

Examples:
  webauto schedule add --name "deepseek-脙聝脗娄脙聜脗炉?0脙聝脗楼脙聜脗聢脙聜脗聠脙聝脗漏脙聜脗聮脙聜脗聼" --schedule-type interval --interval-minutes 30 --profile xiaohongshu-batch-1 --keyword deepseek --max-notes 100 --do-comments true --do-likes true --like-keywords 脙聝脗搂脙聜脗聣脙聜脗聸脙聝脗漏脙聜脗聙?--env debug
  webauto schedule add --name "脙聝脗娄脙聜脗炉脙聜脗聫脙聝脗楼脙聜脗陇脙聜脗漏脙聝脗娄脙聜脗聴脙聜脗漏脙聝脗陇脙聜脗赂脙聜脗聤脙聝脗陇脙聜脗禄脙聜脗禄脙聝脗楼脙聜脗聤脙聜脗隆" --schedule-type daily --run-at 2026-02-20T09:00:00+08:00 --max-runs 30 --profile xiaohongshu-batch-1 --keyword 脙聝脗楼脙聜脗路脙聜脗楼脙聝脗陇脙聜脗陆脙聜脗聹脙聝脗娄脙聜脗聹?
  webauto schedule add --name "脙聝脗娄脙聜脗炉脙聜脗聫脙聝脗楼脙聜脗聭脙聜脗篓脙聝脗楼脙聜脗路脙聜脗隆脙聝脗娄脙聜脗拢脙聜脗聙" --schedule-type weekly --run-at 2026-02-22T10:30:00+08:00 --max-runs 8 --profile xiaohongshu-batch-1 --keyword deepseek
  webauto schedule list
  webauto schedule run-due --json
  webauto schedule daemon --interval-sec 30
`);
}

function printDepsHelp() {
  console.log(`webauto deps

Usage:
  webauto deps --help
  webauto deps check [--browser|--geoip|--all] [--json]
  webauto deps auto [--browser|--geoip|--all] [--json]
  webauto deps install [--browser|--geoip|--all] [--ensure-backend] [--json]
  webauto deps uninstall [--browser|--geoip|--all] [--json]
  webauto deps reinstall [--browser|--geoip|--all] [--ensure-backend] [--json]

Notes:
  - 脙聝脗陇脙聜脗赂脙聜脗聧脙聝脗娄脙聜脗聦脙聜脗聡脙聝脗楼脙聜脗庐脙聜脗職脙聝脗篓脙聜脗碌脙聜脗聞脙聝脗娄脙聜脗潞脙聜脗聬脙聝脗篓脙聜脗聦脙聜脗聝脙聝脗楼脙聜脗聸脙聜脗麓脙聝脗娄脙聜脗聴脙聜脗露脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐脙聜脗陇 --all
  - install/reinstall 脙聝脗漏脙聜脗禄脙聜脗聵脙聝脗篓脙聜脗庐脙聜脗陇脙聝脗陇脙聜脗录脙聜脗職脙聝脗篓脙聜脗驴脙聜脗陆脙聝脗楼脙聜脗聤?--ensure-backend脙聝脗炉脙聜脗录脙聜脗聢脙聝脗楼脙聜脗聫脙聜脗炉脙聝脗搂脙聜脗聰?--no-ensure-backend 脙聝脗楼脙聜脗聟脙聜脗鲁脙聝脗漏脙聜脗聴脙聜脗颅脙聝脗炉脙聜脗录?
  - auto 脙聝脗娄脙聜脗篓脙聜脗隆脙聝脗楼脙聜脗录脙聜脗聫脙聝脗搂脙聜脗聰脙聜脗篓脙聝脗陇脙聜脗潞脙聜脗聨 npm 脙聝脗楼脙聜脗庐脙聜脗聣脙聝脗篓脙聜脗拢脙聜脗聟脙聝脗楼脙聜脗聬脙聜脗聨脙聝脗篓脙聜脗聡脙聜脗陋脙聝脗楼脙聜脗聤脙聜脗篓脙聝脗篓脙聜脗隆脙聜脗楼脙聝脗漏脙聜脗陆脙聜脗聬脙聝脗搂脙聜脗录脙聜脗潞脙聝脗楼脙聜脗陇脙聜脗卤脙聝脗篓脙聜脗碌脙聜脗聞脙聝脗娄脙聜脗潞?

Examples:
  webauto deps check --all --json
  webauto deps install --all
  webauto deps install --browser --ensure-backend
  webauto deps uninstall --geoip
  webauto deps reinstall --all --json
`);
}

function printVersionHelp() {
  console.log(`webauto version

Usage:
  webauto version [--json]
  webauto version bump [patch|minor|major] [--json]

Examples:
  webauto version
  webauto version --json
  webauto version bump
  webauto version bump minor
`);
}


async function run(cmd, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
      ...options,
    });
    activeChildren.add(child);
    child.on('error', (error) => {
      activeChildren.delete(child);
      reject(error);
    });
    child.on('exit', (code) => {
      activeChildren.delete(child);
      if (code === 0) return resolve();
      if (process.platform === 'win32' && code === 3221226505) {
        console.warn(`[webauto] Ignored spurious exit on Windows (code ${code})`);
        return resolve();
      }
      return reject(new Error(`exit ${code}`));
    });
  });
}

async function runInDir(dir, cmd, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: dir,
      env: process.env,
      stdio: 'inherit',
    });
    activeChildren.add(child);
    child.on('error', (error) => {
      activeChildren.delete(child);
      reject(error);
    });
    child.on('exit', (code) => {
      activeChildren.delete(child);
      if (code === 0) return resolve();
      if (process.platform === 'win32' && code === 3221226505) {
        console.warn(`[webauto] Ignored spurious exit on Windows (code ${code})`);
        return resolve();
      }
      return reject(new Error(`exit ${code}`));
    });
  });
}


async function daemonProxy(rawArgv) {
  const daemonScript = daemonScriptPath();
  const filtered = rawArgv.filter((item) => item !== '--daemon');
 const controlSet = new Set([
   'start',
   'stop',
   'status',
   'restart',
   'run',
   'task',
   'autostart',
   'help',
   '--help',
   '-h',
 ]);
  let daemonArgs = [];
 if (filtered.length === 0) {
    daemonArgs = ['start'];
 } else if (controlSet.has(String(filtered[0] || '').trim().toLowerCase())) {
   daemonArgs = filtered;
 } else {
    console.error(`脙聝脗垄脙聜脗聺?Unknown daemon command: ${filtered[0]}. Use: start|stop|status|restart|run|task|autostart`);
    process.exit(2);
 }
  await run(process.execPath, [daemonScript, ...daemonArgs]);
}

async function main() {
  const rawArgv = process.argv.slice(2);
  const args = minimist(process.argv.slice(2), {
    boolean: ['help', 'skip-tests', 'skip-pack', 'no-bump', 'json', 'daemon'],
    string: ['bump'],
    alias: { h: 'help' },
  });

  const cmd = String(args._[0] || '').trim();
  const sub = String(args._[1] || '').trim();
  const daemonBypass = String(process.env.WEBAUTO_DAEMON_BYPASS || '').trim() === '1';
 const daemonFlag = !daemonBypass && (rawArgv.includes('--daemon') || args.daemon === true);
 const sessionZero = isWindowsSessionZero();

  const getDaemonSubcommand = () => {
    if (cmd === 'daemon') return String(args._[1] || 'start').trim().toLowerCase();
    if (!daemonFlag) return '';
    const filtered = rawArgv.filter((item) => item !== '--daemon');
    return String(filtered[0] || 'start').trim().toLowerCase();
  };

  if (sessionZero) {
   const daemonSub = getDaemonSubcommand();
   const allowedDaemon = new Set([
     'status',
     'stop',
     'task',
     'help',
     '--help',
     '-h',
   ]);
    if (cmd === 'daemon' || daemonFlag) {
      if (!allowedDaemon.has(daemonSub)) {
       console.error('[webauto] Session 0 blocked: daemon start/run must be executed from a non-Session 0 desktop session.');
        console.error('[webauto] If daemon is already running, use: webauto --daemon status.');
        process.exit(2);
      }
    } else {
      const isHelp = args.help === true;
      const isXhsStatus = cmd === 'xhs' && String(sub || '').trim().toLowerCase() === 'status';
      const allowedCmds = new Set(['version', 'deps', 'build:dev', 'build:release', 'build:daemon']);
      if (!isHelp && !isXhsStatus && !allowedCmds.has(cmd)) {
        console.error(`[webauto] Session 0 blocked: ${cmd || 'ui'} is not allowed.`);
        console.error('[webauto] Use a non-Session 0 desktop session to start daemon.');
        process.exit(2);
      }
    }
  }

  if (args.help) {
    if (cmd === 'account') {
      printAccountHelp();
      return;
    }
    if (cmd === 'profilepool') {
      console.log('Usage: webauto profilepool <list|add|login|login-profile|goto-profile|migrate-fingerprints> ...');
      return;
    }
    if (cmd === "weibo") {
      const weiboSub = String(args._[1] || "").trim();
      if (weiboSub === "detail") {
        printWeiboDetailHelp();
        return;
      }
      printWeiboHelp();
      return;
    }

    if (cmd === 'schedule') {
      printScheduleHelp();
      return;
    }
    if (cmd === 'deps') {
      printDepsHelp();
      return;
    }
    if (cmd === 'daemon' || daemonFlag) {
      printDaemonHelp();
      return;
    }
    if (cmd === 'xhs') {
      printXhsHelp();
      return;
    }
    if (cmd === 'version') {
      printVersionHelp();
      return;
    }
    if (cmd === 'test') {
      printTestHelp();
      return;
    }
    printMainHelp();
    return;
  }

 if (!cmd) {
   if (daemonFlag) {
     await daemonProxy(rawArgv);
     return;
   }
    printMainHelp();
    return;
 }

  if (daemonFlag) {
    await daemonProxy(rawArgv);
    return;
  }

  if (cmd === 'daemon') {
    const daemonScript = daemonScriptPath();
    await run(process.execPath, [daemonScript, ...rawArgv.slice(1)]);
    return;
  }
  if (cmd === 'test') {
    const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'test.mjs');
    await run(process.execPath, [script, ...rawArgv.slice(1)]);
    return;
  }

  if (cmd === "weibo") {
    const weiboSub = String(args._[1] || "").trim();
    if (!weiboSub || weiboSub === "help") {
      printWeiboHelp();
      return;
    }
    if (weiboSub === "detail" && (args.help || args.h)) {
      printWeiboDetailHelp();
      return;
    }
    let script;
    if (weiboSub === "detail") {
      script = path.join(ROOT, "apps", "webauto", "entry", "weibo-detail.mjs");
    } else {
      script = path.join(ROOT, "apps", "webauto", "entry", "weibo-collect.mjs");
    }
    await run(process.execPath, [script, ...rawArgv.slice(2)]);
    return;
  }


  if (cmd === 'version') {
    const jsonMode = args.json === true;
    const action = String(args._[1] || '').trim();
    if (!action) {
      const out = { name: '@web-auto/webauto', version: ROOT_VERSION };
      if (jsonMode) console.log(JSON.stringify(out, null, 2));
      else console.log(`@web-auto/webauto v${ROOT_VERSION}`);
      return;
    }
    if (action !== 'bump') {
      console.error(`Unknown version action: ${action}`);
      printVersionHelp();
      process.exit(2);
    }
    const bumpType = String(args._[2] || args.bump || 'patch').trim().toLowerCase();
    if (!['patch', 'minor', 'major'].includes(bumpType)) {
      console.error(`Unsupported bump type: ${bumpType}`);
      process.exit(2);
    }
    const script = path.join(ROOT, 'scripts', 'bump-version.mjs');
    const cmdArgs = [script, bumpType];
    if (jsonMode) cmdArgs.push('--json');
    await run(process.execPath, cmdArgs);
    return;
  }

  // build:dev - local development mode
  if (cmd === 'build:dev') {
   console.log('[webauto] Running local dev setup...');
   const npm = npmRunner();
   await run(npm.cmd, [...npm.prefix, 'run', 'build:services']);
   console.log('[webauto] Dev setup complete');
    return;
  }

  if (cmd === 'build:daemon') {
    console.log('[webauto] Daemon build is isolated and skipped by default (daemon runs from source).');
    return;
  }

  // build:release - prepare for npm publish
  if (cmd === 'build:release') {
    const skipTests = args['skip-tests'] === true;
    const skipPack = args['skip-pack'] === true;
    const noBump = args['no-bump'] === true || args.bump === false;
    const bumpType = String(args.bump || 'patch').trim().toLowerCase();
    if (!['patch', 'minor', 'major'].includes(bumpType)) {
      console.error(`Unsupported --bump value: ${bumpType}`);
      process.exit(2);
    }
    console.log('[webauto] Running release gate...');
    const npm = npmRunner();
    if (!noBump) {
      const bumpScript = path.join(ROOT, 'scripts', 'bump-version.mjs');
      await run(process.execPath, [bumpScript, bumpType]);
    } else {
      console.log('[webauto] Skip version bump (--no-bump)');
    }
    await run(npm.cmd, [...npm.prefix, 'run', 'prebuild']);
    if (!skipTests) {
      await run(npm.cmd, [...npm.prefix, 'run', 'test:ci']);
      await run(npm.cmd, [...npm.prefix, 'run', 'coverage:ci']);
    } else {
      console.log('[webauto] Skipping tests (--skip-tests)');
    }
   await run(npm.cmd, [...npm.prefix, 'run', 'build:services']);
   if (!skipPack) {
     await run(npm.cmd, [...npm.prefix, 'pack', '--dry-run']);
    } else {
      console.log('[webauto] Skipping npm pack validation (--skip-pack)');
    }
   console.log('[webauto] Release gate complete');
    console.log('[webauto] Ready to publish (npm publish --access public)');
   return;
 }

  if (cmd === 'account') {
    const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'account.mjs');
    await run(process.execPath, [script, ...rawArgv.slice(1)]);
    return;
  }
  if (cmd === 'profilepool') {
    const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'profilepool.mjs');
    await run(process.execPath, [script, ...rawArgv.slice(1)]);
    return;
  }

  if (cmd === 'schedule') {
    const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'schedule.mjs');
    await run(process.execPath, [script, ...rawArgv.slice(1)]);
    return;
  }

  if (cmd === 'deps') {
    if (!sub || sub === 'help') {
      printDepsHelp();
      return;
    }
    const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-install.mjs');
    const passthrough = rawArgv.slice(2);
    const hasSelection = passthrough.some((item) => (
      item === '--browser'
      || item === '--geoip'
      || item === '--all'
      || item === '--download-browser'
      || item === '--download-geoip'
    ));
    const disableEnsureBackend = passthrough.includes('--no-ensure-backend');
    const modeArgs = [];
    if (sub === 'check') {
      // keep default mode from xhs-install (check).
    } else if (sub === 'auto') {
      modeArgs.push('--auto');
      if (!hasSelection) modeArgs.push('--all');
    } else if (sub === 'install') {
      modeArgs.push('--install');
      if (!hasSelection) modeArgs.push('--all');
      if (!disableEnsureBackend) modeArgs.push('--ensure-backend');
    } else if (sub === 'uninstall' || sub === 'remove') {
      modeArgs.push('--uninstall');
      if (!hasSelection) modeArgs.push('--all');
    } else if (sub === 'reinstall') {
      modeArgs.push('--reinstall');
      if (!hasSelection) modeArgs.push('--all');
      if (!disableEnsureBackend) modeArgs.push('--ensure-backend');
    } else {
      console.error(`脙聝脗垄脙聜脗聺?脙聝脗娄脙聜脗聹脙聜脗陋脙聝脗搂脙聜脗聼脙聜脗楼 deps 脙聝脗楼脙聜脗颅脙聜脗聬脙聝脗楼脙聜脗聭脙聜脗陆脙聝脗陇脙聜脗禄? ${sub}`);
      printDepsHelp();
      process.exit(2);
    }
    const forwarded = passthrough.filter((item) => item !== '--no-ensure-backend');
    await run(process.execPath, [script, ...modeArgs, ...forwarded]);
    return;
  }

  if (cmd === 'xhs') {
    const subNormalized = String(sub || '').trim().toLowerCase();
    const hasOnlyXhs = rawArgv.length === 1;
    const defaultToUnified = !subNormalized || subNormalized.startsWith('-');
    if (subNormalized === 'help') {
      printXhsHelp();
      return;
    }
    if (defaultToUnified) {
      if (hasOnlyXhs) {
        printXhsHelp();
        return;
      }
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-unified.mjs');
      await run(process.execPath, [script, ...rawArgv.slice(1)]);
      return;
    }

    if (subNormalized === 'install') {
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-install.mjs');
      await run(process.execPath, [script, ...rawArgv.slice(2)]);
      return;
    }

   if (subNormalized === 'collect') {
     const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-collect.mjs');
     await run(process.execPath, [script, ...rawArgv.slice(2)]);
     return;
   }

    if (subNormalized === 'like') {
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-like.mjs');
      await run(process.execPath, [script, ...rawArgv.slice(2)]);
      return;
    }

    if (subNormalized === 'feed-like') {
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-feed-like.mjs');
      await run(process.execPath, [script, ...rawArgv.slice(2)]);
      return;
    }

    if (subNormalized === 'feed-unlike') {
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-feed-unlike.mjs');
      await run(process.execPath, [script, ...rawArgv.slice(2)]);
      return;
    }

      if (subNormalized === 'login') {
        const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'profilepool.mjs');
        const raw = rawArgv.slice(2);
        let profileId = '';
        const forwarded = [];
        const valueFlags = new Set([
          '--profile',
          '-p',
          '--url',
          '--idle-timeout',
          '--timeout-sec',
          '--check-interval-sec',
          '--cookie-interval-ms',
          '--wait-sync',
        ]);
        for (let i = 0; i < raw.length; i += 1) {
          const item = raw[i];
          if (item === '--profile' || item === '-p') {
            profileId = String(raw[i + 1] || '').trim();
            i += 1;
            continue;
          }
          if (valueFlags.has(item)) {
            if (i + 1 < raw.length && !String(raw[i + 1] || '').startsWith('-')) {
              i += 1;
            }
            continue;
          }
          if (!profileId && item && !String(item).startsWith('-')) {
            profileId = String(item || '').trim();
            continue;
          }
          forwarded.push(item);
      }
        if (!profileId) {
          profileId = resolveDefaultProfileId();
        }
        if (!profileId) {
          console.error('missing --profile for xhs login and no default profile found');
          process.exit(2);
        }
      await run(process.execPath, [script, 'login-profile', profileId, ...forwarded]);
      return;
    }

    if (subNormalized === 'deps') {
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-install.mjs');
      const passthrough = rawArgv.slice(3);
      const modeArgs = [];
      const depsSub = passthrough[0] || 'check';
      const hasSelection = passthrough.some((item) => item === '--browser' || item === '--geoip' || item === '--all' || item === '--download-browser' || item === '--download-geoip');
      const disableEnsureBackend = passthrough.includes('--no-ensure-backend');
      if (depsSub === 'check') {}
      else if (depsSub === 'auto') { modeArgs.push('--auto'); if (!hasSelection) modeArgs.push('--all'); }
      else if (depsSub === 'install') { modeArgs.push('--install'); if (!hasSelection) modeArgs.push('--all'); if (!disableEnsureBackend) modeArgs.push('--ensure-backend'); }
      else if (depsSub === 'uninstall' || depsSub === 'remove') { modeArgs.push('--uninstall'); if (!hasSelection) modeArgs.push('--all'); }
      else if (depsSub === 'reinstall') { modeArgs.push('--reinstall'); if (!hasSelection) modeArgs.push('--all'); if (!disableEnsureBackend) modeArgs.push('--ensure-backend'); }
      const forwarded = passthrough.filter((item) => item !== '--no-ensure-backend');
      await run(process.execPath, [script, ...modeArgs, ...forwarded]);
      return;
    }

    if (subNormalized === 'unified' || subNormalized === 'run') {
      if (subNormalized === 'run') {
        process.stderr.write('[deprecated] `xhs run` is deprecated, use `xhs unified` instead\n');
      }
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-unified.mjs');
      await run(process.execPath, [script, ...rawArgv.slice(2)]);
      return;
    }

    if (subNormalized === 'status') {
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-status.mjs');
      await run(process.execPath, [script, ...rawArgv.slice(2)]);
      return;
    }

    if (subNormalized === 'gate') {
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'flow-gate.mjs');
      await run(process.execPath, [script, ...rawArgv.slice(2)]);
      return;
    }

    if (subNormalized === 'orchestrate') {
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-orchestrate.mjs');
      await run(process.execPath, [script, ...rawArgv.slice(2)]);
      return;
    }

    console.error(`脙聝脗垄脙聜脗聺?脙聝脗娄脙聜脗聹脙聜脗陋脙聝脗搂脙聜脗聼脙聜脗楼 xhs 脙聝脗楼脙聜脗颅脙聜脗聬脙聝脗楼脙聜脗聭脙聜脗陆脙聝脗陇脙聜脗禄? ${sub}`);
    printXhsHelp();
    process.exit(2);
  }

  if (cmd === 'dev' && sub === 'install-global') {
    console.error('webauto dev install-global is deprecated; use the new app entry and npm publish flow.');
    process.exit(2);
  }

  printMainHelp();
  process.exit(1);
}

const daemonWorkerSupervisor = createDaemonWorkerSupervisor();

main()
  .then(async () => {
    await daemonWorkerSupervisor.stop();
  })
  .catch(async (err) => {
    await daemonWorkerSupervisor.stop();
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });


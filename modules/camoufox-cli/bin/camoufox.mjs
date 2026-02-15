#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const CONFIG_DIR = path.join(os.homedir(), '.webauto');
const PROFILES_DIR = path.join(CONFIG_DIR, 'profiles');
const CONFIG_FILE = path.join(CONFIG_DIR, 'camoufox-cli.json');
const BROWSER_SERVICE_URL = process.env.WEBAUTO_BROWSER_URL || 'http://127.0.0.1:7704';
const START_SCRIPT_REL = path.join('runtime', 'infra', 'utils', 'scripts', 'service', 'start-browser-service.mjs');
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJson(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(p, data) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function loadConfig() {
  const raw = readJson(CONFIG_FILE) || {};
  return {
    defaultProfile: typeof raw.defaultProfile === 'string' ? raw.defaultProfile : null,
    repoRoot: typeof raw.repoRoot === 'string' ? raw.repoRoot : null,
  };
}

function saveConfig(config) {
  writeJson(CONFIG_FILE, config);
}

function listProfiles() {
  if (!fs.existsSync(PROFILES_DIR)) return [];
  return fs.readdirSync(PROFILES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => !name.includes(':') && !name.includes('/') && !name.startsWith('.'))
    .sort();
}

function isValidProfileId(profileId) {
  return typeof profileId === 'string' && /^[a-zA-Z0-9._-]+$/.test(profileId);
}

function createProfile(profileId) {
  if (!isValidProfileId(profileId)) {
    throw new Error('Invalid profileId. Use only letters, numbers, dot, underscore, dash.');
  }
  const profileDir = path.join(PROFILES_DIR, profileId);
  if (fs.existsSync(profileDir)) throw new Error(`Profile already exists: ${profileId}`);
  ensureDir(profileDir);
}

function deleteProfile(profileId) {
  const profileDir = path.join(PROFILES_DIR, profileId);
  if (!fs.existsSync(profileDir)) throw new Error(`Profile not found: ${profileId}`);
  fs.rmSync(profileDir, { recursive: true, force: true });
}

function setDefaultProfile(profileId) {
  const cfg = loadConfig();
  cfg.defaultProfile = profileId;
  saveConfig(cfg);
}

function setRepoRoot(repoRoot) {
  const cfg = loadConfig();
  cfg.repoRoot = repoRoot;
  saveConfig(cfg);
}

function getDefaultProfile() {
  return loadConfig().defaultProfile;
}

function hasStartScript(root) {
  if (!root) return false;
  return fs.existsSync(path.join(root, START_SCRIPT_REL));
}

function walkUpForRepoRoot(startDir) {
  if (!startDir) return null;
  let cursor = path.resolve(startDir);
  for (;;) {
    if (hasStartScript(cursor)) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

function scanCommonRepoRoots() {
  const home = os.homedir();
  const roots = [
    path.join(home, 'Documents', 'github'),
    path.join(home, 'github'),
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!entry.name.toLowerCase().includes('webauto')) continue;
        const candidate = path.join(root, entry.name);
        if (hasStartScript(candidate)) return candidate;
      }
    } catch {
      // ignore scanning errors and continue
    }
  }

  return null;
}

function looksLikeUrlToken(token) {
  if (!token || typeof token !== 'string') return false;
  if (token.includes('://')) return true;
  return /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+/.test(token);
}

function detectCamoufoxPath() {
  try {
    const out = execSync('python3 -m camoufox path', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const lines = out.trim().split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      if (line && line.startsWith('/')) return line;
    }
  } catch {
    return null;
  }
  return null;
}

function ensureCamoufox() {
  if (detectCamoufoxPath()) return;
  console.log('Camoufox is not found. Installing...');
  execSync('npx --yes --package=camoufox camoufox fetch', { stdio: 'inherit' });
  if (!detectCamoufoxPath()) {
    throw new Error('Camoufox install finished but executable was not detected');
  }
  console.log('Camoufox installed.');
}

async function checkBrowserService() {
  try {
    const r = await fetch(`${BROWSER_SERVICE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

function findRepoRootCandidate() {
  const cfg = loadConfig();
  const candidates = [
    process.env.WEBAUTO_REPO_ROOT,
    cfg.repoRoot,
    process.cwd(),
    path.resolve(CURRENT_DIR, '../../..'),
    path.join(os.homedir(), 'Documents', 'github', 'webauto'),
    path.join(os.homedir(), 'github', 'webauto'),
  ].filter(Boolean);

  for (const root of candidates) {
    if (hasStartScript(root)) {
      if (cfg.repoRoot !== root) {
        setRepoRoot(root);
      }
      return root;
    }
  }

  for (const startDir of [process.cwd(), CURRENT_DIR]) {
    const found = walkUpForRepoRoot(startDir);
    if (found) {
      if (cfg.repoRoot !== found) {
        setRepoRoot(found);
      }
      return found;
    }
  }

  const scanned = scanCommonRepoRoots();
  if (scanned) {
    if (cfg.repoRoot !== scanned) {
      setRepoRoot(scanned);
    }
    return scanned;
  }

  return null;
}

async function ensureBrowserService() {
  if (await checkBrowserService()) return;

  const repoRoot = findRepoRootCandidate();
  if (!repoRoot) {
    throw new Error(
      `Cannot locate browser-service start script (${START_SCRIPT_REL}). ` +
      'Run from webauto repo once or set WEBAUTO_REPO_ROOT=/path/to/webauto.',
    );
  }

  const scriptPath = path.join(repoRoot, START_SCRIPT_REL);
  console.log('Starting browser-service daemon...');
  execSync(`node "${scriptPath}"`, { stdio: 'inherit', cwd: repoRoot });

  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 400));
    if (await checkBrowserService()) {
      console.log('Browser-service is ready.');
      return;
    }
  }

  throw new Error('Browser-service failed to become healthy within timeout');
}

async function callAPI(action, payload = {}) {
  const r = await fetch(`${BROWSER_SERVICE_URL}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args: payload }),
  });

  let body;
  try {
    body = await r.json();
  } catch {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text}`);
  }

  if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
  return body;
}

async function getSessionByProfile(profileId) {
  const status = await callAPI('getStatus', {});
  return status?.sessions?.find((s) => s.profileId === profileId) || null;
}

function resolveProfileId(args, argIndex = 1) {
  let profileId = args[argIndex];
  if (!profileId) {
    profileId = getDefaultProfile();
  }
  return profileId;
}

function ensureUrlScheme(rawUrl) {
  if (typeof rawUrl !== 'string') return rawUrl;
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function printHelp() {
  console.log(`
camo CLI - Camoufox browser controller

USAGE:
  camo <command> [options]

PROFILE MANAGEMENT:
  profiles                                  List profiles with default profile
  profile [list]                            List profiles (same as profiles)
  profile create <profileId>                Create a profile
  profile delete <profileId>                Delete a profile
  profile default [profileId]               Get or set default profile

CONFIG:
  config repo-root [path]                   Get or set persisted webauto repo root

BROWSER CONTROL:
  init                                      Ensure camoufox + ensure browser-service daemon
  start [profileId] [--url <url>] [--headless]
  stop [profileId]
  status [profileId]
  list                                      Alias of status

NAVIGATION:
  goto [profileId] <url>                    Navigate to URL (uses default if profileId omitted)
  back [profileId]                          Navigate back (uses default)
  screenshot [profileId] [--output <file>] [--full]

INTERACTION:
  scroll [profileId] [--down|--up|--left|--right] [--amount <px>]  Scroll page (default: down 300px)
  click [profileId] <selector>                                    Click element by CSS selector
  type [profileId] <selector> <text>                              Type text into element
  highlight [profileId] <selector>                                Highlight element (red border, 2s)
  clear-highlight [profileId]                                     Clear all highlights
  viewport [profileId] --width <w> --height <h>                   Set viewport size

PAGES:
  new-page [profileId] [--url <url>]
  close-page [profileId] [index]
  switch-page [profileId] <index>
  list-pages [profileId]

SYSTEM:
  shutdown                                  Shutdown browser-service
  help

EXAMPLES:
  camo init
  camo profile create myprofile
  camo profile default myprofile
  camo config repo-root /Users/you/Documents/github/webauto
  camo start --url https://example.com
  camo goto https://www.xiaohongshu.com     # uses default profile
  camo goto myprofile https://example.com     # explicit profile
  camo screenshot --output /tmp/shot.png
  camo scroll --down --amount 500
  camo click "#search-input"
  camo type "#search-input" "hello world"
  camo highlight ".post-card"
  camo viewport --width 1920 --height 1080
  camo stop

ENV:
  WEBAUTO_BROWSER_URL                       Default: http://127.0.0.1:7704
  WEBAUTO_REPO_ROOT                         Optional explicit webauto repo root
`);
}

function printProfilesAndHint() {
  const profiles = listProfiles();
  const defaultProfile = getDefaultProfile();
  console.log(JSON.stringify({ ok: true, profiles, defaultProfile, count: profiles.length }, null, 2));
  console.log('\nRun \`camo help\` for usage.');
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd) {
    printProfilesAndHint();
    return;
  }

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  if (cmd === 'profiles') {
    const profiles = listProfiles();
    const defaultProfile = getDefaultProfile();
    console.log(JSON.stringify({ ok: true, profiles, defaultProfile, count: profiles.length }, null, 2));
    return;
  }

  if (cmd === 'profile') {
    const sub = args[1];
    const profileId = args[2];

    if (sub === 'list' || !sub) {
      const profiles = listProfiles();
      const defaultProfile = getDefaultProfile();
      console.log(JSON.stringify({ ok: true, profiles, defaultProfile, count: profiles.length }, null, 2));
      return;
    }

    if (sub === 'create') {
      if (!profileId) throw new Error('Usage: camo profile create <profileId>');
      createProfile(profileId);
      console.log(`Created profile: ${profileId}`);
      return;
    }

    if (sub === 'delete' || sub === 'remove') {
      if (!profileId) throw new Error('Usage: camo profile delete <profileId>');
      deleteProfile(profileId);
      const cfg = loadConfig();
      if (cfg.defaultProfile === profileId) {
        cfg.defaultProfile = null;
        saveConfig(cfg);
      }
      console.log(`Deleted profile: ${profileId}`);
      return;
    }

    if (sub === 'default') {
      if (!profileId) {
        console.log(JSON.stringify({ ok: true, defaultProfile: getDefaultProfile() }, null, 2));
        return;
      }
      const profiles = listProfiles();
      if (!profiles.includes(profileId)) throw new Error(`Profile not found: ${profileId}`);
      setDefaultProfile(profileId);
      console.log(`Default profile set to: ${profileId}`);
      return;
    }

    throw new Error('Usage: camo profile <list|create|delete|default> [profileId]');
  }

  if (cmd === 'config') {
    const sub = args[1];
    if (sub !== 'repo-root') {
      throw new Error('Usage: camo config repo-root [path]');
    }
    const repoRoot = args[2];
    if (!repoRoot) {
      console.log(JSON.stringify({ ok: true, repoRoot: loadConfig().repoRoot }, null, 2));
      return;
    }
    const resolved = path.resolve(repoRoot);
    if (!hasStartScript(resolved)) {
      throw new Error(`Invalid repo root: ${resolved} (missing ${START_SCRIPT_REL})`);
    }
    setRepoRoot(resolved);
    console.log(JSON.stringify({ ok: true, repoRoot: resolved }, null, 2));
    return;
  }

  if (cmd === 'init') {
    ensureCamoufox();
    await ensureBrowserService();
    const profiles = listProfiles();
    const defaultProfile = getDefaultProfile();
    console.log(JSON.stringify({ ok: true, profiles, defaultProfile, count: profiles.length }, null, 2));
    return;
  }

  const serviceCommands = new Set([
    'start', 'stop', 'close', 'status', 'list', 'goto', 'navigate', 'back', 'screenshot',
    'new-page', 'close-page', 'switch-page', 'list-pages', 'shutdown',
    'scroll', 'click', 'type', 'highlight', 'clear-highlight', 'viewport',
  ]);

  if (!serviceCommands.has(cmd)) {
    throw new Error(`Unknown command: ${cmd}`);
  }

  if (cmd === 'start') {
    ensureCamoufox();
  }
  await ensureBrowserService();

  if (cmd === 'start') {
    // Use --url to find URL, everything else is profile or flags
    const urlIdx = args.indexOf('--url');
    const explicitUrl = urlIdx >= 0 ? args[urlIdx + 1] : undefined;
    const profileSet = new Set(listProfiles());
    let implicitUrl;
    
    // Find profileId: non-flag, non-url arg
    let profileId = null;
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--url') { i++; continue; }
      if (arg === '--headless') continue;
      if (arg.startsWith('--')) continue;

      if (looksLikeUrlToken(arg) && !profileSet.has(arg)) {
        implicitUrl = arg;
        continue;
      }

      profileId = arg;
      break;
    }
    
    if (!profileId) {
      profileId = getDefaultProfile();
      if (!profileId) {
        throw new Error('No default profile set. Run: camo profile default <profileId>');
      }
    }

    const existing = await getSessionByProfile(profileId);
    if (existing) {
      console.log(JSON.stringify({
        ok: true,
        sessionId: existing.session_id || existing.profileId,
        profileId,
        message: 'Session already running',
        url: existing.current_url,
      }, null, 2));
      return;
    }

    const headless = args.includes('--headless');
    const targetUrl = explicitUrl || implicitUrl;
    const result = await callAPI('start', {
      profileId,
      url: targetUrl ? ensureUrlScheme(targetUrl) : undefined,
      headless,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'stop' || cmd === 'close') {
    const profileId = resolveProfileId(args, 1);
    if (!profileId) throw new Error('Usage: camo stop [profileId]');
    const result = await callAPI('stop', { profileId });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'status' || cmd === 'list') {
    const result = await callAPI('getStatus', {});
    const profileId = args[1];
    if (profileId && cmd === 'status') {
      const session = result?.sessions?.find((s) => s.profileId === profileId) || null;
      console.log(JSON.stringify({ ok: true, session }, null, 2));
      return;
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'goto' || cmd === 'navigate') {
    const positionals = args.slice(1).filter((token) => token && !token.startsWith('--'));

    let profileId;
    let url;

    if (positionals.length === 1) {
      profileId = getDefaultProfile();
      url = positionals[0];
    } else {
      profileId = resolveProfileId(positionals, 0);
      url = positionals[1];
    }

    if (!profileId) throw new Error('Usage: camo goto [profileId] <url> (or set default profile first)');
    if (!url) throw new Error('Usage: camo goto [profileId] <url>');
    const result = await callAPI('goto', { profileId, url: ensureUrlScheme(url) });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'back') {
    const profileId = resolveProfileId(args, 1);
    if (!profileId) throw new Error('Usage: camo back [profileId] (or set default profile first)');
    const result = await callAPI('page:back', { profileId });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'screenshot') {
    // Screenshot is special: args are [--full] [--output <file>] [profileId]
    // We need to distinguish flags from profileId
    const fullPage = args.includes('--full');
    const outputIdx = args.indexOf('--output');
    const output = outputIdx >= 0 ? args[outputIdx + 1] : null;
    
    // Find profileId: it's the non-flag arg that's not the output value
    let profileId = null;
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--full') continue;
      if (arg === '--output') {
        i++; // skip the output value
        continue;
      }
      if (arg.startsWith('--')) continue;
      profileId = arg;
      break;
    }
    
    if (!profileId) {
      profileId = getDefaultProfile();
    }
    
    if (!profileId) throw new Error('Usage: camo screenshot [profileId] [--output <file>] [--full]');
    const result = await callAPI('screenshot', { profileId, fullPage });

    if (output && result?.data) {
      fs.writeFileSync(output, Buffer.from(result.data, 'base64'));
      console.log(`Screenshot saved to ${output}`);
      return;
    }

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'scroll') {
    const profileId = resolveProfileId(args, 1);
    if (!profileId) throw new Error('Usage: camo scroll [profileId] [--down|--up|--left|--right] [--amount <px>]');

    const direction =
      args.includes('--up') ? 'up' :
      args.includes('--left') ? 'left' :
      args.includes('--right') ? 'right' : 'down';

    const amountIdx = args.indexOf('--amount');
    const amount = amountIdx >= 0 ? Number(args[amountIdx + 1]) || 300 : 300;

    const result = await callAPI('mouse:wheel', { profileId, deltaX: direction === 'left' ? -amount : direction === 'right' ? amount : 0, deltaY: direction === 'up' ? -amount : direction === 'down' ? amount : 0 });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'click') {
    const positionals = args.slice(1).filter((a) => a && !a.startsWith('--'));
    let profileId;
    let selector;

    if (positionals.length === 1) {
      profileId = getDefaultProfile();
      selector = positionals[0];
    } else {
      profileId = positionals[0];
      selector = positionals[1];
    }

    if (!profileId) throw new Error('Usage: camo click [profileId] <selector>');
    if (!selector) throw new Error('Usage: camo click [profileId] <selector>');

    const result = await callAPI('evaluate', {
      profileId,
      script: `(async () => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Element not found: ' + ${JSON.stringify(selector)});
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 200));
        el.click();
        return { clicked: true, selector: ${JSON.stringify(selector)} };
      })()`
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'type') {
    const positionals = args.slice(1).filter((a) => a && !a.startsWith('--'));
    let profileId;
    let selector;
    let text;

    if (positionals.length === 2) {
      profileId = getDefaultProfile();
      selector = positionals[0];
      text = positionals[1];
    } else {
      profileId = positionals[0];
      selector = positionals[1];
      text = positionals[2];
    }

    if (!profileId) throw new Error('Usage: camo type [profileId] <selector> <text>');
    if (!selector || text === undefined) throw new Error('Usage: camo type [profileId] <selector> <text>');

    const result = await callAPI('evaluate', {
      profileId,
      script: `(async () => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Element not found: ' + ${JSON.stringify(selector)});
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 200));
        el.focus();
        el.value = '';
        el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { typed: true, selector: ${JSON.stringify(selector)}, length: ${text.length} };
      })()`
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'highlight') {
    const positionals = args.slice(1).filter((a) => a && !a.startsWith('--'));
    let profileId;
    let selector;

    if (positionals.length === 1) {
      profileId = getDefaultProfile();
      selector = positionals[0];
    } else {
      profileId = positionals[0];
      selector = positionals[1];
    }

    if (!profileId) throw new Error('Usage: camo highlight [profileId] <selector>');
    if (!selector) throw new Error('Usage: camo highlight [profileId] <selector>');

    const result = await callAPI('evaluate', {
      profileId,
      script: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Element not found: ' + ${JSON.stringify(selector)});
        const prev = el.style.outline;
        el.style.outline = '3px solid #ff4444';
        setTimeout(() => { el.style.outline = prev; }, 2000);
        const rect = el.getBoundingClientRect();
        return { highlighted: true, selector: ${JSON.stringify(selector)}, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
      })()`
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'clear-highlight') {
    const profileId = resolveProfileId(args, 1);
    if (!profileId) throw new Error('Usage: camo clear-highlight [profileId]');

    const result = await callAPI('evaluate', {
      profileId,
      script: `(() => {
        const overlay = document.getElementById('webauto-highlight-overlay');
        if (overlay) overlay.remove();
        document.querySelectorAll('[data-webauto-highlight]').forEach(el => {
          el.style.outline = el.dataset.webautoHighlight || '';
          delete el.dataset.webautoHighlight;
        });
        return { cleared: true };
      })()`
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'viewport') {
    const profileId = resolveProfileId(args, 1);
    if (!profileId) throw new Error('Usage: camo viewport [profileId] --width <w> --height <h>');

    const widthIdx = args.indexOf('--width');
    const heightIdx = args.indexOf('--height');
    const width = widthIdx >= 0 ? Number(args[widthIdx + 1]) : 1280;
    const height = heightIdx >= 0 ? Number(args[heightIdx + 1]) : 800;

    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error('Usage: camo viewport [profileId] --width <w> --height <h>');
    }

    const result = await callAPI('page:setViewport', { profileId, width, height });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'new-page') {
    const profileId = resolveProfileId(args, 1);
    if (!profileId) throw new Error('Usage: camo new-page [profileId] [--url <url>] (or set default profile first)');
    const urlIdx = args.indexOf('--url');
    const url = urlIdx >= 0 ? args[urlIdx + 1] : undefined;
    const result = await callAPI('newPage', { profileId, ...(url ? { url: ensureUrlScheme(url) } : {}) });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'close-page') {
    const profileId = resolveProfileId(args, 1);
    if (!profileId) throw new Error('Usage: camo close-page [profileId] [index] (or set default profile first)');
    
    // Find index: it's the last numeric non-flag arg
    let index;
    for (let i = args.length - 1; i >= 1; i--) {
      const arg = args[i];
      if (arg.startsWith('--')) continue;
      const num = Number(arg);
      if (Number.isFinite(num)) {
        index = num;
        break;
      }
    }
    
    const result = await callAPI('page:close', { profileId, ...(Number.isFinite(index) ? { index } : {}) });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'switch-page') {
    const profileId = resolveProfileId(args, 1);
    if (!profileId) throw new Error('Usage: camo switch-page [profileId] <index> (or set default profile first)');
    
    // Find index: it's the last numeric non-flag arg
    let index;
    for (let i = args.length - 1; i >= 1; i--) {
      const arg = args[i];
      if (arg.startsWith('--')) continue;
      const num = Number(arg);
      if (Number.isFinite(num)) {
        index = num;
        break;
      }
    }
    
    if (!Number.isFinite(index)) throw new Error('Usage: camo switch-page [profileId] <index>');
    const result = await callAPI('page:switch', { profileId, index });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'list-pages') {
    const profileId = resolveProfileId(args, 1);
    if (!profileId) throw new Error('Usage: camo list-pages [profileId] (or set default profile first)');
    const result = await callAPI('page:list', { profileId });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'shutdown') {
    const result = await callAPI('service:shutdown', {});
    console.log(JSON.stringify(result, null, 2));
    return;
  }
}

main().catch((err) => {
  console.error(`Error: ${err?.message || String(err)}`);
  process.exit(1);
});

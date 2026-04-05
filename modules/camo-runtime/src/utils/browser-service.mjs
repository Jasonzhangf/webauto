#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { BROWSER_SERVICE_URL, loadConfig, setRepoRoot } from './config.mjs';

const requireFromHere = createRequire(import.meta.url);
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
// Timeout logic unified in shared/api-client.mjs (single source of truth)

function resolveNodeBin() {
  const explicit = String(process.env.CAMO_NODE_BIN || '').trim();
  if (explicit) return explicit;
  const npmNode = String(process.env.npm_node_execpath || '').trim();
  if (npmNode) return npmNode;
  return process.execPath;
}

function resolveCamoCliEntry() {
  try {
    const resolved = requireFromHere.resolve('@web-auto/camo/bin/camo.mjs');
    if (resolved && fs.existsSync(resolved)) return resolved;
  } catch {
    return null;
  }
  return null;
}

function runCamoCli(args = [], options = {}) {
  const entry = resolveCamoCliEntry();
  if (!entry) {
    return {
      ok: false,
      code: null,
      stdout: '',
      stderr: '@web-auto/camo/bin/camo.mjs not found',
      entry: null,
    };
  }
  const ret = spawnSync(resolveNodeBin(), [entry, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    stdio: options.stdio || 'pipe',
    env: { ...process.env, ...(options.env || {}) },
  });
  return {
    ok: ret.status === 0,
    code: ret.status,
    stdout: String(ret.stdout || ''),
    stderr: String(ret.stderr || ''),
    entry,
  };
}

import { callAPI } from '../autoscript/shared/api-client.mjs';
export { callAPI };

export async function getSessionByProfile(profileId) {
  const status = await callAPI('getStatus', {});
  const activeSession = status?.sessions?.find((s) => s.profileId === profileId) || null;
  if (activeSession) {
    return activeSession;
  }
  if (!profileId) {
    return null;
  }

  // Some browser-service builds do not populate getStatus.sessions reliably.
  // Fallback to page:list so runtime can still attach to an active profile tab set.
  try {
    const pagePayload = await callAPI('page:list', { profileId });
    const pages = Array.isArray(pagePayload?.pages)
      ? pagePayload.pages
      : Array.isArray(pagePayload?.data?.pages)
        ? pagePayload.data.pages
        : [];
    if (!pages.length) return null;
    const activeIndex = Number(pagePayload?.activeIndex ?? pagePayload?.data?.activeIndex);
    const activePage = Number.isFinite(activeIndex)
      ? pages.find((page) => Number(page?.index) === activeIndex)
      : (pages.find((page) => page?.active) || pages[0]);
    return {
      profileId,
      session_id: profileId,
      sessionId: profileId,
      current_url: activePage?.url || null,
      recoveredFromPages: true,
    };
  } catch {
    return null;
  }
}

function buildDomSnapshotScript(maxDepth, maxChildren) {
  return `(() => {
    const MAX_DEPTH = ${maxDepth};
    const MAX_CHILDREN = ${maxChildren};
    const viewportWidth = Number(window.innerWidth || 0);
    const viewportHeight = Number(window.innerHeight || 0);

    const normalizeRect = (rect) => {
      if (!rect) return null;
      const left = Number(rect.left ?? rect.x ?? 0);
      const top = Number(rect.top ?? rect.y ?? 0);
      const width = Number(rect.width ?? 0);
      const height = Number(rect.height ?? 0);
      return {
        left,
        top,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        width,
        height,
      };
    };

    const sanitizeClasses = (el) => {
      const classAttr = typeof el.className === 'string'
        ? el.className
        : (el.getAttribute && el.getAttribute('class')) || '';
      return classAttr.split(/\\s+/).filter(Boolean).slice(0, 24);
    };

    const collectAttrs = (el) => {
      if (!el || !el.getAttribute) return null;
      const keys = [
        'href',
        'src',
        'name',
        'type',
        'value',
        'placeholder',
        'role',
        'aria-label',
        'aria-hidden',
        'title',
      ];
      const attrs = {};
      for (const key of keys) {
        const value = el.getAttribute(key);
        if (value === null || value === undefined || value === '') continue;
        attrs[key] = String(value).slice(0, 400);
      }
      return Object.keys(attrs).length > 0 ? attrs : null;
    };

    const inViewport = (rect) => {
      if (!rect) return false;
      if (rect.width <= 0 || rect.height <= 0) return false;
      return (
        rect.right > 0
        && rect.bottom > 0
        && rect.left < viewportWidth
        && rect.top < viewportHeight
      );
    };

    const isRendered = (el) => {
      try {
        const style = window.getComputedStyle(el);
        if (!style) return false;
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        const opacity = Number.parseFloat(String(style.opacity || '1'));
        if (Number.isFinite(opacity) && opacity <= 0.01) return false;
        return true;
      } catch {
        return false;
      }
    };

    const clampPoint = (value, max) => {
      if (!Number.isFinite(value)) return 0;
      if (max <= 1) return 0;
      return Math.max(0, Math.min(max - 1, value));
    };

    const hitTestVisible = (el, rect) => {
      if (!rect || viewportWidth <= 0 || viewportHeight <= 0) return false;
      const samplePoints = [
        [rect.left + rect.width * 0.5, rect.top + rect.height * 0.5],
        [rect.left + rect.width * 0.2, rect.top + rect.height * 0.2],
        [rect.left + rect.width * 0.8, rect.top + rect.height * 0.8],
      ];
      for (const [rawX, rawY] of samplePoints) {
        const x = clampPoint(rawX, viewportWidth);
        const y = clampPoint(rawY, viewportHeight);
        const topEl = document.elementFromPoint(x, y);
        if (!topEl) continue;
        if (topEl === el) return true;
        if (el.contains && el.contains(topEl)) return true;
        if (topEl.contains && topEl.contains(el)) return true;
      }
      return false;
    };

    const collect = (el, depth = 0, path = 'root') => {
      if (!el || depth > MAX_DEPTH) return null;
      const classes = sanitizeClasses(el);
      const rect = normalizeRect(el.getBoundingClientRect ? el.getBoundingClientRect() : null);
      const tag = String(el.tagName || el.nodeName || '').toLowerCase();
      const id = el.id || null;
      const text = typeof el.textContent === 'string'
        ? el.textContent.replace(/\\s+/g, ' ').trim()
        : '';
      const selector = tag
        ? \`\${tag}\${id ? '#' + id : ''}\${classes.length ? '.' + classes.slice(0, 3).join('.') : ''}\`
        : null;

      const node = {
        tag,
        id,
        classes,
        selector,
        path,
      };
      const attrs = collectAttrs(el);
      if (attrs) node.attrs = attrs;
      if (attrs && attrs.href) node.href = attrs.href;
      if (rect) node.rect = rect;
      if (text) node.textSnippet = text.slice(0, 120);
      if (rect) {
        const rendered = isRendered(el);
        const withinViewport = inViewport(rect);
        const visible = rendered && withinViewport && hitTestVisible(el, rect);
        node.visible = visible;
      } else {
        node.visible = false;
      }

      const children = Array.from(el.children || []);
      if (children.length > 0 && depth < MAX_DEPTH) {
        node.children = [];
        const limit = Math.min(children.length, MAX_CHILDREN);
        for (let i = 0; i < limit; i += 1) {
          const child = collect(children[i], depth + 1, \`\${path}/\${i}\`);
          if (child) node.children.push(child);
        }
      }

      return node;
    };

    const root = collect(document.body || document.documentElement, 0, 'root');
    return {
      dom_tree: root,
      current_url: String(window.location.href || ''),
      viewport: {
        width: viewportWidth,
        height: viewportHeight,
      },
    };
  })()`;
}

export async function getDomSnapshotByProfile(profileId, options = {}) {
  // XHS detail comments place `.show-more` around depth 14 from `body`.
  // Keeping the default at 10 truncates reply controls out of the snapshot.
  const maxDepth = Math.max(1, Math.min(20, Number(options.maxDepth) || 16));
  const maxChildren = Math.max(1, Math.min(500, Number(options.maxChildren) || 120));
  const response = await callAPI('evaluate', {
    profileId,
    script: buildDomSnapshotScript(maxDepth, maxChildren),
  });
  const payload = response?.result || response || {};
  const tree = payload.dom_tree || null;
  if (tree && payload.viewport && typeof payload.viewport === 'object') {
    tree.__viewport = {
      width: Number(payload.viewport.width) || 0,
      height: Number(payload.viewport.height) || 0,
    };
  }
  if (tree && payload.current_url) {
    tree.__url = String(payload.current_url);
  }
  return tree;
}

export async function getViewportByProfile(profileId) {
  const response = await callAPI('evaluate', {
    profileId,
    script: `(() => ({ width: Number(window.innerWidth || 0), height: Number(window.innerHeight || 0) }))()`,
  });
  const viewport = response?.result || response?.viewport || {};
  const width = Number(viewport?.width) || 1280;
  const height = Number(viewport?.height) || 720;
  return { width, height };
}

export async function checkBrowserService() {
  try {
    const r = await fetch(`${BROWSER_SERVICE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

function hasContainerLibrary(repoRoot) {
  if (!repoRoot) return false;
  const root = path.resolve(String(repoRoot));
  const candidates = [
    path.join(root, 'container-library'),
    path.join(root, 'resources', 'container-library'),
    path.join(root, 'apps', 'resources', 'container-library'),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

function walkUpForRepoRoot(startDir) {
  if (!startDir) return null;
  let cursor = path.resolve(startDir);
  for (;;) {
    if (hasContainerLibrary(cursor)) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

function scanCommonRepoRoots() {
  const home = os.homedir();
  const customRoots = String(process.env.CAMO_REPO_ROOTS || '').trim();
  const extraRoots = customRoots
    ? customRoots.split(path.delimiter).map((item) => item.trim()).filter(Boolean)
    : [];
  const roots = [
    ...extraRoots,
    path.join(home, 'Documents', 'github'),
    path.join(home, 'github'),
    path.join(home, 'code'),
    path.join(home, 'projects'),
    path.join('/Volumes', 'extension', 'code'),
    path.join('C:', 'code'),
    path.join('D:', 'code'),
    path.join('C:', 'projects'),
    path.join('D:', 'projects'),
    path.join('C:', 'Users', os.userInfo().username, 'code'),
    path.join('C:', 'Users', os.userInfo().username, 'projects'),
    path.join('C:', 'Users', os.userInfo().username, 'Documents', 'github'),
  ].filter(Boolean);

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(root, entry.name);
        if (hasContainerLibrary(candidate)) return candidate;
      }
    } catch {
      // ignore scanning errors and continue
    }
  }

  return null;
}

export function findRepoRootCandidate() {
  const cfg = loadConfig();
  const explicitContainerRoot = String(process.env.CAMO_CONTAINER_LIBRARY_ROOT || '').trim();
  if (explicitContainerRoot && fs.existsSync(explicitContainerRoot)) {
    const preferred = String(process.env.CAMO_REPO_ROOT || cfg.repoRoot || process.cwd());
    const resolved = path.resolve(preferred);
    if (cfg.repoRoot !== resolved) {
      setRepoRoot(resolved);
    }
    return resolved;
  }
  const cwdRoot = walkUpForRepoRoot(process.cwd());
  const moduleRoot = walkUpForRepoRoot(MODULE_DIR);
  const candidates = [
    process.env.CAMO_REPO_ROOT,
    cfg.repoRoot,
    moduleRoot,
    cwdRoot,
  ].filter(Boolean);

  for (const root of candidates) {
    if (!hasContainerLibrary(root)) continue;
    const resolved = path.resolve(String(root));
    if (cfg.repoRoot !== resolved) {
      setRepoRoot(resolved);
    }
    return resolved;
  }

  return null;
}

export function findContainerLibraryRoot() {
  const candidate = process.env.CAMO_CONTAINER_LIBRARY_ROOT || '';
  if (candidate && hasContainerLibrary(candidate)) return path.resolve(String(candidate));
  const repoRoot = findRepoRootCandidate();
  if (!repoRoot) return null;
  const candidates = [
    path.join(repoRoot, 'container-library'),
    path.join(repoRoot, 'resources', 'container-library'),
    path.join(repoRoot, 'apps', 'resources', 'container-library'),
  ];
  for (const candidatePath of candidates) {
    if (fs.existsSync(candidatePath)) return candidatePath;
  }
  return null;
}

export function detectCamoufoxPath() {
  try {
    const cmd = process.platform === 'win32' ? 'python -m camoufox path' : 'python3 -m camoufox path';
    const out = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const lines = out.trim().split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      if (line && (line.startsWith('/') || line.match(/^[A-Z]:\\/))) return line;
    }
  } catch {
    return null;
  }
  return null;
}

export function ensureCamoufox() {
  if (detectCamoufoxPath()) return;
  throw new Error('Camoufox is not installed. Install it via camoufox (e.g. `python -m camoufox fetch`).');
}

export async function ensureBrowserService() {
  if (await checkBrowserService()) return;

  const provider = String(process.env.CAMO_BROWSER_PROVIDER || 'camo').trim().toLowerCase();
  if (provider === 'none' || provider === 'external') {
    throw new Error(
      `Browser backend is not healthy at ${BROWSER_SERVICE_URL} (provider=${provider}). ` +
      'Start backend manually or set CAMO_BROWSER_PROVIDER=camo.',
    );
  }

  if (provider === 'camo') {
    const repoRoot = findRepoRootCandidate();
    if (!repoRoot) {
      throw new Error('CAMO_REPO_ROOT is not set and no valid repo root was found');
    }
    const configRet = runCamoCli(['config', 'repo-root', repoRoot], { stdio: 'pipe' });
    if (!configRet.ok) {
      throw new Error(
        `camo config repo-root failed: ${configRet.stderr.trim() || configRet.stdout.trim() || `exit ${configRet.code ?? 'null'}`}`,
      );
    }

    console.log('Starting browser backend via camo init...');
    const initRet = runCamoCli(['init'], { stdio: 'inherit' });
    if (!initRet.ok) {
      throw new Error(`camo init failed: ${initRet.stderr.trim() || initRet.stdout.trim() || `exit ${initRet.code ?? 'null'}`}`);
    }

    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 400));
      if (await checkBrowserService()) {
        console.log('Browser backend is ready (provider=camo).');
        return;
      }
    }

    throw new Error('Browser backend failed to become healthy after camo init');
  }

  throw new Error(`Unsupported CAMO_BROWSER_PROVIDER=${provider}; only "camo" is supported.`);
}

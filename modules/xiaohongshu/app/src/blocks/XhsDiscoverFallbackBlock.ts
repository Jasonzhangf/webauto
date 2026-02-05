/**
 * XHS Discover Fallback Block
 *
 * 独立的回退 Block：当出现 shell-page（URL=/explore/<id> 但 DOM=搜索结果）时，
 * 通过点击「发现」按钮重置状态，然后重新搜索以获取正确的 /search_result URL。
 *
 * 约束：全系统级操作（container + keyboard/mouse），禁止 goto/refresh/url 拼接。
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { ContainerRegistry } from '../../../../container-registry/src/index.js';
import { execute as phase2Search } from './Phase2SearchBlock.js';
import { detectXhsCheckpoint } from '../utils/checkpoints.js';
import { controllerAction, delay } from '../utils/controllerAction.js';

export interface DiscoverFallbackInput {
  keyword: string;
  profile?: string;
  unifiedApiUrl?: string;
  env?: string;
}

export interface DiscoverFallbackOutput {
  success: boolean;
  finalUrl: string;
  finalCheckpoint: string;
  screenshotPath?: string;
  domDumpPath?: string;
}

function resolveDownloadRoot() {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

function isDebugArtifactsEnabled() {
  return (
    process.env.WEBAUTO_DEBUG === '1' ||
    process.env.WEBAUTO_DEBUG_ARTIFACTS === '1' ||
    process.env.WEBAUTO_DEBUG_SCREENSHOT === '1'
  );
}

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeRepeated(value: string, maxRounds = 3) {
  let current = value;
  for (let i = 0; i < maxRounds; i += 1) {
    const next = decodeURIComponentSafe(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function getKeywordFromSearchUrl(searchUrl: string) {
  try {
    const url = new URL(searchUrl);
    const raw = url.searchParams.get('keyword') || '';
    if (raw) return decodeRepeated(raw).trim();
  } catch {
    // ignore
  }
  return null;
}

async function saveScreenshot(base64: string, env: string, keyword: string) {
  if (!isDebugArtifactsEnabled()) return null;
  const dir = path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword, 'discover-fallback');
  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(base64, 'base64');
  const filePath = path.join(dir, `fallback-${Date.now()}.png`);
  await fs.writeFile(filePath, buf);
  return filePath;
}

async function saveDomDump(dom: any, env: string, keyword: string) {
  if (!isDebugArtifactsEnabled()) return null;
  const dir = path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword, 'discover-fallback');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `fallback-${Date.now()}.json`);
  await fs.writeFile(filePath, JSON.stringify(dom, null, 2), 'utf8');
  return filePath;
}

export async function execute(input: DiscoverFallbackInput): Promise<DiscoverFallbackOutput> {
  const {
    keyword,
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
    env = 'debug',
  } = input;

  console.log(`[XhsDiscoverFallback] start keyword=${keyword} profile=${profile}`);

  const registry = new ContainerRegistry();
  await registry.load();

  async function waitCheckpoint(maxWaitMs: number) {
    const start = Date.now();
    let last = await detectXhsCheckpoint({ sessionId: profile, serviceUrl: unifiedApiUrl });
    while (Date.now() - start < maxWaitMs) {
      if (last.checkpoint !== 'detail_ready' && last.checkpoint !== 'comments_ready') return last;
      await delay(500);
      last = await detectXhsCheckpoint({ sessionId: profile, serviceUrl: unifiedApiUrl });
    }
    return last;
  }

  // If we are in detail/comments modal, exit first (do NOT click Discover under modal).
  let checkpoint = await detectXhsCheckpoint({ sessionId: profile, serviceUrl: unifiedApiUrl });
  if (checkpoint.checkpoint === 'detail_ready' || checkpoint.checkpoint === 'comments_ready') {
    console.log(`[XhsDiscoverFallback] in ${checkpoint.checkpoint}, exit modal before discover`);
    try {
      const r = await controllerAction(
        'container:operation',
        { containerId: 'xiaohongshu_detail.close_button', operationId: 'click', sessionId: profile, timeoutMs: 15000 },
        unifiedApiUrl,
      );
      console.log(`[XhsDiscoverFallback] close_button click: success=${Boolean(r?.success !== false)}`);
    } catch {
      console.log('[XhsDiscoverFallback] close_button click failed (ignored)');
    }

    checkpoint = await waitCheckpoint(8000);
    if (checkpoint.checkpoint === 'detail_ready' || checkpoint.checkpoint === 'comments_ready') {
      // Fallback: ESC twice
      for (let i = 0; i < 2; i += 1) {
        console.log(`[XhsDiscoverFallback] still in ${checkpoint.checkpoint}, press ESC (round=${i + 1})`);
        await controllerAction('keyboard:press', { profileId: profile, key: 'Escape' }, unifiedApiUrl);
        checkpoint = await waitCheckpoint(8000);
        if (checkpoint.checkpoint !== 'detail_ready' && checkpoint.checkpoint !== 'comments_ready') break;
      }
    }

    // If still in detail/comments, stop (do not proceed to discover).
    if (checkpoint.checkpoint === 'detail_ready' || checkpoint.checkpoint === 'comments_ready') {
      let screenshotPath: string | undefined;
      let domDumpPath: string | undefined;

      try {
        const shot = await controllerAction('browser:screenshot', { profileId: profile, fullPage: false }, unifiedApiUrl)
          .then((res) => res?.data || res?.result || res?.data?.data || '');
        if (typeof shot === 'string' && shot) {
          const saved = await saveScreenshot(shot, env, keyword);
          if (saved) screenshotPath = saved;
        }
      } catch {}

      try {
        const dom = await controllerAction(
          'browser:execute',
          {
            profile,
            script:
              '(() => ({ url: window.location.href, title: document.title, readyState: document.readyState, text: document.body ? document.body.innerText.slice(0, 800) : "" }))()'
          },
          unifiedApiUrl,
        ).then((res) => res?.result || res?.data?.result || null);
        if (dom) {
          const saved = await saveDomDump(dom, env, keyword);
          if (saved) domDumpPath = saved;
        }
      } catch {}

      return {
        success: false,
        finalUrl: checkpoint.url || '',
        finalCheckpoint: checkpoint.checkpoint,
        screenshotPath,
        domDumpPath,
      };
    }
  }

  const defs: any = registry.getContainersForUrl('https://www.xiaohongshu.com/explore/');
  const discoverDef: any = defs?.['xiaohongshu_detail.discover_button'] || defs?.['xiaohongshu_home.discover_button'];
  const selectorDefs: any[] = Array.isArray(discoverDef?.selectors) ? discoverDef.selectors : [];
  const primarySelectorDef = selectorDefs.find((s: any) => s?.variant === 'primary') || selectorDefs[0];
  const discoverSelector = String(primarySelectorDef?.css || 'a[href="/"]');

  console.log(`[XhsDiscoverFallback] click discover selector=${discoverSelector}`);

  let clicked = false;
  // Prefer container operations (system-level) to avoid selector drift.
  const candidates = [
    'xiaohongshu_home.discover_button',
    'xiaohongshu_search.discover_button',
  ];
  for (const id of candidates) {
    try {
      const r = await controllerAction(
        'container:operation',
        { containerId: id, operationId: 'click', sessionId: profile, timeoutMs: 15000 },
        unifiedApiUrl,
      );
      if (r?.success !== false) {
        clicked = true;
        console.log(`[XhsDiscoverFallback] container click ok: ${id}`);
        break;
      }
    } catch {
      // ignore and try next
    }
  }

  // Fallback: raw selector click (still system-level via container:click)
  if (!clicked) {
    for (let i = 0; i < 3; i += 1) {
      const result = await controllerAction(
        'container:click',
        { profileId: profile, selector: discoverSelector, highlight: true, timeoutMs: 8000 },
        unifiedApiUrl,
      ).then((res) => Boolean(res?.ok ?? res?.result?.ok ?? res?.data?.ok));

      if (result) {
        clicked = true;
        console.log('[XhsDiscoverFallback] selector click ok');
        break;
      }
      await delay(600);
    }
  }

  console.log(`[XhsDiscoverFallback] click discover done clicked=${clicked}`);

  // Let XHS settle. Avoid refresh/goto.
  await delay(2000);

  // Re-run search.
  const searchRes = await phase2Search({ keyword, profile, unifiedApiUrl });
  const finalUrl = searchRes.finalUrl;
  const finalCheckpoint = await detectXhsCheckpoint({ sessionId: profile, serviceUrl: unifiedApiUrl });

  const isSearchResultPage = finalUrl.includes('/search_result') && getKeywordFromSearchUrl(finalUrl) === keyword;
  const isSearchReady = finalCheckpoint.checkpoint === 'search_ready';

  console.log(`[XhsDiscoverFallback] final checkpoint=${finalCheckpoint.checkpoint} url=${finalUrl}`);

  if (!isSearchResultPage || !isSearchReady) {
    let screenshotPath: string | undefined;
    let domDumpPath: string | undefined;

    try {
      const shot = await controllerAction('browser:screenshot', { profileId: profile, fullPage: false }, unifiedApiUrl)
        .then((res) => res?.data || res?.result || res?.data?.data || '');
      if (typeof shot === 'string' && shot) {
        const saved = await saveScreenshot(shot, env, keyword);
        if (saved) screenshotPath = saved;
      }
    } catch {
      // ignore
    }

    try {
      const dom = await controllerAction(
        'browser:execute',
        {
          profile,
          script:
            '(() => ({ url: window.location.href, title: document.title, readyState: document.readyState, text: document.body ? document.body.innerText.slice(0, 800) : "" }))()'
        },
        unifiedApiUrl,
      ).then((res) => res?.result || res?.data?.result || null);
      if (dom) {
        const saved = await saveDomDump(dom, env, keyword);
        if (saved) domDumpPath = saved;
      }
    } catch {
      // ignore
    }

    return {
      success: false,
      finalUrl,
      finalCheckpoint: finalCheckpoint.checkpoint,
      screenshotPath,
      domDumpPath,
    };
  }

  return {
    success: true,
    finalUrl,
    finalCheckpoint: finalCheckpoint.checkpoint,
  };
}

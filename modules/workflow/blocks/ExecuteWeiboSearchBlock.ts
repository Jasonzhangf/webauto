/**
 * Workflow Block: ExecuteWeiboSearchBlock
 *
 * 微博搜索执行：直接导航到搜索结果页
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface ExecuteWeiboSearchInput {
  sessionId: string;
  keyword: string;
  env?: string;
  serviceUrl?: string;
}

export interface ExecuteWeiboSearchOutput {
  success: boolean;
  searchExecuted: boolean;
  url: string;
  steps?: Array<{
    id: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    error?: string;
    meta?: Record<string, any>;
  }>;
  error?: string;
}

function sanitizeFilenamePart(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[\\/:"*?<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function resolveDownloadRoot(): string {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

function isDebugArtifactsEnabled(): boolean {
  return (
    process.env.WEBAUTO_DEBUG === '1' ||
    process.env.WEBAUTO_DEBUG_ARTIFACTS === '1'
  );
}

export async function execute(input: ExecuteWeiboSearchInput): Promise<ExecuteWeiboSearchOutput> {
  const {
    sessionId,
    keyword,
    env = 'debug',
    serviceUrl = 'http://127.0.0.1:7704',
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/command`;
  const steps: ExecuteWeiboSearchOutput['steps'] = [];
  const debugEnabled = isDebugArtifactsEnabled();

  async function controllerAction(action: string, args: any = {}): Promise<any> {
    const res = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args: { profileId: profile, ...args } }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined,
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw}`);
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }

  async function getCurrentUrl(): Promise<string> {
    const res = await controllerAction('evaluate', { script: 'window.location.href' });
    return res?.body?.result ?? res?.result ?? '';
  }

  async function saveDebugScreenshot(kind: string, meta: Record<string, any> = {}): Promise<void> {
    if (!debugEnabled) return;
    try {
      const keywordDir = path.join(resolveDownloadRoot(), 'weibo', env, sanitizeFilenamePart(keyword));
      const debugDir = path.join(keywordDir, '_debug', 'search');
      await fs.mkdir(debugDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const pngPath = path.join(debugDir, `${ts}-${sanitizeFilenamePart(kind)}.png`);

      const shot = await controllerAction('screenshot');
      const b64 = shot?.body?.data ?? shot?.data;
      if (typeof b64 === 'string' && b64.length > 10) {
        await fs.writeFile(pngPath, Buffer.from(b64, 'base64'));
      }
      console.log(`[ExecuteWeiboSearch][debug] saved ${kind}: ${pngPath}`);
    } catch (e: any) {
      console.warn(`[ExecuteWeiboSearch][debug] save failed (${kind}): ${e?.message || String(e)}`);
    }
  }

  function pushStep(step: NonNullable<ExecuteWeiboSearchOutput['steps']>[number]) {
    steps.push(step);
    console.log('[ExecuteWeiboSearch][step]', step.id, step.status, step.error || '');
  }

  try {
    // 直接导航到搜索结果页
    const currentUrl = await getCurrentUrl();
    
    if (!currentUrl.includes('s.weibo.com/weibo')) {
      pushStep({ id: 'goto_search_page', status: 'running', meta: { from: currentUrl, keyword } });
      
      const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`;
      console.log('[ExecuteWeiboSearch] navigating to:', searchUrl);
      await controllerAction('goto', { url: searchUrl });
      await new Promise(r => setTimeout(r, 3000));
      
      pushStep({ id: 'goto_search_page', status: 'success' });
    } else {
      pushStep({ id: 'goto_search_page', status: 'skipped', meta: { reason: 'already_on_search_page' } });
    }

    // 检查是否成功加载搜索页
    const finalUrl = await getCurrentUrl();
    console.log('[ExecuteWeiboSearch] current URL:', finalUrl);
    
    // 检查是否有搜索结果卡片
    const cardsScript = `document.querySelectorAll('.card-wrap').length`;
    const cardsRes = await controllerAction('evaluate', { script: cardsScript });
    const cardsCount = cardsRes?.result ?? 0;
    
    if (cardsCount > 0) {
      console.log('[ExecuteWeiboSearch] search results loaded:', cardsCount, 'cards');
      return {
        success: true,
        searchExecuted: true,
        url: finalUrl,
        steps,
      };
    }
    
    // 没有找到搜索结果卡片
    console.log('[ExecuteWeiboSearch] no search results found');
    await saveDebugScreenshot('no_search_results', { keyword, url: finalUrl });
    
    return {
      success: true, // 仍然返回成功，因为已经导航到搜索页
      searchExecuted: true,
      url: finalUrl,
      steps,
    };
  } catch (error: any) {
    return {
      success: false,
      searchExecuted: false,
      url: '',
      steps,
      error: `ExecuteWeiboSearch failed: ${error.message}`,
    };
  }
}

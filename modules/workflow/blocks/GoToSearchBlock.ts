/**
 * Workflow Block: GoToSearchBlock
 *
 * 导航到搜索页并执行搜索（模拟人工操作）
 * 警告：不要构造 search_result URL 直达，避免风控验证码
 */

import { ensureHomePage, getCurrentUrl, urlKeywordEquals } from './helpers/searchPageState.js';
import {
  verifySearchBarAnchor,
  isSearchInputFocused,
  readSearchInputValue,
  executeSearch,
  performSystemClickFocus,
  controllerAction
} from './helpers/searchExecutor.js';
import { waitForSearchResultsReady } from './helpers/searchResultWaiter.js';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { countPersistedNotes } from './helpers/persistedNotes.js';

export interface GoToSearchInput {
  sessionId: string;
  keyword: string;
  env?: string;
  serviceUrl?: string;
  debugDir?: string;
}

export interface GoToSearchOutput {
  success: boolean;
  searchPageReady: boolean;
  searchExecuted: boolean;
  url: string;
  entryAnchor?: {
    containerId: string;
    selector?: string;
    rect?: { x: number; y: number; width: number; height: number };
    verified?: boolean;
  };
  exitAnchor?: {
    containerId: string;
    selector?: string;
    rect?: { x: number; y: number; width: number; height: number };
    verified?: boolean;
  };
  steps?: Array<{
    id: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    error?: string;
    anchor?: {
      containerId?: string;
      selector?: string;
      rect?: { x: number; y: number; width: number; height: number };
      verified?: boolean;
    };
    meta?: Record<string, any>;
  }>;
  anchor?: {
    containerId: string;
    selector?: string;
    rect?: { x: number; y: number; width: number; height: number };
    verified?: boolean;
  };
  error?: string;
}

/**
 * 导航到搜索页并执行搜索
 *
 * @param input - 输入参数
 * @returns Promise<GoToSearchOutput>
 */
export async function execute(input: GoToSearchInput): Promise<GoToSearchOutput> {
  const {
    sessionId,
    keyword,
    env = 'debug',
    serviceUrl = 'http://127.0.0.1:7701',
    debugDir,
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;
  const steps: GoToSearchOutput['steps'] = [];
  let entryAnchor: GoToSearchOutput['entryAnchor'];
  let exitAnchor: GoToSearchOutput['exitAnchor'];
  let searchInputContainerId: string = 'xiaohongshu_search.search_bar';

  function sanitizeFilenamePart(value: string): string {
    return String(value || '')
      .trim()
      .replace(/[\\/:"*?<>|]+/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80);
  }

  function extractBase64FromScreenshotResponse(raw: any): string | undefined {
    const v =
      raw?.data?.data ??
      raw?.data?.body?.data ??
      raw?.body?.data ??
      raw?.result?.data ??
      raw?.result ??
      raw?.data ??
      raw;
    return typeof v === 'string' && v.length > 10 ? v : undefined;
  }

  async function resolveDebugDir(): Promise<string | null> {
    if (debugDir) return debugDir;
    try {
      const persisted = await countPersistedNotes({
        platform: 'xiaohongshu',
        env,
        keyword,
        homeDir: os.homedir(),
        requiredFiles: ['content.md'],
      });
      return path.join(persisted.keywordDir, '_debug', 'search');
    } catch {
      return null;
    }
  }

  async function saveDebugScreenshot(
    kind: string,
    meta: Record<string, any>,
  ): Promise<{ pngPath?: string; jsonPath?: string }> {
    const dir = await resolveDebugDir();
    if (!dir) return {};
    try {
      await fs.mkdir(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const base = `${ts}-${sanitizeFilenamePart(kind)}`;
      const pngPath = path.join(dir, `${base}.png`);
      const jsonPath = path.join(dir, `${base}.json`);

      const shot = await controllerAction(controllerUrl, 'browser:screenshot', {
        profileId: profile,
        fullPage: false,
      });
      const b64 = extractBase64FromScreenshotResponse(shot);
      if (b64) {
        await fs.writeFile(pngPath, Buffer.from(b64, 'base64'));
      }
      await fs.writeFile(
        jsonPath,
        JSON.stringify(
          {
            ts,
            kind,
            sessionId: profile,
            keyword,
            url: await getCurrentUrl({ profile, controllerUrl }).catch(() => ''),
            ...meta,
            pngPath: b64 ? pngPath : null,
          },
          null,
          2,
        ),
        'utf-8',
      );
      console.log(`[GoToSearch][debug] saved ${kind}: ${pngPath}`);
      return { pngPath: b64 ? pngPath : undefined, jsonPath };
    } catch (e: any) {
      console.warn(`[GoToSearch][debug] save screenshot failed (${kind}): ${e?.message || String(e)}`);
      return {};
    }
  }

  function pushStep(step: NonNullable<GoToSearchOutput['steps']>[number]) {
    steps.push(step);
    try {
      console.log(
        '[GoToSearch][step]',
        JSON.stringify(
          {
            id: step.id,
            status: step.status,
            error: step.error,
            anchor: step.anchor,
            meta: step.meta,
          },
          null,
          2,
        ),
      );
    } catch {
      console.log('[GoToSearch][step]', step.id, step.status);
    }
  }

  try {
    // 0) 如果已经在正确的搜索结果页，则禁止“重复搜索”：直接等待列表就绪后返回
    const url0 = await getCurrentUrl({ profile, controllerUrl });
    if (url0.includes('/search_result')) {
      if (!urlKeywordEquals(url0, keyword)) {
        // 开发阶段：不做任何兜底纠错，直接失败并落盘证据（用于定位 keyword 漂移原因）
        pushStep({
          id: 'already_on_search_result_keyword_mismatch',
          status: 'failed',
          meta: { url: url0, keyword },
          error: 'keyword_mismatch',
        });
        await saveDebugScreenshot('keyword_mismatch', { url: url0, keyword });
        return {
          success: false,
          searchPageReady: false,
          searchExecuted: false,
          url: url0,
          steps,
          error: `keyword_changed: ${url0}`,
        };
      }

      const ready = await waitForSearchResultsReady({
        profile,
        controllerUrl,
        keyword,
        maxWaitMs: 12000,
      });
      if (!ready.ok) {
        pushStep({
          id: 'already_on_search_result_wait_list',
          status: 'failed',
          error: ready.noResults ? 'search_no_results' : 'search_result_not_ready',
          meta: { url: ready.url || url0 },
        });
        await saveDebugScreenshot('search_result_not_ready', { url: ready.url || url0 });
        return {
          success: false,
          searchPageReady: false,
          searchExecuted: false,
          url: ready.url || url0,
          steps,
          error: ready.noResults ? 'Search returned no results' : 'Search results not ready (timeout)',
        };
      }

      if (ready.listAnchor?.rect) {
        exitAnchor = {
          containerId: 'xiaohongshu_search.search_result_list',
          selector: ready.listAnchor.selector,
          rect: ready.listAnchor.rect,
          verified: true,
        };
      }
      pushStep({
        id: 'already_on_search_result',
        status: 'success',
        anchor: exitAnchor,
        meta: { url: ready.url || url0 },
      });
      return {
        success: true,
        searchPageReady: true,
        searchExecuted: false,
        url: ready.url || url0,
        entryAnchor: undefined,
        exitAnchor,
        steps,
        anchor: exitAnchor || {
          containerId: 'xiaohongshu_search.search_result_list',
          verified: false,
        },
      };
    }

    // 注意：SearchGate 节流由上游 workflow 的 WaitSearchPermitBlock 负责，这里不再重复申请 permit。

    // 1. 确保在站内（最好是首页或搜索页）
    const homePageState = await ensureHomePage({ profile, controllerUrl });

    // 1.1 根据当前页面类型选择输入框容器（主页 / 搜索页）
    searchInputContainerId = homePageState.onSearchPage
      ? 'xiaohongshu_search.search_bar'
      : 'xiaohongshu_home.search_input';

    // 1.5 验证搜索框锚点
    const anchorResult = await verifySearchBarAnchor({
      profile,
      controllerUrl,
      searchInputContainerId,
      keyword
    });

    if (!anchorResult.found) {
      entryAnchor = {
        containerId: searchInputContainerId,
        selector: anchorResult.selector,
        rect: anchorResult.rect,
        verified: false,
      };
      console.log('[GoToSearch][entryAnchor]', JSON.stringify(entryAnchor, null, 2));
      pushStep({
        id: 'verify_search_bar_anchor',
        status: 'failed',
        error: anchorResult.error || 'anchor_not_found',
        anchor: entryAnchor,
      });
      await saveDebugScreenshot('search_bar_anchor_not_found', {
        searchInputContainerId,
        selector: anchorResult.selector,
        rect: anchorResult.rect,
        error: anchorResult.error || 'anchor_not_found',
      });
      return {
        success: false,
        searchPageReady: false,
        searchExecuted: false,
        url: '',
        entryAnchor,
        exitAnchor: undefined,
        steps,
        anchor: {
          containerId: searchInputContainerId,
          selector: anchorResult.selector,
          verified: false
        },
        error: `Search bar anchor not found: ${anchorResult.error || 'unknown error'}`
      };
    }

    // 1.6 执行 container:operation highlight
    try {
      await controllerAction(controllerUrl, 'container:operation', {
        containerId: searchInputContainerId,
        operationId: 'highlight',
        config: {
          selector: anchorResult.selector,
          style: '3px solid #ff4444',
          duration: 2000,
        },
        sessionId: profile
      });
      console.log('[GoToSearch] Search bar highlighted successfully');
    } catch (error: any) {
      console.warn('[GoToSearch] Highlight error:', error.message);
    }

    // 1.7 获取 Rect 并验证
    const rect = anchorResult.rect;
    const rectVerified = rect && rect.y < 200 && rect.width > 0 && rect.height > 0;
    
    if (!rectVerified) {
      console.warn(`[GoToSearch] Rect validation failed: ${JSON.stringify(rect)}`);
    } else {
      console.log(`[GoToSearch] Rect verified: y=${rect.y}, width=${rect.width}, height=${rect.height}`);
    }

    entryAnchor = {
      containerId: searchInputContainerId,
      selector: anchorResult.selector,
      rect,
      verified: Boolean(rectVerified),
    };
    console.log('[GoToSearch][entryAnchor]', JSON.stringify(entryAnchor, null, 2));
    pushStep({
      id: 'verify_search_bar_anchor',
      status: rectVerified ? 'success' : 'success',
      anchor: entryAnchor,
    });

    // 1.8 使用容器运行时 + 系统点击聚焦搜索框
    if (anchorResult.selector) {
      const clickResult = await performSystemClickFocus(
        { profile, controllerUrl, searchInputContainerId, keyword },
        anchorResult.selector
      );

      pushStep({
        id: 'system_click_focus_input',
        status: clickResult.focused ? 'success' : 'failed',
        anchor: entryAnchor,
        meta: { focused: clickResult.focused },
        error: clickResult.error
      });

      if (!clickResult.focused) {
        await saveDebugScreenshot('search_input_not_focused', {
          searchInputContainerId,
          selector: anchorResult.selector,
          rect,
          error: clickResult.error || 'not_focused',
        });
        return {
          success: false,
          searchPageReady: false,
          searchExecuted: false,
          url: await getCurrentUrl({ profile, controllerUrl }),
          entryAnchor,
          exitAnchor: undefined,
          steps,
          anchor: entryAnchor,
          error: 'Search input not focused after system click',
        };
      }
    } else {
      console.warn('[GoToSearch] Skip system click: no selector from anchorResult');
      pushStep({
        id: 'system_click_focus_input',
        status: 'skipped',
        anchor: entryAnchor,
        meta: { reason: 'no_selector' },
      });
    }

    // 2. 执行搜索
    const searchResult = await executeSearch(
      { profile, controllerUrl, searchInputContainerId, keyword },
      anchorResult.selector
    );
    
    const finalUrl = await getCurrentUrl({ profile, controllerUrl });

    // 2.1 检查输入框中的值是否为当前关键字
    const currentValue = await readSearchInputValue(
      { profile, controllerUrl, searchInputContainerId, keyword },
      anchorResult.selector
    );
    
    const trimmedValue = currentValue.trim();
    const trimmedExpected = keyword.trim();
    // 主页搜索：触发回车后可能立刻跳转，旧输入框消失导致读到空值；开发阶段不把该校验作为失败依据
    const valueCheckSkipped = !trimmedValue;
    const valueMatches = valueCheckSkipped ? true : trimmedValue === trimmedExpected;
    pushStep({
      id: 'system_type_keyword',
      status: searchResult.success ? 'success' : 'failed',
      anchor: entryAnchor,
      meta: {
        value: currentValue,
        expected: keyword,
        searchExecuted: searchResult.success,
        valueCheckSkipped,
        finalUrl,
        debug: (searchResult as any)?.debug ?? null,
      },
      ...(searchResult.success
        ? {}
        : { error: searchResult.error || (!valueMatches ? 'keyword_mismatch' : 'type_failed') }),
    });

    if (!searchResult.success) {
      await saveDebugScreenshot('search_trigger_failed', {
        searchInputContainerId,
        selector: anchorResult.selector,
        rect,
        error: searchResult.error || 'trigger_failed',
      });
      return {
        success: false,
        searchPageReady: false,
        searchExecuted: false,
        url: finalUrl,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        error: searchResult.error || `Search input/trigger failed, current url=${finalUrl || 'unknown'}`,
      };
    }

    // 2.5 等待搜索结果就绪
    const ready = await waitForSearchResultsReady({
      profile,
      controllerUrl,
      keyword,
      maxWaitMs: 30000
    });

    if (!ready.ok) {
      pushStep({
        id: 'wait_search_result_list',
        status: 'failed',
        error: ready.noResults ? 'search_no_results' : 'search_result_not_ready',
        anchor: {
          containerId: 'xiaohongshu_search.search_result_list',
          verified: false,
        },
        meta: { url: ready.url || finalUrl },
      });
      await saveDebugScreenshot('search_result_not_ready', {
        url: ready.url || finalUrl,
        noResults: Boolean(ready.noResults),
      });
      return {
        success: false,
        searchPageReady: false,
        searchExecuted: true,
        url: ready.url || finalUrl,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        error: ready.noResults ? 'Search returned no results' : 'Search results not ready (timeout)',
      };
    }

    // 2.6 严格校验：搜索结果页 keyword 必须严格等于输入 keyword（禁止接受推荐/纠错关键词）
    // 注意：页面可能短暂进入 search_result 后被站点重定向到其它 keyword；这里以“当前 URL”为准做硬校验
    const urlAfterReady = await getCurrentUrl({ profile, controllerUrl });
    if (!urlKeywordEquals(urlAfterReady || ready.url || finalUrl, keyword)) {
      pushStep({
        id: 'search_result_keyword_mismatch',
        status: 'failed',
        error: 'keyword_mismatch',
        meta: { url: urlAfterReady || ready.url || finalUrl, keyword },
      });
      await saveDebugScreenshot('keyword_mismatch_after_search', {
        url: urlAfterReady || ready.url || finalUrl,
        keyword,
        finalUrl,
        readyUrl: ready.url || null,
      });
      return {
        success: false,
        searchPageReady: false,
        searchExecuted: true,
        url: urlAfterReady || ready.url || finalUrl,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        error: `keyword_mismatch_after_search: ${urlAfterReady || ready.url || finalUrl}`,
      };
    }

    if (ready.listAnchor?.rect) {
      exitAnchor = {
        containerId: 'xiaohongshu_search.search_result_list',
        selector: ready.listAnchor.selector,
        rect: ready.listAnchor.rect,
        verified: true,
      };
      console.log('[GoToSearch][exitAnchor]', JSON.stringify(exitAnchor, null, 2));
      pushStep({
        id: 'wait_search_result_list',
        status: 'success',
        anchor: exitAnchor,
        meta: { url: ready.url || finalUrl },
      });
    } else {
      pushStep({
        id: 'wait_search_result_list',
        status: 'success',
        anchor: {
          containerId: 'xiaohongshu_search.search_result_list',
          verified: false,
        },
        meta: { url: ready.url || finalUrl, note: 'items_detected_no_anchor' },
      });
      exitAnchor = undefined;
    }
    
    // 3. 检查是否出现验证码
    const urlForCaptcha = urlAfterReady || ready.url || finalUrl;
    if (urlForCaptcha.includes('captcha') || urlForCaptcha.includes('verify')) {
      await saveDebugScreenshot('captcha_detected', { url: urlForCaptcha });
      return {
        success: false,
        searchPageReady: false,
        searchExecuted: true,
        url: urlForCaptcha,
        error: 'Triggered CAPTCHA after search'
      };
    }

    return {
      success: true,
      searchPageReady: true,
      searchExecuted: true,
      url: urlAfterReady || ready.url || finalUrl,
      entryAnchor,
      exitAnchor,
      steps,
      anchor: {
        containerId: searchInputContainerId,
        selector: anchorResult.selector,
        rect,
        verified: rectVerified,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      searchPageReady: false,
      searchExecuted: false,
      url: '',
      entryAnchor,
      exitAnchor,
      steps,
      error: `GoToSearch failed: ${error.message}`
    };
  }
}

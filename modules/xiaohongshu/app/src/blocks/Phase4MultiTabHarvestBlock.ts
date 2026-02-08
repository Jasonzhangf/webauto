import path from 'node:path';
import os from 'node:os';

export interface MultiTabHarvestInput {
  profile: string;
  keyword: string;
  env: string;
  links: Array<{
    noteId: string;
    safeUrl: string;
    searchUrl?: string;
  }>;
  maxCommentsPerNote?: number;
  unifiedApiUrl?: string;
}

export interface MultiTabHarvestOutput {
  success: boolean;
  totalNotes: number;
  totalComments: number;
  errors: string[];
}

async function controllerAction(action: string, payload: any, apiUrl: string): Promise<any> {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

async function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function ensureDir(pathname: string): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(pathname, { recursive: true });
}

async function appendJsonl(filePath: string, rows: any[]): Promise<void> {
  const { appendFile } = await import('node:fs/promises');
  const lines = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  await appendFile(filePath, lines, 'utf8');
}

function resolveDownloadRoot(): string {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

type PageInfo = { index?: number; pageId?: string; url?: string; active?: boolean };

async function listPages(profile: string, apiUrl: string): Promise<{ pages: PageInfo[]; activeIndex: number }> {
  const res = await controllerAction('browser:page:list', { profile }, apiUrl);
  const pages: PageInfo[] = res?.pages || res?.data?.pages || [];
  const activeIndex: number = res?.activeIndex ?? res?.data?.activeIndex ?? -1;
  return { pages, activeIndex };
}

async function switchToTab(profile: string, apiUrl: string, index: number): Promise<{ activeIndex: number; activeUrl: string }> {
  await controllerAction('browser:page:switch', { profile, index }, apiUrl).catch((): null => null);
  await delay(500);
  const listRes = await listPages(profile, apiUrl);
  const activeIndex: number = listRes.activeIndex;
  const pages: PageInfo[] = listRes.pages || [];
  const activeUrl: string = pages.find((p) => p.active)?.url || 'N/A';
  return { activeIndex, activeUrl };
}

async function openTabViaWindowOpen(profile: string, apiUrl: string): Promise<void> {
  await controllerAction('browser:execute', { profile, script: "window.open('about:blank', '_blank')" }, apiUrl).catch((): null => null);
  await delay(400);
}

async function ensureTabPool(profile: string, apiUrl: string, requiredTotal = 5): Promise<Array<{ index: number; pageId?: any }>> {
  const existing = await listPages(profile, apiUrl);
  const currentCount = existing.pages.length;
  const needed = Math.max(0, requiredTotal - currentCount);
  if (needed > 0) {
    for (let i = 0; i < needed; i += 1) {
      await openTabViaWindowOpen(profile, apiUrl);
    }
  }
  const finalPages = await listPages(profile, apiUrl);
  return finalPages.pages.slice(1, requiredTotal).map((p: any) => ({ index: p.index, pageId: p.pageId }));
}

async function scrollCommentSection(profile: string, apiUrl: string, distance = 600): Promise<boolean> {
  const res = await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.comment_section',
    operationId: 'scroll',
    sessionId: profile,
    config: { direction: 'down', distance, repeat: 1 },
  }, apiUrl).catch((): null => null);
  return res?.success !== false;
}

async function isCommentEnd(profile: string, apiUrl: string): Promise<boolean> {
  const res = await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.comment_section.end_marker',
    operationId: 'extract',
    sessionId: profile,
    config: { max_items: 1, visibleOnly: true },
  }, apiUrl).catch((): null => null);
  const items: any[] = Array.isArray(res?.extracted) ? res.extracted : [];
  return items.length > 0;
}

async function isCommentEmpty(profile: string, apiUrl: string): Promise<boolean> {
  const res = await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.comment_section.empty_state',
    operationId: 'extract',
    sessionId: profile,
    config: { max_items: 1, visibleOnly: true },
  }, apiUrl).catch((): null => null);
  const items: any[] = Array.isArray(res?.extracted) ? res.extracted : [];
  return items.length > 0;
}

async function extractComments(profile: string, apiUrl: string, limit: number): Promise<any[]> {
  const res = await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.comment_section.comment_item',
    operationId: 'extract',
    sessionId: profile,
    config: { max_items: limit, visibleOnly: true },
  }, apiUrl).catch((): null => null);
  return Array.isArray(res?.extracted) ? res.extracted : [];
}

async function clickShowMore(profile: string, apiUrl: string): Promise<void> {
  await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.comment_section.show_more_button',
    operationId: 'click',
    sessionId: profile,
    config: { scroll_to_view: true, wait_after: 500, visibleOnly: true },
  }, apiUrl).catch((): null => null);
}

export async function execute(input: MultiTabHarvestInput): Promise<MultiTabHarvestOutput> {
    const {
      profile,
      keyword,
      env,
      links,
      maxCommentsPerNote = 50,
      unifiedApiUrl = 'http://127.0.0.1:7701',
    } = input;

    
    const downloadRoot = resolveDownloadRoot();

  console.log(`[Phase4MultiTab] 开始多Tab轮转采集，总链接: ${links.length}`);

  const tabPool = await ensureTabPool(profile, unifiedApiUrl, 5);
  const workers = [
    { slot: 1, tabIndex: tabPool[0]?.index ?? 1, currentLinkIndex: 0, commentsThisRound: 0, totalComments: 0 },
    { slot: 2, tabIndex: tabPool[1]?.index ?? 2, currentLinkIndex: 1, commentsThisRound: 0, totalComments: 0 },
    { slot: 3, tabIndex: tabPool[2]?.index ?? 3, currentLinkIndex: 2, commentsThisRound: 0, totalComments: 0 },
    { slot: 4, tabIndex: tabPool[3]?.index ?? 4, currentLinkIndex: 3, commentsThisRound: 0, totalComments: 0 },
  ];

  const linkStates = links.map((l, i) => ({
    ...l,
    index: i,
    done: false,
    totalComments: 0,
  }));

  let completedLinks = 0;
  const errors: string[] = [];
  let round = 0;
  const maxRounds = links.length * 2;

  while (completedLinks < links.length && round < maxRounds) {
    round++;
    const worker = workers[(round - 1) % workers.length];

    let linkToProcess = linkStates.find(l => !l.done && l.index >= worker.currentLinkIndex);
    if (!linkToProcess) {
      linkToProcess = linkStates.find(l => !l.done);
    }
    if (!linkToProcess) {
      console.log(`[Phase4MultiTab] 所有链接已完成`);
      break;
    }

    worker.currentLinkIndex = linkToProcess.index;

    console.log(`\n[Round ${round}] slot-${worker.slot}(tab-${worker.tabIndex}) -> note ${linkToProcess.noteId}`);

    try {
      const activeInfo = await switchToTab(profile, unifiedApiUrl, worker.tabIndex);
      console.log(`[Phase4MultiTab] activeIndex=${activeInfo.activeIndex} url=${String(activeInfo.activeUrl).slice(0, 60)}`);

      const navRes = await controllerAction('browser:goto', {
        profile,
        url: linkToProcess.safeUrl,
      }, unifiedApiUrl);

      const navOk = navRes?.success === true || navRes?.result?.ok === true || navRes?.ok === true;
      if (!navOk) {
        console.log(`[Phase4MultiTab] navRes=${JSON.stringify(navRes)}`);
        throw new Error(`导航失败: ${navRes?.error || JSON.stringify(navRes)}`);
      }
      await delay(2000);

      await controllerAction('container:operation', {
        containerId: 'xiaohongshu_detail.comment_button',
        operationId: 'highlight',
        sessionId: profile,
      }, unifiedApiUrl).catch((): null => null);
      await controllerAction('container:operation', {
        containerId: 'xiaohongshu_detail.comment_button',
        operationId: 'click',
        sessionId: profile,
        config: { useSystemMouse: true, visibleOnly: true },
      }, unifiedApiUrl).catch((): null => null);
      await delay(1200);

      let collected = 0;
      let scrollAttempts = 0;
      const maxScrolls = Infinity;

      await clickShowMore(profile, unifiedApiUrl);
      await delay(800);

      while (collected < maxCommentsPerNote && scrollAttempts < maxScrolls) {
        const items = await extractComments(profile, unifiedApiUrl, maxCommentsPerNote - collected);
        if (items.length === 0) {
          const empty = await isCommentEmpty(profile, unifiedApiUrl);
          if (empty) {
            console.log(`[Phase4MultiTab] slot-${worker.slot} 评论区空`);
            break;
          }
          await scrollCommentSection(profile, unifiedApiUrl, 650);
          await delay(900);
          scrollAttempts++;
          continue;
        }

        const noteDir = path.join(downloadRoot, 'xiaohongshu', env, keyword, linkToProcess.noteId);
        await ensureDir(noteDir);
        const payload = items.map((item: any) => ({
          ...item,
          noteId: linkToProcess.noteId,
          ts: new Date().toISOString(),
        }));
        await appendJsonl(path.join(noteDir, 'comments.jsonl'), payload);

        collected += items.length;
        scrollAttempts = 0;

        const isEnd = await isCommentEnd(profile, unifiedApiUrl);
        if (isEnd) {
          console.log(`[Phase4MultiTab] slot-${worker.slot} 评论到底`);
          break;
        }

        await clickShowMore(profile, unifiedApiUrl);
        await delay(600);
        await scrollCommentSection(profile, unifiedApiUrl, 650);
        await delay(900);
      }

      worker.commentsThisRound = collected;
      worker.totalComments += collected;
      linkToProcess.totalComments += collected;
      linkToProcess.done = true;
      completedLinks++;

      console.log(`[Phase4MultiTab] slot-${worker.slot} ✅ 采集 ${collected} 条，该帖累计 ${linkToProcess.totalComments} 条`);
      console.log(`[Phase4MultiTab] 进度: ${completedLinks}/${links.length} 帖子完成`);

    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      console.error(`[Phase4MultiTab] slot-${worker.slot} ❌ 失败: ${errorMsg}`);
      errors.push(`${linkToProcess.noteId}: ${errorMsg}`);
      linkToProcess.done = true;
      completedLinks++;
    }

    await delay(800);
  }

  const totalComments = linkStates.reduce((sum, l) => sum + l.totalComments, 0);
  console.log(`\n[Phase4MultiTab] 完成: ${completedLinks} 帖子, ${totalComments} 条评论`);

  return {
    success: true,
    totalNotes: completedLinks,
    totalComments,
    errors,
  };
}

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface XiaohongshuCrawlerInput {
  sessionId: string;
  keyword: string;
  targetCount: number;
  serviceUrl?: string;
  maxNoNew?: number;
  savePath?: string;
}

export interface XiaohongshuCrawlerOutput {
  success: boolean;
  collectedCount: number;
  savePath: string;
  error?: string;
}

type ControllerResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type ContainerTreeSnapshot = {
  id?: string;
  defId?: string;
  type?: string;
  name?: string;
  children?: ContainerTreeSnapshot[];
};

type ContainerMatchSnapshot = {
  container_tree?: ContainerTreeSnapshot;
};

type ContainerMatchPayload = {
  sessionId: string;
  profileId: string;
  url: string;
  matched: boolean;
  container: ContainerTreeSnapshot | null;
  snapshot: ContainerMatchSnapshot;
};

type ExtractResult = {
  extracted?: Array<Record<string, any>>;
  [key: string]: any;
};

const SEARCH_ROOT_ID = 'xiaohongshu_search';
const SEARCH_LIST_ID = 'xiaohongshu_search.search_result_list';
const SEARCH_ITEM_ID = 'xiaohongshu_search.search_result_item';
const DETAIL_ROOT_ID = 'xiaohongshu_detail';
const DETAIL_MODAL_ID = 'xiaohongshu_detail.modal_shell';
const DETAIL_HEADER_ID = 'xiaohongshu_detail.header';
const DETAIL_CONTENT_ID = 'xiaohongshu_detail.content';
const DETAIL_GALLERY_ID = 'xiaohongshu_detail.gallery';
const DETAIL_COMMENT_SECTION_ID = 'xiaohongshu_detail.comment_section';
const DETAIL_COMMENT_ITEM_ID = 'xiaohongshu_detail.comment_section.comment_item';
const DETAIL_SHOW_MORE_ID = 'xiaohongshu_detail.comment_section.show_more_button';
const DETAIL_COMMENT_END_ID = 'xiaohongshu_detail.comment_section.end_marker';
const DETAIL_COMMENT_EMPTY_ID = 'xiaohongshu_detail.comment_section.empty_state';

function sanitizeName(name: string) {
  return (name || 'untitled').replace(/[\\/:*?"<>|.\s]/g, '_').trim().slice(0, 60);
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapSnapshot(node: ContainerTreeSnapshot | undefined | null): ContainerTreeSnapshot | null {
  if (!node) return null;
  const mapped: ContainerTreeSnapshot = {
    id: node.id,
    defId: node.defId || node.name || node.id,
    type: node.type,
    name: node.name,
    children: [],
  };
  const children = Array.isArray(node.children) ? node.children : [];
  mapped.children = children
    .map((child) =>
      mapSnapshot({
        id: child.id,
        defId: child.defId || child.name || child.id,
        type: child.type,
        name: child.name,
        children: child.children || [],
      }),
    )
    .filter(Boolean) as ContainerTreeSnapshot[];
  return mapped;
}

function findNodeByDefId(root: ContainerTreeSnapshot | null, defId: string): ContainerTreeSnapshot | null {
  if (!root) return null;
  if (root.defId === defId) return root;
  for (const child of root.children || []) {
    const match = findNodeByDefId(child, defId);
    if (match) return match;
  }
  return null;
}

function collectNodesByDefId(root: ContainerTreeSnapshot | null, defId: string): ContainerTreeSnapshot[] {
  if (!root) return [];
  const matches: ContainerTreeSnapshot[] = [];
  if (root.defId === defId) {
    matches.push(root);
  }
  for (const child of root.children || []) {
    matches.push(...collectNodesByDefId(child, defId));
  }
  return matches;
}

function normalizeExtraction(result: ExtractResult | undefined | null): Array<Record<string, any>> {
  if (!result) return [];
  if (Array.isArray(result.extracted)) return result.extracted;
  if (Array.isArray((result as any).data?.extracted)) return (result as any).data.extracted;
  if (Array.isArray((result as any).result?.extracted)) return (result as any).result.extracted;
  return [];
}

export async function execute(input: XiaohongshuCrawlerInput): Promise<XiaohongshuCrawlerOutput> {
  const {
    sessionId,
    keyword,
    targetCount = 50,
    serviceUrl = 'http://127.0.0.1:7701',
    maxNoNew = 10,
    savePath,
  } = input;

  const profile = sessionId;
  const basePath = savePath
    ? path.resolve(savePath)
    : path.join(os.homedir(), '.webauto', 'download', 'xiaohongshu', sanitizeName(keyword));

  async function httpPost<T>(endpoint: string, payload: Record<string, any>): Promise<T> {
    const res = await fetch(`${serviceUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  function unwrapData(payload: any): any {
    if (!payload || typeof payload !== 'object') return payload;
    if ('snapshot' in payload || 'sessions' in payload || 'result' in payload || 'matched' in payload) {
      return payload;
    }
    if ('data' in payload && payload.data) {
      return unwrapData(payload.data);
    }
    return payload;
  }

  async function controllerAction<T>(action: string, payload: Record<string, any>): Promise<T> {
    const response = await httpPost<ControllerResponse<T>>('/v1/controller/action', {
      action,
      payload,
    });
    if (response && typeof response === 'object' && 'success' in response && response.success === false) {
      throw new Error((response as any).error || `controller action ${action} failed`);
    }
    const raw = response?.data ?? response;
    return unwrapData(raw) as T;
  }

  async function executeContainerOperation(
    containerId: string,
    operationId: string,
    config: Record<string, any> = {},
  ): Promise<any> {
    return controllerAction<any>('container:operation', {
      containerId,
      operationId,
      config,
      sessionId: profile,
    });
  }

  async function inspectContainer(containerId: string, maxChildren = 50): Promise<ContainerTreeSnapshot | null> {
    const snapshot = await controllerAction<{ snapshot?: ContainerMatchSnapshot }>('containers:inspect-container', {
      profile,
      containerId,
      maxChildren,
    });
    return mapSnapshot(snapshot?.snapshot?.container_tree);
  }

  async function matchContainers(): Promise<{ match: ContainerMatchPayload; tree: ContainerTreeSnapshot | null }> {
    const currentUrl = await getCurrentUrl();
    const match = await controllerAction<ContainerMatchPayload>('containers:match', {
      profile,
      url: currentUrl,
      maxDepth: 3,
      maxChildren: 8,
    });
    const tree = mapSnapshot(match?.snapshot?.container_tree);
    return { match, tree };
  }

  async function getCurrentUrl(): Promise<string> {
    const result = await controllerAction<{ result?: string }>('browser:execute', {
      profile,
      script: 'location.href',
    });
    return (result as any)?.result || '';
  }

  async function runSearch(keywordText: string) {
    await controllerAction('browser:execute', {
      profile,
      script: `(() => {
        const input = document.querySelector('#search-input, input[type="search"]');
        if (input) {
          input.value = '${keywordText.replace(/'/g, "\\'")}';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }
      })();`,
    });
    await delay(3500);
  }

  async function ensureLoginState() {
    const url = await getCurrentUrl();
    if (!url.includes('/login')) {
      return;
    }
    console.warn('[XiaohongshuCrawler] 当前处于登录页，等待人工登录...');
    while (true) {
      await delay(3000);
      const curr = await getCurrentUrl();
      if (!curr.includes('/login')) {
        console.log('[XiaohongshuCrawler] 登录完成，继续执行。');
        break;
      }
      process.stdout.write('.');
    }
  }

  async function ensureSearchPageContext() {
    await runSearch(keyword);
  }

  async function waitForDetailContext(): Promise<ContainerTreeSnapshot | null> {
    for (let i = 0; i < 10; i++) {
      const { tree } = await matchContainers();
      if (!tree) {
        await delay(800);
        continue;
      }
      if (tree.defId === DETAIL_ROOT_ID || findNodeByDefId(tree, DETAIL_MODAL_ID)) {
        return tree;
      }
      await delay(800);
    }
    return null;
  }

  async function closeDetailModal() {
    await controllerAction('browser:execute', {
      profile,
      script: `(() => {
        const closeBtn = document.querySelector('.note-detail-mask [class*="close"], .note-detail .close');
        if (closeBtn) {
          closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return 'close-button';
        }
        window.history.back();
        return 'history-back';
      })();`,
    });
    await delay(2000);
  }

  async function scrollSearchPage() {
    await controllerAction('browser:execute', {
      profile,
      script: 'window.scrollBy(0, 800);',
    });
    await delay(2000);
  }

  async function fetchBrowserHeaders() {
    const info = await controllerAction<{ result?: { ua?: string; cookie?: string } }>('browser:execute', {
      profile,
      script: `({ ua: navigator.userAgent, cookie: document.cookie })`,
    });
    const payload = (info as any)?.result || {};
    return {
      'User-Agent': payload.ua || 'Mozilla/5.0',
      Cookie: payload.cookie || '',
      Referer: 'https://www.xiaohongshu.com/',
    };
  }

  async function downloadFile(url: string, dest: string, headers: Record<string, string>) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const buffer = await res.arrayBuffer();
      await fs.writeFile(dest, Buffer.from(buffer));
      return true;
    } catch (err) {
      console.warn(`[XiaohongshuCrawler] 图片下载失败 (${url}): ${(err as Error).message}`);
      return false;
    }
  }

  async function collectSearchItems(existingNotes: Set<string>) {
    const { tree } = await matchContainers();
    if (!tree) return [];
    if (tree.defId !== SEARCH_ROOT_ID) {
      await ensureSearchPageContext();
      const refreshed = await matchContainers();
      if (!refreshed.tree || refreshed.tree.defId !== SEARCH_ROOT_ID) {
        return [];
      }
      return collectSearchItems(existingNotes);
    }
    const listNode = findNodeByDefId(tree, SEARCH_LIST_ID);
    if (!listNode) return [];
    const inspected = await inspectContainer(listNode.id!, 80);
    const effectiveList = inspected || listNode;
    const itemNodes = collectNodesByDefId(effectiveList, SEARCH_ITEM_ID);
    const items: Array<{ nodeId: string; meta: Record<string, any> }> = [];
    for (const node of itemNodes) {
      if (!node.id) continue;
      try {
        const result = await executeContainerOperation(node.id, 'extract');
        const extracted = normalizeExtraction(result);
        const meta = extracted[0] || {};
        const noteId = meta.note_id || meta.noteId;
        if (!noteId || existingNotes.has(noteId)) {
          continue;
        }
        items.push({ nodeId: node.id, meta });
      } catch (err) {
        console.warn(`[XiaohongshuCrawler] 列表项提取失败: ${(err as Error).message}`);
      }
    }
    return items;
  }

  async function openDetailFromItem(item: { nodeId: string; meta: Record<string, any> }) {
    await executeContainerOperation(item.nodeId, 'highlight', {
      style: '2px solid #ea4335',
      duration: 1000,
    });
    await executeContainerOperation(item.nodeId, 'navigate', {
      wait_after_ms: 1200,
    });
    const detailTree = await waitForDetailContext();
    return detailTree;
  }

  async function scrollComments(sectionId: string) {
    for (let i = 0; i < 6; i++) {
      await executeContainerOperation(sectionId, 'scroll', {
        direction: 'down',
        distance: 600,
      });
      await delay(600);
      await executeContainerOperation(sectionId, 'find-child', {
        container_id: DETAIL_SHOW_MORE_ID,
      });
      await delay(600);
    }
  }

  async function collectDetailData(noteMeta: Record<string, any>) {
    const tree = await waitForDetailContext();
    if (!tree) {
      console.warn('[XiaohongshuCrawler] 无法匹配详情容器，跳过该笔记');
      return null;
    }
    const modalNode = findNodeByDefId(tree, DETAIL_MODAL_ID) || tree;
    const headerNode = findNodeByDefId(modalNode, DETAIL_HEADER_ID);
    const contentNode = findNodeByDefId(modalNode, DETAIL_CONTENT_ID);
    const galleryNode = findNodeByDefId(modalNode, DETAIL_GALLERY_ID);
    const commentSectionNode = findNodeByDefId(modalNode, DETAIL_COMMENT_SECTION_ID);

    const headerData = headerNode ? await executeContainerOperation(headerNode.id!, 'extract') : null;
    const contentData = contentNode ? await executeContainerOperation(contentNode.id!, 'extract') : null;
    const galleryData = galleryNode ? await executeContainerOperation(galleryNode.id!, 'extract') : null;

    const headerInfo = normalizeExtraction(headerData)[0] || {};
    const contentInfo = normalizeExtraction(contentData)[0] || {};
    const galleryInfo = normalizeExtraction(galleryData)[0] || {};

    let commentRecords: Array<Record<string, any>> = [];
    let reachedEnd = false;
    let isEmpty = false;

    if (commentSectionNode && commentSectionNode.id) {
      await scrollComments(commentSectionNode.id);
      const inspected = await inspectContainer(commentSectionNode.id, 160);
      const effective = inspected || commentSectionNode;
      const commentNodes = collectNodesByDefId(effective, DETAIL_COMMENT_ITEM_ID);
      const endMarkerNode = findNodeByDefId(effective, DETAIL_COMMENT_END_ID);
      const emptyNode = findNodeByDefId(effective, DETAIL_COMMENT_EMPTY_ID);
      reachedEnd = Boolean(endMarkerNode);
      isEmpty = Boolean(emptyNode);
      const temp: Array<Record<string, any>> = [];
      for (const node of commentNodes) {
        if (!node.id) continue;
        try {
          const result = await executeContainerOperation(node.id, 'extract');
          const info = normalizeExtraction(result)[0];
          if (info) temp.push(info);
        } catch (err) {
          console.warn(`[XiaohongshuCrawler] 评论提取失败: ${(err as Error).message}`);
        }
      }
      commentRecords = temp;
    }

    const detail = {
      title: contentInfo.title || noteMeta.title || '未命名笔记',
      text: contentInfo.text || '',
      author: {
        name: headerInfo.author_name || '未知作者',
        link: headerInfo.author_link || '',
      },
      images: Array.isArray(galleryInfo.images) ? galleryInfo.images : [],
      comments: commentRecords,
      commentsEndReached: reachedEnd,
      commentsEmpty: isEmpty,
    };

    return detail;
  }

  async function saveNoteData(
    noteId: string,
    detail: {
      title: string;
      text: string;
      author: { name: string; link?: string };
      images: string[];
      comments: Array<Record<string, any>>;
      commentsEndReached: boolean;
      commentsEmpty: boolean;
    },
    headers: Record<string, string>,
  ) {
    const dirName = `${sanitizeName(detail.title)}_${noteId}`;
    const noteDir = path.join(basePath, dirName);
    const imagesDir = path.join(noteDir, 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    const savedImages: string[] = [];
    for (let i = 0; i < detail.images.length; i++) {
      let imgUrl: string = detail.images[i];
      if (!imgUrl) continue;
      if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
      const ext = imgUrl.includes('.png') ? '.png' : '.jpg';
      const filename = `${i + 1}${ext}`;
      const destPath = path.join(imagesDir, filename);
      let success = false;
      for (let retry = 0; retry < 3; retry++) {
        success = await downloadFile(imgUrl, destPath, headers);
        if (success) break;
        await delay(1000);
      }
      savedImages.push(success ? `./images/${filename}` : imgUrl);
    }

    const commentSection = detail.comments
      .map((c, idx) => {
        const name = c.user_name || c.user || '匿名用户';
        const id = c.user_id || c.userId || '';
        const text = c.text || '';
        const timestamp = c.timestamp || '';
        return `### ${idx + 1}. ${name}${id ? ` (${id})` : ''}\n- 时间：${timestamp}\n\n${text}\n`;
      })
      .join('\n');

    const metadataLines = [
      `- **关键字**: ${keyword}`,
      `- **作者**: ${detail.author.name}${detail.author.link ? ` ｜ [主页](${detail.author.link})` : ''}`,
      `- **Note ID**: ${noteId}`,
      `- **评论统计**: ${detail.comments.length} 条 / 结尾标记：${detail.commentsEndReached ? '是' : '否'} / 空状态：${
        detail.commentsEmpty ? '是' : '否'
      }`,
    ];

    const markdown = [
      `# ${detail.title}`,
      '',
      metadataLines.join('\n'),
      '',
      '## 正文',
      '',
      detail.text || '（正文为空）',
      '',
      '## 图片',
      '',
      savedImages.map((img) => `![](${img})`).join('\n') || '（无图片）',
      '',
      `## 评论（${detail.comments.length}）`,
      '',
      commentSection || '（暂无评论）',
    ].join('\n');

    await fs.writeFile(path.join(noteDir, 'content.md'), markdown, 'utf-8');
    console.log(`[XiaohongshuCrawler] Saved: ${dirName}`);
  }

  try {
    await fs.mkdir(basePath, { recursive: true });
    const existingDirs = await fs.readdir(basePath).catch(() => []);
    const collectedIds = new Set<string>();
    for (const dir of existingDirs) {
      const parts = dir.split('_');
      const possibleId = parts[parts.length - 1];
      if (possibleId && possibleId.length > 10) {
        collectedIds.add(possibleId);
      }
    }

    await ensureLoginState();
    await ensureSearchPageContext();
    const headers = await fetchBrowserHeaders();

    let sessionCollectedCount = 0;
    let noNewCycles = 0;

    while (sessionCollectedCount < targetCount && noNewCycles < maxNoNew) {
      const items = await collectSearchItems(collectedIds);
      if (!items.length) {
        noNewCycles++;
        await scrollSearchPage();
        continue;
      }
      noNewCycles = 0;

      for (const item of items) {
        if (sessionCollectedCount >= targetCount) break;
        const noteId = item.meta.note_id || item.meta.noteId;
        if (!noteId || collectedIds.has(noteId)) {
          continue;
        }
        console.log(
          `[XiaohongshuCrawler] 处理第 ${sessionCollectedCount + 1}/${targetCount} 条：${item.meta.title || noteId}`,
        );
        const detailTree = await openDetailFromItem(item);
        if (!detailTree) {
          console.warn('[XiaohongshuCrawler] 打开详情失败，跳过该笔记');
          continue;
        }
        const detailData = await collectDetailData(item.meta);
        if (!detailData) {
          await closeDetailModal();
          await ensureSearchPageContext();
          continue;
        }
        await saveNoteData(noteId, detailData, headers);
        collectedIds.add(noteId);
        sessionCollectedCount++;
        await closeDetailModal();
        await ensureSearchPageContext();
      }

      if (sessionCollectedCount < targetCount) {
        await scrollSearchPage();
      }
    }

    return {
      success: true,
      collectedCount: sessionCollectedCount,
      savePath: basePath,
    };
  } catch (err: any) {
    console.error(`[XiaohongshuCrawler] Error: ${err.message}`);
    return {
      success: false,
      collectedCount: 0,
      savePath: basePath,
      error: err.message,
    };
  }
}

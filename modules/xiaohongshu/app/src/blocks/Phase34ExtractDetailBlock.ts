/**
 * Phase 3-4 Block: 提取详情内容
 *
 * 职责：
 * 1. 容器匹配详情页内容区域
 * 2. 高亮验证内容可见
 * 3. 容器操作提取标题、正文、作者、图片
 * 4. 返回结构化数据 + anchor
 */

export interface ExtractDetailInput {
  noteId: string;
  profile?: string;
  unifiedApiUrl?: string;
}

export interface ExtractDetailOutput {
  success: boolean;
  noteId: string;
  detail?: {
    title: string;
    content: string;
    authorName: string;
    authorId: string;
    publishTime: string;
    images: string[];
  };
  anchor?: {
    containerId: string;
    rect: { x: number; y: number; width: number; height: number };
  };
  error?: string;
}

async function controllerAction(action: string, payload: any, apiUrl: string) {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function execute(input: ExtractDetailInput): Promise<ExtractDetailOutput> {
  const {
    noteId,
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
  } = input;

  console.log(`[Phase34ExtractDetail] 提取详情: ${noteId}`);

  // 1. 验证当前在详情页
  const currentUrl = await controllerAction('browser:execute', {
    profile,
    script: 'window.location.href',
  }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');

  if (!currentUrl.includes(`/explore/${noteId}`)) {
    return {
      success: false,
      noteId,
      error: `当前不在详情页: ${currentUrl}`,
    };
  }

  // 2. 容器匹配内容区域（以 container-library 为准）
  const contentContainerId = 'xiaohongshu_detail.content';
  const headerContainerId = 'xiaohongshu_detail.header';
  const galleryContainerId = 'xiaohongshu_detail.gallery';

  // 3. 高亮验证
  const highlightResult = await controllerAction('container:operation', {
    containerId: contentContainerId,
    operationId: 'highlight',
    sessionId: profile,
  }, unifiedApiUrl);

  if (!highlightResult?.success) {
    return {
      success: false,
      noteId,
      error: `内容区域不可用: ${contentContainerId}`,
    };
  }

  await delay(500);

  // 4. 提取正文（包含 title/text）
  const contentResult = await controllerAction(
    'container:operation',
    {
      containerId: contentContainerId,
      operationId: 'extract',
      sessionId: profile,
      config: { fields: ['title', 'text'] },
    },
    unifiedApiUrl,
  ).catch((): null => null);

  const contentRow = Array.isArray(contentResult?.extracted) ? contentResult.extracted[0] : (contentResult?.data?.extracted?.[0] ?? null);
  const title = String(contentRow?.title || '');
  const content = String(contentRow?.text || '');

  // 5. 提取作者
  const headerResult = await controllerAction(
    'container:operation',
    {
      containerId: headerContainerId,
      operationId: 'extract',
      sessionId: profile,
      config: { fields: ['author_name', 'author_link'] },
    },
    unifiedApiUrl,
  ).catch((): null => null);

  const headerRow = Array.isArray(headerResult?.extracted) ? headerResult.extracted[0] : (headerResult?.data?.extracted?.[0] ?? null);
  const authorName = String(headerRow?.author_name || '');
  const authorLink = String(headerRow?.author_link || '');
  let authorId = '';
  try {
    if (authorLink) {
      const u = new URL(authorLink, 'https://www.xiaohongshu.com');
      authorId = u.pathname.split('/').filter(Boolean).slice(-1)[0] || '';
    }
  } catch {
    authorId = '';
  }

  // 6. 提取图片
  const galleryResult = await controllerAction(
    'container:operation',
    {
      containerId: galleryContainerId,
      operationId: 'extract',
      sessionId: profile,
      config: { fields: ['images'] },
    },
    unifiedApiUrl,
  ).catch((): null => null);

  const galleryRow = Array.isArray(galleryResult?.extracted)
    ? galleryResult.extracted[0]
    : (galleryResult?.data?.extracted?.[0] ?? null);
  const images = Array.isArray(galleryRow?.images) ? galleryRow.images : (galleryRow?.images ? [galleryRow.images] : []);

  // 8. 获取 anchor（用于调试）
  const rect = highlightResult?.anchor?.rect || highlightResult?.rect;

  console.log(`[Phase34ExtractDetail] ✅ 提取完成: 标题="${title.slice(0, 20)}..." 图片=${images.length}张`);

  return {
    success: true,
    noteId,
    detail: {
      title,
      content,
      authorName,
      authorId,
      publishTime: new Date().toISOString(),
      images: Array.isArray(images) ? images : [images],
    },
    anchor: {
      containerId: contentContainerId,
      rect: rect || { x: 0, y: 0, width: 0, height: 0 },
    },
  };
}

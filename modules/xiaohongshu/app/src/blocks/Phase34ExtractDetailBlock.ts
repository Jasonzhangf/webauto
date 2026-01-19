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

  // 2. 容器匹配内容区域
  const contentContainerId = 'xiaohongshu_detail.content_anchor';

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

  // 4. 提取标题
  const titleResult = await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.title',
    operationId: 'extract',
    sessionId: profile,
    config: { field: 'text' },
  }, unifiedApiUrl);

  const title = titleResult?.data?.text || titleResult?.text || '';

  // 5. 提取正文
  const contentResult = await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.content',
    operationId: 'extract',
    sessionId: profile,
    config: { field: 'text' },
  }, unifiedApiUrl);

  const content = contentResult?.data?.text || contentResult?.text || '';

  // 6. 提取作者
  const authorResult = await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.author',
    operationId: 'extract',
    sessionId: profile,
    config: { fields: ['name', 'id'] },
  }, unifiedApiUrl);

  const authorName = authorResult?.data?.name || authorResult?.name || '';
  const authorId = authorResult?.data?.id || authorResult?.id || '';

  // 7. 提取图片
  const imagesResult = await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.images',
    operationId: 'extract',
    sessionId: profile,
    config: { field: 'src', multiple: true },
  }, unifiedApiUrl);

  const images = imagesResult?.data?.src || imagesResult?.src || [];

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

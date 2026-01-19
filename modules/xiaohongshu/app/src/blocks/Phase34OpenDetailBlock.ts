/**
 * Phase 3-4 Block: 打开详情页
 *
 * 职责：
 * 1. 使用 safeUrl 打开详情页（禁止构造 URL）
 * 2. 等待页面加载完成
 * 3. 高亮验证内容区域可见
 */

export interface OpenDetailInput {
  noteId: string;
  safeUrl: string;
  profile?: string;
  unifiedApiUrl?: string;
}

export interface OpenDetailOutput {
  success: boolean;
  noteId: string;
  currentUrl: string;
  anchor?: {
    containerId: string;
    rect: { x: number; y: number; width: number; height: number };
  };
}

async function controllerAction(action: string, payload: any, apiUrl: string) {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function execute(input: OpenDetailInput): Promise<OpenDetailOutput> {
  const {
    noteId,
    safeUrl,
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
  } = input;

  console.log(`[Phase34OpenDetail] 打开详情页: ${noteId}`);

  // 1. 校验 safeUrl 包含 xsec_token
  if (!safeUrl.includes('xsec_token')) {
    throw new Error(`[Phase34OpenDetail] safeUrl 缺少 xsec_token: ${safeUrl}`);
  }

  // 2. 使用 browser:goto 导航到详情页
  const gotoResult = await controllerAction('browser:goto', {
    profile,
    url: safeUrl,
  }, unifiedApiUrl);

  if (!gotoResult?.success) {
    throw new Error(`[Phase34OpenDetail] 导航失败: ${gotoResult?.error || 'unknown'}`);
  }

  // 3. 等待页面加载完成
  await delay(3000);

  // 4. 验证当前 URL 匹配 noteId
  const currentUrl = await controllerAction('browser:execute', {
    profile,
    script: 'window.location.href',
  }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');

  if (!currentUrl.includes(noteId)) {
    throw new Error(`[Phase34OpenDetail] URL 不匹配，期望 ${noteId}，实际 ${currentUrl}`);
  }

  // 5. 高亮验证内容区域可见
  const highlightResult = await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.content_anchor',
    operationId: 'highlight',
    sessionId: profile,
  }, unifiedApiUrl);

  if (highlightResult?.success === false) {
    throw new Error(`[Phase34OpenDetail] 内容区域不可见: xiaohongshu_detail.content_anchor`);
  }

  // 6. 视口保护：验证元素在视口内
  const rect = highlightResult?.anchor?.rect || highlightResult?.rect;
  if (rect) {
    const viewportHeight = 2160; // 与 Phase1 启动时设置的高度一致
    const isInViewport = rect.y >= 0 && (rect.y + rect.height) <= viewportHeight;

    if (!isInViewport) {
      throw new Error(`[Phase34OpenDetail] 内容区域不在视口内: rect=${JSON.stringify(rect)}, viewportHeight=${viewportHeight}`);
    }

    console.log(`[Phase34OpenDetail] ✅ 视口验证通过: y=${rect.y}, height=${rect.height}`);
  }

  await delay(500);

  console.log(`[Phase34OpenDetail] ✅ 详情页加载完成: ${noteId}`);

  return {
    success: true,
    noteId,
    currentUrl,
    anchor: highlightResult?.anchor,
  };
}

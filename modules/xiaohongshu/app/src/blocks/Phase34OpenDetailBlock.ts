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

async function getViewportHeight(profile: string, apiUrl: string): Promise<number> {
  try {
    const res = await controllerAction('browser:execute', {
      profile,
      script: 'window.innerHeight',
    }, apiUrl);
    const h = Number(res?.result || res?.data?.result || res?.data || 0);
    return Number.isFinite(h) && h > 0 ? h : 0;
  } catch {
    return 0;
  }
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

  // controllerAction 返回形态可能是：
  // - { ok: true }
  // - { success: true, data: { ok: true } }
  // - { success: false, error: ... }
  // 这里把 browser-service 的底层错误透传出来，避免 “unknown” 无法诊断。
  const okFlag =
    gotoResult?.ok === true ||
    gotoResult?.data?.ok === true ||
    gotoResult?.success === true;
  const gotoOk = Boolean(okFlag);
  if (!gotoOk) {
    const detail = gotoResult?.data?.error || gotoResult?.error || JSON.stringify(gotoResult);
    throw new Error(`[Phase34OpenDetail] 导航失败: ${detail}`);
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
  // 容器命名以 container-library 为准：详情正文容器为 xiaohongshu_detail.content。
  const highlightResult = await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.content',
    operationId: 'highlight',
    sessionId: profile,
  }, unifiedApiUrl);

  if (highlightResult?.success === false) {
    throw new Error(`[Phase34OpenDetail] 内容区域不可见: xiaohongshu_detail.content`);
  }

  // 6. 视口保护：只做“可见性/有尺寸”校验，不强制要求完全在视口内。
  // 说明：在 Camoufox + 多窗口情况下，window.innerHeight 可能固定较小（如 707），
  // 但页面仍可正常交互。强制 in-viewport 会导致误判并中断。
  const rect = highlightResult?.anchor?.rect || highlightResult?.rect;
  if (rect) {
    const width = Number(rect.width ?? (rect.x2 - rect.x1));
    const height = Number(rect.height ?? (rect.y2 - rect.y1));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error(`[Phase34OpenDetail] 内容区域 rect 无效: ${JSON.stringify(rect)}`);
    }
    const viewportHeightRaw = await getViewportHeight(profile, unifiedApiUrl);
    console.log(`[Phase34OpenDetail] rect ok (w=${width}, h=${height}), viewportHeight=${viewportHeightRaw}`);
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

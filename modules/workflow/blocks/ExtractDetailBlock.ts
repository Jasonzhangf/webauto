/**
 * Workflow Block: ExtractDetailBlock
 *
 * 提取详情页内容（header/content/gallery）
 */

import {
  logControllerActionError,
  logControllerActionResult,
  logControllerActionStart,
} from './helpers/operationLogger.js';

export interface ExtractDetailInput {
  sessionId: string;
  serviceUrl?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetailData {
  header?: Record<string, any>;
  content?: Record<string, any>;
  gallery?: Record<string, any>;
}

export interface ExtractDetailOutput {
  success: boolean;
  detail?: DetailData;
  anchor?: {
    headerContainerId?: string;
    headerRect?: Rect;
    contentContainerId?: string;
    contentRect?: Rect;
    galleryContainerId?: string;
    galleryRect?: Rect;
    verified?: boolean;
  };
  error?: string;
}

/**
 * 提取详情页内容
 *
 * @param input - 输入参数
 * @returns Promise<ExtractDetailOutput>
 */
export async function execute(input: ExtractDetailInput): Promise<ExtractDetailOutput> {
  const {
    sessionId,
    serviceUrl = 'http://127.0.0.1:7701'
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;

  async function controllerAction(action: string, payload: any = {}) {
    const opId = logControllerActionStart(action, payload, { source: 'ExtractDetailBlock' });
    try {
      const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      // 防御性超时，避免 containers:match / operation 长时间挂起
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    const result = data.data || data;
    logControllerActionResult(opId, action, result, { source: 'ExtractDetailBlock' });
    return result;
  } catch (error) {
    logControllerActionError(opId, action, error, payload, { source: 'ExtractDetailBlock' });
    throw error;
  }
  }

  async function extractContainer(containerId: string) {
    const result = await controllerAction('container:operation', {
      containerId,
      operationId: 'extract',
      config: {},
      sessionId: profile
    });

    return result.data?.extracted?.[0] || result.extracted?.[0] || {};
  }

  async function extractGalleryImagesFromDom(rootSelectors: string[] = []): Promise<string[]> {
    try {
      const result = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const urls = new Set();

          const rootSelectors = ${JSON.stringify(rootSelectors)};
          const fallbackSelectors = [
            ".media-container img",
            ".note-slider-list img",
            ".note-img img",
            ".note-scroller img",
            "img[src*='sns-img']",
            "img[data-src*='sns-img']"
          ];

          const selectors = [];

          // 优先：基于 gallery 容器 selector 的 root 内部查找 IMG
          if (Array.isArray(rootSelectors) && rootSelectors.length > 0) {
            for (const sel of rootSelectors) {
              if (typeof sel !== 'string' || !sel.trim()) continue;
              selectors.push(sel + " img");
            }
          }

          // 兜底：保留原有的一组全局 IMG selectors
          selectors.push(...fallbackSelectors);

          // 辅助函数：从单个节点提取 src / data-src / background-image
          const addUrlFromNode = (node) => {
            if (!node) return;

            // 1) IMG / SOURCE 类节点
            let src =
              node.currentSrc ||
              node.src ||
              (typeof node.getAttribute === "function" &&
                (node.getAttribute("src") || node.getAttribute("data-src")));

            // 2) 背景图：检查 inline style 与 computed style 的 background-image
            if (!src && typeof window !== "undefined") {
              try {
                const style = window.getComputedStyle(node);
                const bg = style && (style.backgroundImage || style.background);
                if (bg && bg.includes("url(")) {
                  // 解析 url("...") / url('...') / url(...)
                  const match = bg.match(/url\\(([^)]+)\\)/);
                  if (match && match[1]) {
                    src = match[1].trim().replace(/^['"]|['"]$/g, "");
                  }
                }
              } catch (_) {
                // ignore style errors
              }
            }

            if (typeof src === "string") {
              const trimmed = src.trim();
              if (trimmed) {
                urls.add(trimmed);
              }
            }
          };

          // 先扫 IMG
          for (const sel of selectors) {
            try {
              document.querySelectorAll(sel).forEach((node) => {
                addUrlFromNode(node);
              });
            } catch (_) {
              // 单个 selector 出错不影响整体
            }
          }

          // 再在 gallery root 内扫描可能只用背景图渲染的节点（基于 computedStyle.backgroundImage）
          const roots = [];
          if (Array.isArray(rootSelectors) && rootSelectors.length > 0) {
            for (const sel of rootSelectors) {
              try {
                const el = document.querySelector(sel);
                if (el) roots.push(el);
              } catch (_) {}
            }
          }
          if (!roots.length && document.body) {
            roots.push(document.body);
          }

          const MAX_BG_NODES = 400;
          for (const root of roots) {
            try {
              const nodes = root.querySelectorAll('*');
              const len = Math.min(nodes.length, MAX_BG_NODES);
              for (let i = 0; i < len; i++) {
                addUrlFromNode(nodes[i]);
              }
            } catch (_) {
              // ignore
            }
          }

          return Array.from(urls);
        })()`
      });

      const payload = (result as any).result || (result as any).data?.result || result;
      if (Array.isArray(payload)) {
        return payload.filter((v) => typeof v === 'string' && v.trim().length > 0);
      }
      if (payload && Array.isArray((payload as any).urls)) {
        return (payload as any).urls.filter((v: any) => typeof v === 'string' && v.trim().length > 0);
      }
      return [];
    } catch (e: any) {
      console.warn(`[ExtractDetail] fallback DOM image extraction error: ${e?.message || e}`);
      return [];
    }
  }

  try {
    const { verifyAnchorByContainerId, getPrimarySelectorByContainerId } = await import('./helpers/containerAnchors.js');

    // 1. 直接使用固定的详情子容器 ID（避免依赖 containers:match）
    const headerNode = { id: 'xiaohongshu_detail.header' };
    const contentNode = { id: 'xiaohongshu_detail.content' };
    const galleryNode = { id: 'xiaohongshu_detail.gallery' };

    // 3. 提取数据
    const detail: DetailData = {};

    let headerRect: Rect | undefined;
    let contentRect: Rect | undefined;
    let galleryRect: Rect | undefined;

    // 3.1 header：高亮 + Rect + 数据
    if (headerNode?.id) {
      try {
        const anchor = await verifyAnchorByContainerId(
          headerNode.id,
          profile,
          serviceUrl,
          '2px solid #ff8800',
          1500
        );
        if (anchor.found && anchor.rect) {
          headerRect = anchor.rect;
          console.log(`[ExtractDetail] header rect: ${JSON.stringify(anchor.rect)}`);
        } else {
          console.warn(
            `[ExtractDetail] header anchor verify failed: ${anchor.error || 'not found'}`
          );
        }
      } catch (e: any) {
        console.warn(`[ExtractDetail] header anchor verify error: ${e.message}`);
      }
      detail.header = await extractContainer(headerNode.id);
    }

    // 3.2 content：高亮 + Rect + 数据
    if (contentNode?.id) {
      try {
        const anchor = await verifyAnchorByContainerId(
          contentNode.id,
          profile,
          serviceUrl,
          '2px solid #00aa00',
          1500
        );
        if (anchor.found && anchor.rect) {
          contentRect = anchor.rect;
          console.log(`[ExtractDetail] content rect: ${JSON.stringify(anchor.rect)}`);
        } else {
          console.warn(
            `[ExtractDetail] content anchor verify failed: ${anchor.error || 'not found'}`
          );
        }
      } catch (e: any) {
        console.warn(`[ExtractDetail] content anchor verify error: ${e.message}`);
      }
      detail.content = await extractContainer(contentNode.id);
    }

    // 3.3 gallery：高亮 + Rect + 数据
    if (galleryNode?.id) {
      let galleryAnchorOk = false;
      try {
        const anchor = await verifyAnchorByContainerId(
          galleryNode.id,
          profile,
          serviceUrl,
          '2px solid #0088ff',
          1500,
        );
        if (anchor.found && anchor.rect) {
          galleryRect = anchor.rect;
          galleryAnchorOk = true;
          console.log(`[ExtractDetail] gallery rect: ${JSON.stringify(anchor.rect)}`);
        } else {
          console.warn(
            `[ExtractDetail] gallery anchor verify failed: ${anchor.error || 'not found'}`,
          );
        }
      } catch (e: any) {
        console.warn(`[ExtractDetail] gallery anchor verify error: ${e.message}`);
      }

      // 「无锚不动」：如果 gallery 容器锚点未命中，则不做任何图片提取，避免误采头像 / 推荐流图片。
      if (!galleryAnchorOk) {
        console.warn('[ExtractDetail] gallery anchor not found, skip gallery extraction entirely');
      } else {
        const galleryData: Record<string, any> =
          (await extractContainer(galleryNode.id)) || {};

        // 处理图片字段：兼容字符串 / 对象数组，并在为空时用 DOM 兜底
        let images: string[] = [];
        const rawImages = (galleryData as any).images;

        if (Array.isArray(rawImages)) {
          images = rawImages
            .map((item: any) => {
              if (!item) return '';
              if (typeof item === 'string') return item;
              if (typeof item === 'object') {
                return (item.src || item.url || item.href || '').trim();
              }
              return '';
            })
            .filter((v: string) => v.length > 0);
        } else if (typeof rawImages === 'string') {
          const v = rawImages.trim();
          if (v) images.push(v);
        }

        // 若容器未返回图片，则尝试直接从 DOM 中聚合一次（优先基于 gallery 容器 selector 作为 root）
        if (images.length === 0) {
          const gallerySelector =
            (await getPrimarySelectorByContainerId(galleryNode.id)) || '';
          const domImages = await extractGalleryImagesFromDom(
            gallerySelector ? [gallerySelector] : [],
          );
          if (domImages.length > 0) {
            images = domImages;
          }
        }

        if (images.length > 0) {
          // 去重，避免 swiper 结构中的 duplicate slide 导致重复图片
          images = Array.from(new Set(images));
          console.log(`[ExtractDetail] gallery images count after dedupe: ${images.length}`);
          galleryData.images = images;
        } else {
          console.warn('[ExtractDetail] gallery images still empty after DOM fallback');
        }

        detail.gallery = galleryData;
      }
    }

    // 4. Rect 规则验证：header 在顶部，content 在中部，gallery 在下方
    let verified = false;
    if (headerRect && contentRect && galleryRect) {
      const headerOk = headerRect.y < 300 && headerRect.height > 0;
      const contentOk = contentRect.y > headerRect.y && contentRect.height > 0;
      const galleryOk = galleryRect.y > contentRect.y && galleryRect.height > 0;
      verified = headerOk && contentOk && galleryOk;
      console.log(`[ExtractDetail] Rect validation: header=${headerOk}, content=${contentOk}, gallery=${galleryOk}`);
    }

    return {
      success: true,
      detail,
      anchor: {
        headerContainerId: headerNode?.id,
        headerRect,
        contentContainerId: contentNode?.id,
        contentRect,
        galleryContainerId: galleryNode?.id,
        galleryRect,
        verified
      }
    };

  } catch (error: any) {
    return {
      success: false,
      error: `ExtractDetail failed: ${error.message}`
    };
  }
}

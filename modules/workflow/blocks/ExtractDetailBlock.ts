/**
 * Workflow Block: ExtractDetailBlock
 *
 * 提取详情页内容（header/content/gallery）
 */

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
    return data.data || data;
  }

  function findContainer(tree: any, pattern: RegExp): any {
    if (!tree) return null;
    if (pattern.test(tree.id || tree.defId || '')) return tree;
    if (Array.isArray(tree.children)) {
      for (const child of tree.children) {
        const found = findContainer(child, pattern);
        if (found) return found;
      }
    }
    return null;
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

  try {
    const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');

    // 1. 匹配详情容器树
    const matchResult = await controllerAction('containers:match', {
      profile,
      maxDepth: 4,
      maxChildren: 20
    });

    const tree = matchResult.snapshot?.container_tree || matchResult.container_tree;
    if (!tree) {
      throw new Error('未获取到详情容器树');
    }

    // 2. 查找详情子容器
    const headerNode = findContainer(tree, /xiaohongshu_detail\.header$/);
    const contentNode = findContainer(tree, /xiaohongshu_detail\.content$/);
    const galleryNode = findContainer(tree, /xiaohongshu_detail\.gallery$/);

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
      try {
        const anchor = await verifyAnchorByContainerId(
          galleryNode.id,
          profile,
          serviceUrl,
          '2px solid #0088ff',
          1500
        );
        if (anchor.found && anchor.rect) {
          galleryRect = anchor.rect;
          console.log(`[ExtractDetail] gallery rect: ${JSON.stringify(anchor.rect)}`);
        } else {
          console.warn(
            `[ExtractDetail] gallery anchor verify failed: ${anchor.error || 'not found'}`
          );
        }
      } catch (e: any) {
        console.warn(`[ExtractDetail] gallery anchor verify error: ${e.message}`);
      }
      detail.gallery = await extractContainer(galleryNode.id);
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

/**
 * 简化的锚点验证 - 绕过 containers:match 超时问题
 * 直接使用 browser:execute 进行高亮和 Rect 获取
 */

export interface SimpleAnchorResult {
  found: boolean;
  highlighted: boolean;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  error?: string;
}

/**
 * 通过 CSS 选择器验证锚点
 */
export async function verifyAnchorBySelector(
  selector: string,
  sessionId: string,
  serviceUrl: string = 'http://127.0.0.1:7701',
  highlightStyle: string = '3px solid #ff4444',
  highlightDuration: number = 2000
): Promise<SimpleAnchorResult> {
  try {
    const script = `
      (() => {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return { success: false, error: 'Element not found' };
        
        // 高亮
        el.style.outline = '${highlightStyle.replace(/'/g, "\\'")}';
        setTimeout(() => { el.style.outline = ''; }, ${highlightDuration});
        
        // 获取 Rect
        const rect = el.getBoundingClientRect();
        return { 
          success: true, 
          rect: { 
            x: rect.x, 
            y: rect.y, 
            width: rect.width, 
            height: rect.height 
          }
        };
      })()
    `;

    const response = await fetch(`${serviceUrl}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile: sessionId,
          script
        }
      })
    });

    if (!response.ok) {
      return {
        found: false,
        highlighted: false,
        error: `HTTP ${response.status}: ${await response.text()}`
      };
    }

    const data = await response.json();
    const result = data.data?.result || data.result;

    if (!result || !result.success) {
      return {
        found: false,
        highlighted: false,
        error: result?.error || 'Unknown error'
      };
    }

    return {
      found: true,
      highlighted: true,
      rect: result.rect
    };
  } catch (error: any) {
    return {
      found: false,
      highlighted: false,
      error: `verifyAnchorBySelector failed: ${error.message}`
    };
  }
}

/**
 * 高亮多个元素（例如列表中的所有 item）
 */
export async function highlightMultipleBySelector(
  selector: string,
  sessionId: string,
  serviceUrl: string = 'http://127.0.0.1:7701',
  highlightStyle: string = '2px solid #4285f4',
  highlightDuration: number = 1500
): Promise<{ count: number; rects: any[]; error?: string }> {
  try {
    const script = `
      (() => {
        const els = Array.from(document.querySelectorAll('${selector.replace(/'/g, "\\'")}'));
        if (els.length === 0) return { success: false, error: 'No elements found' };
        
        const rects = els.map(el => {
          el.style.outline = '${highlightStyle.replace(/'/g, "\\'")}';
          setTimeout(() => { el.style.outline = ''; }, ${highlightDuration});
          
          const rect = el.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        });
        
        return { success: true, count: els.length, rects };
      })()
    `;

    const response = await fetch(`${serviceUrl}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile: sessionId,
          script
        }
      })
    });

    if (!response.ok) {
      return {
        count: 0,
        rects: [],
        error: `HTTP ${response.status}: ${await response.text()}`
      };
    }

    const data = await response.json();
    const result = data.data?.result || data.result;

    if (!result || !result.success) {
      return {
        count: 0,
        rects: [],
        error: result?.error || 'Unknown error'
      };
    }

    return {
      count: result.count,
      rects: result.rects
    };
  } catch (error: any) {
    return {
      count: 0,
      rects: [],
      error: `highlightMultipleBySelector failed: ${error.message}`
    };
  }
}

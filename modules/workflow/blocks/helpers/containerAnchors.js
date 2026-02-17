/**
 * 容器锚点验证辅助函数（不依赖 containers:match）
 * 直接从容器定义 JSON 读取 selector，然后用 browser:execute 高亮 + Rect 回环
 *
 * 注意：这里不使用 dist 里的 ContainerDefinitionLoader（V2 结构只保留了 classes，丢失 css），
 * 而是直接读取 container-library 下的原始 JSON，保证 selector.css 可用。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logError, logOperation } from './operationLogger.js';
const repoRoot = path.resolve(process.cwd());
const userContainerRoot = process.env.WEBAUTO_USER_CONTAINER_ROOT || path.join(os.homedir(), '.webauto', 'container-lib');
const containerIndexPath = process.env.WEBAUTO_CONTAINER_INDEX || path.join(repoRoot, 'apps/webauto/resources/container-library.index.json');
const definitionCache = new Map();
function loadContainerIndex() {
    try {
        const content = fs.readFileSync(containerIndexPath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
function findSiteKeyForContainer(containerId, index) {
    if (!index)
        return null;
    const keys = Object.keys(index);
    for (const key of keys) {
        if (containerId.startsWith(`${key}_`))
            return key;
    }
    return null;
}
function findContainerJsonPath(containerId) {
    const index = loadContainerIndex();
    const siteKey = findSiteKeyForContainer(containerId, index) || 'xiaohongshu';
    const rootDir = path.join(repoRoot, 'apps/webauto/resources/container-library', siteKey);
    if (!fs.existsSync(rootDir)) {
        return null;
    }
    const stack = [rootDir];
    while (stack.length > 0) {
        const current = stack.pop();
        const stat = fs.statSync(current);
        if (stat.isDirectory()) {
            const entries = fs.readdirSync(current);
            for (const entry of entries) {
                stack.push(path.join(current, entry));
            }
        }
        else if (current.endsWith('.json')) {
            try {
                const content = fs.readFileSync(current, 'utf-8');
                const json = JSON.parse(content);
                if (json && json.id === containerId) {
                    return current;
                }
            }
            catch {
                // ignore malformed JSON
            }
        }
    }
    return null;
}
async function findContainerDefinition(containerId) {
    if (definitionCache.has(containerId)) {
        const cached = definitionCache.get(containerId);
        if (cached) {
            return cached;
        }
        // 如果之前没有找到（缓存为 null），重新扫描一次，避免负缓存长期生效
    }
    // 优先从用户自定义容器根查找
    if (userContainerRoot && fs.existsSync(userContainerRoot)) {
        const userRoot = path.join(userContainerRoot, 'xiaohongshu');
        if (fs.existsSync(userRoot)) {
            const stack = [userRoot];
            while (stack.length > 0) {
                const current = stack.pop();
                const stat = fs.statSync(current);
                if (stat.isDirectory()) {
                    const entries = fs.readdirSync(current);
                    for (const entry of entries) {
                        stack.push(path.join(current, entry));
                    }
                }
                else if (current.endsWith('.json')) {
                    try {
                        const content = fs.readFileSync(current, 'utf-8');
                        const json = JSON.parse(content);
                        if (json && json.id === containerId) {
                            definitionCache.set(containerId, json);
                            return json;
                        }
                    }
                    catch {
                        // ignore
                    }
                }
            }
        }
    }
    const jsonPath = findContainerJsonPath(containerId);
    if (!jsonPath) {
        return null;
    }
    try {
        const content = fs.readFileSync(jsonPath, 'utf-8');
        const json = JSON.parse(content);
        definitionCache.set(containerId, json);
        return json;
    }
    catch (error) {
        return null;
    }
}
function pickPrimarySelector(container) {
    const selectors = container.selectors || [];
    if (!selectors.length)
        return null;
    const primary = selectors.find((item) => item.variant === 'primary') || selectors[0];
    return primary?.css || null;
}
export async function getPrimarySelectorByContainerId(containerId) {
    const container = await findContainerDefinition(containerId);
    if (!container) {
        return null;
    }
    return pickPrimarySelector(container);
}
export async function getContainerExtractorsById(containerId) {
    const container = await findContainerDefinition(containerId);
    if (!container || !container.extractors || typeof container.extractors !== 'object') {
        return null;
    }
    return container.extractors;
}
export async function verifyAnchorByContainerId(containerId, sessionId, serviceUrl = 'http://127.0.0.1:7701', highlightStyle = '3px solid #ff4444', highlightDuration = 2000) {
    console.log(`[verifyAnchorByContainerId] Looking for container: ${containerId}`);
    console.log(`[verifyAnchorByContainerId] containerIndexPath: ${containerIndexPath}`);
    console.log(`[verifyAnchorByContainerId] repoRoot: ${repoRoot}`);
    const container = await findContainerDefinition(containerId);
    if (!container) {
        console.error(`[verifyAnchorByContainerId] Container not found: ${containerId}`);
        return { found: false, highlighted: false, error: `Container not found: ${containerId}` };
    }
    const selectors = (container.selectors || [])
        .map((s) => s?.css)
        .filter((css) => typeof css === 'string' && css.trim().length > 0);
    if (!selectors.length) {
        return { found: false, highlighted: false, error: `No selector defined for: ${containerId}` };
    }
    const matchOpId = logOperation({
        kind: 'anchor_match_start',
        action: 'anchor:verify',
        sessionId,
        payload: {
            containerId,
            selectorsCount: selectors.length,
            serviceUrl,
        },
    });
    try {
        const selectorsJson = JSON.stringify(selectors);
        const script = `(() => {
      const selectors = ${selectorsJson};

      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        if (r.bottom <= 0 || r.top >= window.innerHeight) return false;
        return true;
      };

      let el = null;
      let usedSelector = null;
      for (const sel of selectors) {
        const candidate = document.querySelector(sel);
        if (candidate && isVisible(candidate)) {
          el = candidate;
          usedSelector = sel;
          break;
        }
      }

      if (!el) {
        return { found: false, error: 'Element not found' };
      }

      // 创建或复用一个 overlay 高亮框，避免被页面样式覆盖
      let overlay = document.getElementById('webauto-anchor-highlight');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'webauto-anchor-highlight';
        overlay.style.position = 'fixed';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '2147483647';
        document.body.appendChild(overlay);
      }
      const r = el.getBoundingClientRect();
      overlay.style.left = r.x + 'px';
      overlay.style.top = r.y + 'px';
      overlay.style.width = r.width + 'px';
      overlay.style.height = r.height + 'px';
      overlay.style.border = '${highlightStyle.replace(/'/g, "\\'")}';
      overlay.style.boxSizing = 'border-box';
      overlay.style.background = 'transparent';

      setTimeout(() => {
        if (overlay && overlay.parentElement) {
          overlay.parentElement.removeChild(overlay);
        }
      }, ${highlightDuration});
      const rect = el.getBoundingClientRect();
      return {
        found: true,
        selector: usedSelector,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
    })()`;
        const response = await fetch(`${serviceUrl}/v1/controller/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'browser:execute',
                payload: {
                    profile: sessionId,
                    script,
                },
            }),
            // 本地 Unified API 调用在部分页面初始化时可能稍慢，适当放宽超时时间
            signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
        });
        if (!response.ok) {
            return {
                found: false,
                highlighted: false,
                error: `HTTP ${response.status}: ${await response.text()}`,
            };
        }
        const data = await response.json();
        const result = data.data?.result || data.result;
        if (!result?.found) {
            logOperation({
                kind: 'anchor_match_result',
                action: 'anchor:verify',
                sessionId,
                result: {
                    found: false,
                    selector: result?.selector || null,
                    error: result?.error || 'Element not found',
                },
                meta: { opId: matchOpId, containerId },
            });
            return {
                found: false,
                highlighted: false,
                selector: result?.selector,
                error: result?.error || 'Element not found',
            };
        }
        logOperation({
            kind: 'anchor_match_result',
            action: 'anchor:verify',
            sessionId,
            result: {
                found: true,
                selector: result?.selector || null,
                rect: result?.rect || null,
            },
            meta: { opId: matchOpId, containerId },
        });
        return {
            found: true,
            highlighted: true,
            rect: result.rect,
            selector: result.selector,
        };
    }
    catch (error) {
        logError({
            kind: 'anchor_match_error',
            action: 'anchor:verify',
            sessionId,
            error: error?.message || String(error),
            payload: { containerId, serviceUrl },
            meta: { opId: matchOpId },
        });
        return {
            found: false,
            highlighted: false,
            error: `verifyAnchor failed: ${error.message}`,
        };
    }
}
//# sourceMappingURL=containerAnchors.js.map
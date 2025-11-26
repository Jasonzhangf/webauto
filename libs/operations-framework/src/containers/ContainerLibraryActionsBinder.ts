/**
 * 将 container-library.json 中的 actions 映射到事件驱动容器的业务事件处理器
 *
 * 约定：
 * - container-library.json 结构与 Python 侧 container_registry 保持一致；
 * - 顶层 key 为站点标识（例如 "cbu"），包含 website 和 containers；
 * - containers 下的每个条目形如：
 *   {
 *     "selector": "...",
 *     "description": "...",
 *     "children": ["childId1", "childId2"],
 *     "actions": { "click": true, "type": true, "fill": true }
 *   }
 *
 * 映射规则：
 * - 对于存在 actions 的容器，注册事件：
 *   event.<containerId>.appear
 * - 当根容器收到该事件时，会按 actions 顺序执行基础操作：
 *   click / type / fill
 * - 具体文本和附加参数从 payload 中读取：
 *   { value?, text?, clickOptions? }
 */

import fs from 'fs';
import path from 'path';
import { EventDrivenContainer, ContainerEventHandler } from '../event-driven/EventDrivenContainer';

interface RawContainerDef {
  selector: string;
  description?: string;
  children?: string[];
  actions?: Record<string, boolean>;
  eventKey?: string;
}

interface RawSiteDef {
  website?: string;
  containers?: Record<string, RawContainerDef>;
}

export interface ContainerActionsConfig {
  id: string;
  selector: string;
  description?: string;
  website: string;
  actions: Record<string, boolean>;
  parentId?: string | null;
  eventKey?: string;
}

interface ParsedLibrary {
  byId: Map<string, ContainerActionsConfig>;
}

let cachedLibrary: ParsedLibrary | null = null;
let cachedMtime = 0;

function getLibraryPath(customPath?: string): string {
  if (customPath) return customPath;
  return path.resolve(process.cwd(), 'container-library.json');
}

function listContainerJsonFiles(rootDir: string): string[] {
  const out: string[] = [];
  try {
    const items = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const it of items) {
      const abs = path.join(rootDir, it.name);
      if (it.isDirectory()) out.push(...listContainerJsonFiles(abs));
      else if (it.isFile() && it.name === 'container.json') out.push(abs);
    }
  } catch {}
  return out;
}

function selectPrimarySelector(v2: any): string | null {
  try {
    const arr = Array.isArray(v2.selectors) ? v2.selectors : [];
    if (!arr.length) return null;
    const pri = arr.find((s:any)=> String(s.variant||'primary').toLowerCase()==='primary') || arr[0];
    if (pri && pri.css) return String(pri.css);
    if (pri && pri.id) return `#${pri.id}`;
    const classes = pri?.classes || [];
    if (!Array.isArray(classes) || !classes.length) return null;
    return '.' + classes.join('.');
  } catch { return null; }
}

function buildRegistryFromIndex(): Record<string, RawSiteDef> | null {
  const idxPath = path.resolve(process.cwd(), 'container-library.index.json');
  if (!fs.existsSync(idxPath)) return null;
  try {
    const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')) || {};
    const registry: Record<string, RawSiteDef> = {};
    for (const [siteKey, info] of Object.entries(idx as any)) {
      const siteRoot = path.resolve(process.cwd(), (info as any).path || '');
      const website = (info as any).website || '';
      const files = listContainerJsonFiles(siteRoot);
      const containers: Record<string, RawContainerDef> = {};
      for (const file of files) {
        try {
          const raw = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
          const rel = path.relative(siteRoot, file).replace(/\\/g,'/');
          const cid = rel.replace(/\/container\.json$/,'').split('/').join('.');
          const selector = raw.selector || selectPrimarySelector(raw) || '';
          containers[cid] = {
            selector,
            description: raw.name || cid,
            children: Array.isArray(raw.children) ? raw.children : [],
            actions: raw.actions || undefined,
            eventKey: (raw as any).eventKey,
          };
        } catch {}
      }
      registry[siteKey] = { website, containers };
    }
    return registry;
  } catch { return null; }
}

function loadAndParseLibrary(libraryPath?: string): ParsedLibrary {
  // 优先目录索引
  const idxRegistry = buildRegistryFromIndex();
  let statMtime = 0;
  if (idxRegistry) {
    const byId = new Map<string, ContainerActionsConfig>();
    for (const [siteKey, siteDef] of Object.entries(idxRegistry)) {
      const website = (siteDef.website || '').toString();
      const containers = siteDef.containers || {};
      const parents: Record<string, string | null> = {};
      for (const [containerId, def] of Object.entries(containers)) {
        if (!parents[containerId]) parents[containerId] = null;
        const children = def.children || [];
        for (const childId of children) if (!parents[childId]) parents[childId] = containerId;
      }
      for (const [containerId, def] of Object.entries(containers)) {
        if (!def || typeof def !== 'object') continue;
        if (!def.actions) continue; // 仅绑定声明了 actions 的容器
        byId.set(containerId, {
          id: containerId,
          selector: def.selector,
          description: def.description,
          website,
          actions: def.actions,
          parentId: parents[containerId] ?? null,
          eventKey: (def as any).eventKey
        });
      }
    }
    cachedLibrary = { byId };
    cachedMtime = statMtime;
    return cachedLibrary;
  }

  // 回退到 monolith
  const filePath = getLibraryPath(libraryPath);

  try {
    const stat = fs.statSync(filePath);
    if (cachedLibrary && stat.mtimeMs === cachedMtime) {
      return cachedLibrary;
    }

    if (!fs.existsSync(filePath)) {
      cachedLibrary = { byId: new Map() };
      cachedMtime = stat.mtimeMs;
      return cachedLibrary;
    }

    const rawJson = fs.readFileSync(filePath, 'utf8');
    const raw: Record<string, RawSiteDef> = JSON.parse(rawJson);

    const byId = new Map<string, ContainerActionsConfig>();

    for (const [siteKey, siteDef] of Object.entries(raw)) {
      if (!siteDef || typeof siteDef !== 'object') continue;

      const website = (siteDef.website || '').toString();
      const containers = siteDef.containers || {};

      // 构建 parent 映射
      const parents: Record<string, string | null> = {};
      for (const [containerId, def] of Object.entries(containers)) {
        if (!parents[containerId]) {
          parents[containerId] = null;
        }
        const children = def.children || [];
        for (const childId of children) {
          if (!parents[childId]) {
            parents[childId] = containerId;
          }
        }
      }

      for (const [containerId, def] of Object.entries(containers)) {
        if (!def || typeof def !== 'object') continue;
        if (!def.actions) continue;

        byId.set(containerId, {
          id: containerId,
          selector: def.selector,
          description: def.description,
          website,
          actions: def.actions,
          parentId: parents[containerId] ?? null,
          eventKey: (def as any).eventKey
        });
      }
    }

    cachedLibrary = { byId };
    cachedMtime = stat.mtimeMs;
    return cachedLibrary;
  } catch (error) {
    console.warn('ContainerLibraryActionsBinder: 加载 container-library.json 失败:', error);
    cachedLibrary = { byId: new Map() };
    cachedMtime = 0;
    return cachedLibrary;
  }
}

/**
 * 根据 URL 查找匹配站点 key（与 Python 侧逻辑保持一致）
 */
function findSiteKeyForUrl(url: string, registry: Record<string, RawSiteDef>): string | null {
  try {
    const parsed = new URL(url);
    const host = (parsed.hostname || '').toLowerCase();

    let bestKey: string | null = null;
    let bestLen = -1;

    for (const [key, siteDef] of Object.entries(registry)) {
      const website = (siteDef.website || '').toLowerCase();
      if (!website) continue;
      if (host.endsWith(website) && website.length > bestLen) {
        bestKey = key;
        bestLen = website.length;
      }
    }

    return bestKey;
  } catch {
    return null;
  }
}

/**
 * 为给定 URL 返回 actions 配置列表
 */
export function loadContainerActionsForUrl(url: string, libraryPath?: string): ContainerActionsConfig[] {
  const filePath = getLibraryPath(libraryPath);
  let raw: Record<string, RawSiteDef> = {};

  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const rawJson = fs.readFileSync(filePath, 'utf8');
    raw = JSON.parse(rawJson);
  } catch (error) {
    console.warn('ContainerLibraryActionsBinder: 解析 container-library.json 失败:', error);
    return [];
  }

  const siteKey = findSiteKeyForUrl(url, raw);
  if (!siteKey) {
    return [];
  }

  const siteDef = raw[siteKey];
  if (!siteDef || typeof siteDef !== 'object') {
    return [];
  }

  const containers = siteDef.containers || {};

  // 构建 parent 映射
  const parents: Record<string, string | null> = {};
  for (const [containerId, def] of Object.entries(containers)) {
    if (!parents[containerId]) {
      parents[containerId] = null;
    }
    const children = def.children || [];
    for (const childId of children) {
      if (!parents[childId]) {
        parents[childId] = containerId;
      }
    }
  }

  const results: ContainerActionsConfig[] = [];
  for (const [containerId, def] of Object.entries(containers)) {
    if (!def.actions) continue;
    results.push({
      id: containerId,
      selector: def.selector,
      description: def.description,
      website: siteDef.website || '',
      actions: def.actions,
      parentId: parents[containerId] ?? null,
      eventKey: (def as any).eventKey
    });
  }

  return results;
}

const BOUND_ACTIONS_SYMBOL = Symbol('webauto.containerLibrary.boundActions');

/**
 * 将 container-library.json 中的 actions 绑定到给定根容器：
 * - 为每个有 actions 的容器注册 event.<containerId>.appear 业务事件；
 * - handler 内部根据 actions 触发基础页面操作（click/type/fill），参数来自 payload。
 */
export function bindActionsFromContainerLibraryForUrl(
  rootContainer: EventDrivenContainer,
  url: string,
  libraryPath?: string
): void {
  const anyRoot = rootContainer as any;
  if (!anyRoot[BOUND_ACTIONS_SYMBOL]) {
    anyRoot[BOUND_ACTIONS_SYMBOL] = new Set<string>();
  }
  const boundKeys: Set<string> = anyRoot[BOUND_ACTIONS_SYMBOL];

  const configs = loadContainerActionsForUrl(url, libraryPath);
  if (!configs.length) {
    return;
  }

  for (const cfg of configs) {
    const eventKey = cfg.eventKey || `event.${cfg.id}.appear`;
    if (boundKeys.has(eventKey)) {
      continue;
    }

    const handler: ContainerEventHandler = async (payload, ctx) => {
      const page: any = ctx.sharedSpace?.page;
      if (!page) {
        console.warn(
          `ContainerLibraryActionsBinder: page 未注入，无法处理 ${eventKey} (selector=${cfg.selector})`
        );
        return { consumed: false };
      }

      const selector = (payload && payload.selector) || cfg.selector;

      // 基础操作：click/type/fill
      try {
        if (cfg.actions.click && typeof page.click === 'function') {
          await page.click(selector, payload?.clickOptions || {});
        }

        const text = payload?.text ?? payload?.value;

        if (cfg.actions.type && typeof page.type === 'function' && text != null) {
          await page.type(selector, String(text), payload?.typeOptions || {});
        }

        if (cfg.actions.fill && typeof page.fill === 'function' && text != null) {
          await page.fill(selector, String(text), payload?.fillOptions || {});
        }
      } catch (error) {
        console.error(
          `ContainerLibraryActionsBinder: 处理 ${eventKey} 失败 (selector=${cfg.selector}):`,
          error
        );
      }

      // 默认不“吃掉”事件，允许其他容器继续感知
      return { consumed: false };
    };

    rootContainer.registerContainerHandler(eventKey, handler);
    boundKeys.add(eventKey);
  }
}

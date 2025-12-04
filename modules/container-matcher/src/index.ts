import {
  ContainerRegistry,
  ContainerDefinition,
  SelectorDefinition,
} from '../../container-registry/src/index.js';

export interface AutomationElementHandle {
  evaluate<T = any, A = any>(fn: (element: any, arg?: A) => T, arg?: A): Promise<T>;
  dispose(): Promise<void>;
}

export interface AutomationPage {
  url(): string;
  waitForLoadState(state: any, options?: any): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  waitForFunction(fn: (...args: any[]) => any, options?: any): Promise<any>;
  evaluate<T = any, A = any>(fn: (arg?: A) => T, arg?: A): Promise<T>;
  $$(selector: string): Promise<AutomationElementHandle[]>;
}

export interface AutomationSession {
  ensurePage(url: string): Promise<AutomationPage>;
}

export interface ContainerMatchResult {
  container: Record<string, any>;
  match_details: Record<string, any>;
}

export class ContainerMatcher {
  constructor(private registry = new ContainerRegistry()) {}

  async matchRoot(
    session: AutomationSession,
    pageContext: { url: string },
  ): Promise<ContainerMatchResult | null> {
    const url = pageContext?.url;
    if (!url) {
      throw new Error('page_context.url is required');
    }
    const containers = this.registry.getContainersForUrl(url);
    if (!containers || !Object.keys(containers).length) {
      return null;
    }

    const page = await session.ensurePage(url);
    await this.waitForStableDom(page);
    const currentUrl = page.url() || url;
    const pagePath = this.safePathname(currentUrl);

    const rootContainers = Object.entries(containers)
      .filter(([containerId]) => !containerId.includes('.'))
      .sort((a, b) => this.scoreContainer(b[1]) - this.scoreContainer(a[1]));

    for (let attempt = 0; attempt < 3; attempt++) {
      for (const [containerId, containerDef] of rootContainers) {
        const match = await this.matchContainer(page, containerId, containerDef, currentUrl, pagePath);
        if (match) {
          return match;
        }
      }
      try {
        await page.waitForTimeout(300);
      } catch {
        break;
      }
    }
    return null;
  }

  async inspectTree(
    session: AutomationSession,
    pageContext: { url: string },
    options: Record<string, any> = {},
  ): Promise<Record<string, any>> {
    const url = pageContext?.url;
    if (!url) {
      throw new Error('page_context.url is required');
    }
    const containers = this.registry.getContainersForUrl(url);
    if (!containers || !Object.keys(containers).length) {
      throw new Error('No container definitions available for this URL');
    }
    const page = await session.ensurePage(url);
    await this.waitForStableDom(page);
    const currentUrl = page.url() || url;
    const pagePath = this.safePathname(currentUrl);

    const maxDepth = this.clampNumber(options.max_depth ?? options.maxDepth ?? 4, 1, 6);
    const maxChildren = this.clampNumber(options.max_children ?? options.maxChildren ?? 6, 1, 12);

    const preferredRootId = options.root_container_id || options.root_id;
    const preferredSelector = options.root_selector;
    let rootMatch: ContainerMatchResult | null = null;
    if (preferredRootId && containers[preferredRootId]) {
      rootMatch = await this.matchContainer(
        page,
        preferredRootId,
        containers[preferredRootId],
        currentUrl,
        pagePath,
      );
    }
    if (!rootMatch) {
      rootMatch = await this.matchRoot(session, pageContext);
    }
    if (!rootMatch) {
      throw new Error('No DOM elements matched known containers');
    }

    const effectiveSelector = preferredSelector || rootMatch.container?.matched_selector;
    const matchMap = await this.collectContainerMatches(page, containers, effectiveSelector);
    const containerTree = this.buildContainerTree(containers, rootMatch.container.id, matchMap);
    const domTree = await this.captureDomTreeWithRetry(page, effectiveSelector, maxDepth, maxChildren);
    const annotations = this.buildDomAnnotations(matchMap);
    this.attachDomAnnotations(domTree, annotations);

    return {
      root_match: rootMatch,
      container_tree: containerTree,
      dom_tree: domTree,
      matches: matchMap,
      metadata: {
        captured_at: Date.now(),
        max_depth: maxDepth,
        max_children: maxChildren,
      },
    };
  }

  private async waitForStableDom(page: AutomationPage) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForFunction(
        () => {
          const app = document.querySelector('#app');
          if (app && app.children.length > 0) {
            return true;
          }
          return document.body?.children?.length > 2;
        },
        { timeout: 12000 },
      ).catch(() => {});
    } catch {}
  }

  private async matchContainer(
    page: AutomationPage,
    containerId: string,
    container: ContainerDefinition,
    url: string,
    pagePath: string,
  ) {
    if (!this.matchesPagePatterns(container, url, pagePath)) {
      return null;
    }
    const selectors = container.selectors || [];
    if (!selectors.length) {
      console.warn('[container-matcher] container has no selectors', containerId);
      return null;
    }
    for (const selector of selectors) {
      const css = this.selectorToCss(selector);
      if (!css) continue;
      let handles = [];
      try {
        handles = await page.$$(css);
      } catch (err) {
        console.warn('[container-matcher] selector failed', css, err);
        continue;
      }
      const count = handles.length;
      if (!count) {
        console.warn('[container-matcher] selector matched 0 nodes', css);
        continue;
      }

      const guards = container.metadata || {};
      if (!(await this.evaluateGuards(handles[0], guards))) {
        await Promise.all(handles.map((h) => h.dispose().catch(() => {})));
        continue;
      }

      const payload = {
        container: {
          id: container.id || containerId,
          name: container.name,
          type: container.type,
          matched_selector: css,
          match_count: count,
          definition: container,
        },
        match_details: {
          container_id: containerId,
          selector_variant: selector.variant || 'primary',
          selector_classes: selector.classes || [],
          matched_selector: css,
          page_url: url,
          match_count: count,
        },
      };

      await Promise.all(handles.map((h) => h.dispose().catch(() => {})));
      return payload;
    }
    return null;
  }

  private scoreContainer(container: ContainerDefinition) {
    const meta = container.metadata || {};
    const req = Array.isArray(meta.required_descendants_any) ? meta.required_descendants_any.length : 0;
    const excl = Array.isArray(meta.excluded_descendants_any) ? meta.excluded_descendants_any.length : 0;
    const selectors = container.selectors || [];
    const specificSelector = selectors.some((s) => {
      const css = s.css || '';
      return css && css !== '#app';
    });
    return req * 2 + excl + (specificSelector ? 1 : 0);
  }

  private selectorToCss(selector: SelectorDefinition) {
    if (selector.css) {
      return selector.css;
    }
    if (selector.id) {
      return `#${selector.id}`;
    }
    if (selector.classes && selector.classes.length) {
      return selector.classes.map((cls) => `.${cls}`).join('');
    }
    return null;
  }

  private matchesPagePatterns(container: ContainerDefinition, pageUrl: string, pagePath: string) {
    const host = this.safeHostname(pageUrl);
    const patterns = container.page_patterns || container.pagePatterns;
    if (!patterns || !patterns.length) {
      return true;
    }
    const includes: string[] = [];
    const excludes: string[] = [];
    for (const pattern of patterns) {
      if (typeof pattern !== 'string') continue;
      if (pattern.startsWith('!')) {
        excludes.push(pattern.slice(1));
      } else {
        includes.push(pattern);
      }
    }
    for (const pattern of excludes) {
      if (this.valueMatchesPattern(pageUrl, pattern) ||
        this.valueMatchesPattern(pagePath, pattern) ||
        this.valueMatchesPattern(host, pattern)) {
        return false;
      }
    }
    if (!includes.length) {
      return true;
    }
    for (const pattern of includes) {
      if (this.valueMatchesPattern(pageUrl, pattern) ||
        this.valueMatchesPattern(pagePath, pattern) ||
        this.valueMatchesPattern(host, pattern)) {
        return true;
      }
    }
    return false;
  }

  private patternMatch(value: string, pattern: string) {
    if (!pattern) return false;
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(value);
  }

  private valueMatchesPattern(value: string, pattern: string) {
    if (this.patternMatch(value, pattern)) {
      return true;
    }
    if (!pattern.includes('*') && value.includes(pattern)) {
      return true;
    }
    return false;
  }

  private async evaluateGuards(handle: AutomationElementHandle, metadata: Record<string, any>) {
    const req: string[] = Array.isArray(metadata?.required_descendants_any)
      ? metadata.required_descendants_any
      : [];
    const excl: string[] = Array.isArray(metadata?.excluded_descendants_any)
      ? metadata.excluded_descendants_any
      : [];

    if (!req.length && !excl.length) {
      return true;
    }
    try {
      return await handle.evaluate((element, guards) => {
        const { reqSelectors, exclSelectors } = guards;
        if (Array.isArray(reqSelectors) && reqSelectors.length) {
          const hasRequired = reqSelectors.some((sel) => {
            try {
              return !!element.querySelector(sel);
            } catch {
              return false;
            }
          });
          if (!hasRequired) {
            return false;
          }
        }
        if (Array.isArray(exclSelectors) && exclSelectors.length) {
          const hasExcluded = exclSelectors.some((sel) => {
            try {
              return !!element.querySelector(sel);
            } catch {
              return false;
            }
          });
          if (hasExcluded) {
            return false;
          }
        }
        return true;
      }, {
        reqSelectors: req,
        exclSelectors: excl,
      });
    } catch {
      return false;
    }
  }

  private clampNumber(value: number, min: number, max: number) {
    if (Number.isNaN(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  private async collectContainerMatches(
    page: AutomationPage,
    containers: Record<string, ContainerDefinition>,
    rootSelector?: string,
    maxNodes = 4,
  ) {
    const summary: Record<string, any> = {};
    for (const [containerId, container] of Object.entries(containers)) {
      const selectors: string[] = [];
      const nodes: Record<string, any>[] = [];
      let matchCount = 0;
      for (const selector of container.selectors || []) {
        const css = this.selectorToCss(selector);
        if (!css) continue;
        let handles: AutomationElementHandle[] = [];
        try {
          handles = await page.$$(css);
        } catch {
          continue;
        }
        const count = handles.length;
        if (!count) {
          await Promise.all(handles.map((h) => h.dispose().catch(() => {})));
          continue;
        }
        selectors.push(css);
        matchCount += count;
        for (const handle of handles.slice(0, maxNodes)) {
          const info: any = await this.describeElement(handle, rootSelector);
          if (info) {
            info.selector = css;
            nodes.push(info);
          }
        }
        await Promise.all(handles.map((h) => h.dispose().catch(() => {})));
        if (nodes.length >= maxNodes) {
          break;
        }
      }

      summary[containerId] = {
        container: {
          id: container.id || containerId,
          name: container.name,
          type: container.type,
        },
        selectors,
        match_count: matchCount,
        nodes,
      };
    }
    return summary;
  }

  private buildContainerTree(
    containers: Record<string, ContainerDefinition>,
    rootId: string,
    matchMap: Record<string, any>,
  ) {
    const targetRoot = containers[rootId] ? rootId : this.inferFallbackRoot(containers, rootId);
    if (!targetRoot) {
      return null;
    }
    const build = (containerId: string): any => {
      const container = containers[containerId];
      if (!container) return null;
      const childIds = this.resolveChildIds(containerId, container, containers);
      const node = {
        id: container.id || containerId,
        name: container.name,
        type: container.type,
        capabilities: container.capabilities || [],
        selectors: (container.selectors || []).map((sel) => ({
          ...sel,
        })),
        match: this.summarizeMatchPayload(containerId, matchMap),
        children: [] as any[],
      };
      for (const childId of childIds) {
        const childNode = build(childId);
        if (childNode) {
          node.children.push(childNode);
        }
      }
      return node;
    };

    return build(targetRoot);
  }

  private resolveChildIds(
    containerId: string,
    container: ContainerDefinition,
    containers: Record<string, ContainerDefinition>,
  ) {
    const declared = Array.isArray(container.children) ? container.children : [];
    const explicit = declared.filter((child) => Boolean(containers[child]));
    if (explicit.length) {
      return explicit;
    }
    const prefix = `${containerId}.`;
    const targetDepth = containerId.split('.').length;
    const fallback: string[] = [];
    for (const key of Object.keys(containers)) {
      if (!key.startsWith(prefix)) continue;
      if (key.split('.').length === targetDepth + 1) {
        fallback.push(key);
      }
    }
    return fallback.sort();
  }

  private inferFallbackRoot(containers: Record<string, ContainerDefinition>, preferredId?: string) {
    if (preferredId && containers[preferredId]) {
      return preferredId;
    }
    const topLevel = Object.keys(containers).filter((id) => !id.includes('.')).sort();
    if (topLevel.length) return topLevel[0];
    const keys = Object.keys(containers).sort();
    return keys[0] || null;
  }

  private summarizeMatchPayload(containerId: string, matchMap: Record<string, any>) {
    const payload = matchMap[containerId] || {};
    return {
      match_count: payload.match_count || 0,
      selectors: payload.selectors || [],
      nodes: payload.nodes || [],
    };
  }

  private async captureDomTreeWithRetry(
    page: AutomationPage,
    selector: string | undefined,
    maxDepth: number,
    maxChildren: number,
  ) {
    const attempts: Array<string | null> = [];
    if (selector) attempts.push(selector);
    attempts.push('#app', 'body', null);
    const tried = new Set<string>();
    for (const candidate of attempts) {
      const key = candidate ?? '__root__';
      if (tried.has(key)) continue;
      tried.add(key);
      const retries = candidate && candidate === selector ? 5 : 3;
      for (let i = 0; i < retries; i++) {
        const outline = await this.captureDomTree(page, candidate || undefined, maxDepth, maxChildren);
        if (outline) {
          return outline;
        }
        await page.waitForTimeout(250).catch(() => {});
      }
    }
    return this.captureFallbackDomTree(page);
  }

  private async captureDomTree(
    page: AutomationPage,
    selector: string | undefined,
    maxDepth: number,
    maxChildren: number,
  ) {
    try {
      return await page.evaluate(
        (config) => {
          const target = config.selector ? document.querySelector(config.selector) : document.body;
          if (!target) return null;
          const walk = (element: Element, path: string[], depth: number): any => {
            const meta = {
              path: path.join('/'),
              tag: element.tagName,
              id: element.id || null,
              classes: Array.from(element.classList || []),
              childCount: element.children?.length || 0,
              textSnippet: (element.textContent || '').trim().slice(0, 80),
              children: [] as any[],
            };
            if (depth >= config.maxDepth) {
              return meta;
            }
            const children = Array.from(element.children || []).slice(0, config.maxChildren);
            meta.children = children.map((child, idx) =>
              walk(child, path.concat(String(idx)), depth + 1),
            );
            return meta;
          };
          return walk(target, ['root'], 0);
        },
        {
          selector,
          maxDepth,
          maxChildren,
        },
      );
    } catch {
      return null;
    }
  }

  private async captureFallbackDomTree(page: AutomationPage) {
    try {
      return await page.evaluate(() => {
        const body = document.body || document.documentElement;
        if (!body) return null;
        const node = {
          path: 'root',
          tag: body.tagName || 'BODY',
          id: body.id || null,
          classes: Array.from(body.classList || []),
          childCount: body.children?.length || 0,
          textSnippet: (body.textContent || '').trim().slice(0, 120),
          children: [] as any[],
        };
        return node;
      });
    } catch {
      return null;
    }
  }

  private buildDomAnnotations(matchMap: Record<string, any>) {
    const annotations: Record<string, Array<{ container_id: string; container_name?: string; selector?: string }>> = {};
    for (const [containerId, payload] of Object.entries(matchMap)) {
      const nodes = payload.nodes || [];
      for (const node of nodes) {
        const path = node.dom_path;
        if (!path) continue;
        annotations[path] = annotations[path] || [];
        annotations[path].push({
          container_id: containerId,
          container_name: payload.container?.name || payload.container?.id,
          selector: node.selector,
        });
      }
    }
    return annotations;
  }

  private attachDomAnnotations(domTree: any, annotations: Record<string, any[]>) {
    if (!domTree) return;
    const visit = (node: any) => {
      node.containers = annotations[node.path] || [];
      for (const child of node.children || []) {
        visit(child);
      }
    };
    visit(domTree);
  }

  private async describeElement(handle: AutomationElementHandle, rootSelector?: string) {
    try {
      return await handle.evaluate(
        (element, selector) => {
          const root = selector ? document.querySelector(selector) : null;
          const computePath = () => {
            const indices: string[] = [];
            let current: Element | null = element;
            let guard = 0;
            while (current && guard < 80) {
              if (root && current === root) {
                return ['root', ...indices].join('/');
              }
              const parent = current.parentElement;
              if (!parent) break;
              const idx = Array.prototype.indexOf.call(parent.children || [], current);
              indices.unshift(String(idx));
              current = parent;
              guard += 1;
            }
            return ['root', ...indices].join('/');
          };
          const classes = Array.from(element.classList || []);
          const snippet = (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
          return {
            dom_path: computePath(),
            tag: element.tagName,
            id: element.id || null,
            classes,
            textSnippet: snippet,
          };
        },
        rootSelector || null,
      );
    } catch {
      return null;
    } finally {
      try {
        await handle.dispose();
      } catch {
        // ignore
      }
    }
  }

  private safePathname(raw: string) {
    try {
      return new URL(raw).pathname || '/';
    } catch {
      return raw;
    }
  }

  private safeHostname(raw: string) {
    try {
      return new URL(raw).hostname || '';
    } catch {
      return '';
    }
  }
}

import { Page, ElementHandle } from 'playwright';
import { BrowserSession } from './BrowserSession.js';
import { ContainerRegistry, ContainerDefinition, SelectorDefinition } from './ContainerRegistry.js';

export interface ContainerMatchResult {
  container: Record<string, any>;
  match_details: Record<string, any>;
}

export class ContainerMatcher {
  constructor(private registry = new ContainerRegistry()) {}

  async matchRoot(session: BrowserSession, pageContext: { url: string }): Promise<ContainerMatchResult | null> {
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

  private async waitForStableDom(page: Page) {
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

  private async matchContainer(page: Page, containerId: string, container: ContainerDefinition, url: string, pagePath: string) {
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

  private async evaluateGuards(handle: ElementHandle<SVGElement | HTMLElement>, metadata: Record<string, any>) {
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

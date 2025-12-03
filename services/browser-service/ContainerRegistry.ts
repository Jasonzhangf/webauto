import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = resolveProjectRoot(__dirname);
const USER_CONTAINER_ROOT = path.join(os.homedir(), '.webauto', 'container-lib');
const INDEX_PATH = path.join(PROJECT_ROOT, 'container-library.index.json');
const LEGACY_PATH = path.join(PROJECT_ROOT, 'container-library.json');

export interface SelectorDefinition {
  css?: string;
  id?: string;
  classes?: string[];
  variant?: string;
  score?: number;
}

export interface ContainerDefinition {
  id: string;
  name?: string;
  type?: string;
  selectors?: SelectorDefinition[];
  children?: string[];
  page_patterns?: string[];
  pagePatterns?: string[];
  metadata?: Record<string, any>;
  [key: string]: any;
}

type RegistryIndex = Record<string, { website?: string; path?: string }>;

export class ContainerRegistry {
  private indexCache: RegistryIndex | null = null;
  private cache = new Map<string, Record<string, ContainerDefinition>>();
  private legacyCache: Record<string, any> | null = null;

  getContainersForUrl(url: string): Record<string, ContainerDefinition> {
    const registry = this.ensureIndex();
    const siteKey = this.findSiteKey(url, registry);
    if (!siteKey) {
      return {};
    }
    const site = registry[siteKey] || { path: `container-library/${siteKey}` };
    if (this.cache.has(siteKey)) {
      return this.cache.get(siteKey)!;
    }
    const containers = this.loadSiteContainers(siteKey, site.path);
    this.cache.set(siteKey, containers);
    return containers;
  }

  private ensureIndex(): RegistryIndex {
    if (this.indexCache) {
      return this.indexCache;
    }
    if (fs.existsSync(INDEX_PATH)) {
      try {
        this.indexCache = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
        return this.indexCache;
      } catch {
        // fall through
      }
    }
    this.indexCache = {};
    return this.indexCache;
  }

  private loadSiteContainers(siteKey: string, relativePath?: string) {
    const containers: Record<string, ContainerDefinition> = {};
    const builtinPath = path.join(PROJECT_ROOT, relativePath || path.join('container-library', siteKey));
    if (fs.existsSync(builtinPath)) {
      this.walkSite(builtinPath, containers);
      this.loadLegacyFile(builtinPath, containers);
    } else {
      const legacy = this.loadLegacyRegistry();
      const fallback = legacy?.[siteKey]?.containers || {};
      Object.assign(containers, fallback);
    }

    const userPath = path.join(USER_CONTAINER_ROOT, siteKey);
    if (fs.existsSync(userPath)) {
      this.walkSite(userPath, containers);
      this.loadLegacyFile(userPath, containers);
    }
    return containers;
  }

  private walkSite(sitePath: string, output: Record<string, ContainerDefinition>) {
    const stack: Array<{ dir: string; parts: string[] }> = [{ dir: sitePath, parts: [] }];
    while (stack.length) {
      const { dir, parts } = stack.pop()!;
      let hasContainerFile = false;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name === 'container.json') {
          const relParts = parts.length ? parts : [path.basename(dir)];
          const containerId = relParts.join('.');
          try {
            const raw = JSON.parse(fs.readFileSync(path.join(dir, entry.name), 'utf-8'));
            if (raw && typeof raw === 'object') {
              const id = raw.id || containerId;
              output[id] = { id, ...raw };
            }
          } catch {
            // ignore malformed container
          }
          hasContainerFile = true;
        } else if (entry.isDirectory()) {
          stack.push({ dir: path.join(dir, entry.name), parts: [...parts, entry.name] });
        }
      }
      if (!hasContainerFile && parts.length === 0) {
        // root dir may not contain direct containers, continue
        continue;
      }
    }
  }

  private loadLegacyFile(sitePath: string, output: Record<string, ContainerDefinition>) {
    const legacyFile = path.join(sitePath, 'containers.json');
    if (!fs.existsSync(legacyFile)) {
      return;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(legacyFile, 'utf-8'));
      const containers = raw?.containers;
      if (containers && typeof containers === 'object') {
        for (const [key, value] of Object.entries(containers)) {
          if (!output[key] && value && typeof value === 'object') {
            output[key] = { id: key, ...(value as Record<string, any>) };
          }
        }
      }
    } catch {
      // ignore legacy parse error
    }
  }

  private loadLegacyRegistry() {
    if (this.legacyCache) {
      return this.legacyCache;
    }
    if (!fs.existsSync(LEGACY_PATH)) {
      this.legacyCache = {};
      return this.legacyCache;
    }
    try {
      this.legacyCache = JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf-8'));
    } catch {
      this.legacyCache = {};
    }
    return this.legacyCache;
  }

  private findSiteKey(url: string, registry: RegistryIndex): string | null {
    let host = '';
    try {
      const parsed = new URL(url);
      host = (parsed.hostname || '').toLowerCase();
    } catch {
      return null;
    }
    let bestKey: string | null = null;
    let bestLen = -1;
    for (const [key, value] of Object.entries(registry)) {
      const domain = (value.website || '').toLowerCase();
      if (!domain) continue;
      if (host === domain || host.endsWith(`.${domain}`)) {
        if (domain.length > bestLen) {
          bestKey = key;
          bestLen = domain.length;
        }
      }
    }
    if (!bestKey) {
      // fallback legacy
      const legacy = this.loadLegacyRegistry();
      for (const [key, value] of Object.entries(legacy)) {
        const domain = (value?.website || '').toLowerCase();
        if (!domain) continue;
        if (host === domain || host.endsWith(`.${domain}`)) {
          if (domain.length > bestLen) {
            bestKey = key;
            bestLen = domain.length;
          }
        }
      }
    }
    return bestKey;
  }
}

function resolveProjectRoot(startDir: string) {
  let current = startDir;
  const { root } = path.parse(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    if (current === root) {
      return startDir;
    }
    current = path.resolve(current, '..');
  }
}

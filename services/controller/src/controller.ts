import path from 'node:path';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { logDebug } from '../../../modules/logging/src/index.js';
import {
  normalizePayload,
  type NormalizedPayload
} from './payload-normalizer.js';

interface UiControllerOptions {
  repoRoot?: string;
  messageBus?: any;
  userContainerRoot?: string;
  containerIndexPath?: string;
  cliTargets?: Record<string, string>;
  defaultWsHost?: string;
  defaultWsPort?: number;
  defaultHttpHost?: string;
  defaultHttpPort?: number;
  defaultHttpProtocol?: string;
}

interface ActionPayload {
  [key: string]: any;
}

interface Session {
  profileId?: string;
  profile_id?: string;
  session_id?: string;
  sessionId?: string;
  current_url?: string;
  currentUrl?: string;
}

interface SnapshotResult {
  success: boolean;
  data?: any;
  error?: string;
}

interface ContainerDefinition {
  id: string;
  name?: string;
  type?: string;
  scope?: string;
  selectors?: Array<{ css: string; variant?: string; score?: number; classes?: string[] }>;
  children?: string[];
  runMode?: string;
  operations?: any[];
  page_patterns?: string[];
  pagePatterns?: string[];
  capabilities?: string[];
  alias?: string;
  nickname?: string;
  metadata?: Record<string, any>;
}

interface BranchResult {
  node?: any;
  success?: boolean;
  data?: any;
  error?: string;
}

interface HighlightOptions {
  style?: string;
  duration?: number;
  channel?: string;
  sticky?: boolean;
  maxMatches?: number;
}

interface DomPickerOptions {
  timeout?: number;
  rootSelector?: string;
}

interface SnapshotOptions {
  profile?: string;
  url?: string;
  maxDepth?: number;
  maxChildren?: number;
  containerId?: string;
  rootSelector?: string;
}

interface BranchOptions {
  profile?: string;
  url?: string;
  path?: string;
  rootSelector?: string;
  maxDepth?: number;
  maxChildren?: number;
}

interface WsCommandPayload {
  type: string;
  session_id: string;
  data: {
    command_type: string;
    action?: string;
    node_type?: string;
    parameters?: Record<string, any>;
    page_context?: { url: string };
  };
}

interface WsResponse {
  data?: any;
  error?: string;
}

export class UiController {
  private repoRoot: string;
  private messageBus: any;
  private userContainerRoot: string;
  private containerIndexPath: string;
  private cliTargets: Record<string, string>;
  private defaultWsHost: string;
  private defaultWsPort: number;
  private defaultHttpHost: string;
  private defaultHttpPort: number;
  private defaultHttpProtocol: string;
  private _containerIndexCache: Record<string, any> | null;

  constructor(options: UiControllerOptions = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    this.messageBus = options.messageBus;
    this.userContainerRoot = options.userContainerRoot || path.join(os.homedir(), '.webauto', 'container-lib');
    this.containerIndexPath = options.containerIndexPath || path.join(this.repoRoot, 'container-library.index.json');
    this.cliTargets = options.cliTargets || {};
    this.defaultWsHost = options.defaultWsHost || '127.0.0.1';
    this.defaultWsPort = Number(options.defaultWsPort || 8765);
    this.defaultHttpHost = options.defaultHttpHost || '127.0.0.1';
    this.defaultHttpPort = Number(options.defaultHttpPort || 7704);
    this.defaultHttpProtocol = options.defaultHttpProtocol || 'http';
    this._containerIndexCache = null;
    this.cliTargets = options.cliTargets || {};
    logDebug('controller', 'init', {
      wsHost: this.defaultWsHost,
      wsPort: this.defaultWsPort,
      httpHost: this.defaultHttpHost,
      httpPort: this.defaultHttpPort
    });
  }

  async runCliCommand(moduleName: string, args: string[]): Promise<any> {
    const scriptPath = this.cliTargets[moduleName];
    if (!scriptPath) {
      throw new Error(`Unknown module: ${moduleName}`);
    }

    console.log(`[controller] runCliCommand ${moduleName} ${scriptPath} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      // Check if scriptPath ends with .js, if so run with node directly
      const isJs = scriptPath.endsWith('.js');
      const cmd = isJs ? 'node' : 'npx';
      const cmdArgs = isJs ? [scriptPath, ...args] : ['tsx', scriptPath, ...args];
      
      const child = spawn(cmd, cmdArgs, {
        cwd: this.repoRoot,
        env: process.env,
        windowsHide: true,
      });
      
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        console.log(`[controller] cli exit ${moduleName} ${code}`);
        if (code !== 0) {
          console.error(`[controller] cli stderr ${moduleName}`, stderr);
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
          return;
        }
        try {
          console.log(`[controller] cli stdout ${moduleName}`, stdout.trim());
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch (e) {
          console.error(`[controller] cli parse error ${moduleName}`, e);
          resolve({ success: true, raw: stdout.trim() });
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  async handleAction(action: string, payload: ActionPayload = {}) {
    logDebug('controller', 'handleAction', { action, payload });
    switch (action) {
      case 'browser:status':
        return this.runCliCommand('browser-control', ['status']);
      case 'session:list':
        return this.runCliCommand('session-manager', ['list']);
      case 'session:create':
        return this.handleSessionCreate(payload);
      case 'session:delete':
        return this.handleSessionDelete(payload);
      case 'logs:stream':
        return this.handleLogsStream(payload);
      case 'operations:list':
        return this.runCliCommand('operations', ['list']);
      case 'operations:run':
        return this.handleOperationRun(payload);
     case 'containers:inspect':
     case 'containers:get':
       return this.handleContainerInspect(payload);
     case 'containers:inspect-container':
     case 'containers:get-container':
       return this.handleContainerInspectContainer(payload);
     case 'containers:inspect-branch':
       return this.handleContainerInspectBranch(payload);
     case 'containers:remap':
       return this.handleContainerRemap(payload);
     case 'containers:create-child':
       return this.handleContainerCreateChild(payload);
     case 'containers:update-alias':
       return this.handleContainerUpdateAlias(payload);
     case 'containers:update-operations':
       return this.handleContainerUpdateOperations(payload);
     case 'containers:match':
     case 'containers:status':
       return this.handleContainerMatch(payload);
     case 'browser:highlight':
       return this.handleBrowserHighlight(payload);
     case 'browser:clear-highlight':
       return this.handleBrowserClearHighlight(payload);
     case 'browser:highlight-dom-path':
       return this.handleBrowserHighlightDomPath(payload);
     case 'browser:execute':
       return this.handleBrowserExecute(payload);
     case 'browser:screenshot':
       return this.handleBrowserScreenshot(payload);
     case 'browser:page:list':
       return this.handleBrowserPageList(payload);
     case 'browser:page:new':
       return this.handleBrowserPageNew(payload);
     case 'browser:page:switch':
       return this.handleBrowserPageSwitch(payload);
     case 'browser:page:close':
       return this.handleBrowserPageClose(payload);
     case 'browser:goto':
       return this.handleBrowserGoto(payload);
      case 'browser:cancel-pick':
       return this.handleBrowserCancelDomPick(payload);
      case 'browser:pick-dom':
        return this.handleBrowserPickDom(payload);
      case 'keyboard:press':
        return this.handleKeyboardPress(payload);
      case 'keyboard:type':
        return this.handleKeyboardType(payload);
      case 'mouse:wheel':
        return this.handleMouseWheel(payload);
      case 'dom:branch:2':
        return this.handleDomBranch2(payload);
      case 'dom:pick:2':
        return this.handleDomPick2(payload);
      case 'container:operation':
        return this.handleContainerOperation(payload);
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }

  async handleSessionCreate(payload: ActionPayload = {}) {
    const { profile, url, headless, keepOpen } = normalizePayload(payload, { required: ['profile'] });
    logDebug('controller', 'session:create', { payload });
    const args = ['create', '--profile', profile];
    if (url) args.push('--url', url);
    if (headless !== undefined) args.push('--headless', String(headless));
    if (keepOpen !== undefined) args.push('--keep-open', String(keepOpen));
    return this.runCliCommand('session-manager', args);
  }

  async handleSessionDelete(payload: ActionPayload = {}) {
    const { profile } = normalizePayload(payload, { required: ['profile'] });
    return this.runCliCommand('session-manager', ['delete', '--profile', profile]);
  }

  async handleLogsStream(payload: ActionPayload = {}) {
    const args = ['stream'];
    if (payload.source) args.push('--source', payload.source);
    if (payload.session) args.push('--session', payload.session);
    if (payload.lines) args.push('--lines', String(payload.lines));
    return this.runCliCommand('logging', args);
  }

  async handleOperationRun(payload: ActionPayload = {}) {
    const op = payload.op || payload.operation || payload.id;
    if (!op) throw new Error('缺少操作 ID');
    const args = ['run', '--op', op];
    if (payload.config) {
      args.push('--config', JSON.stringify(payload.config));
    }
    return this.runCliCommand('operations', args);
  }

  async handleContainerInspect(payload: ActionPayload = {}) {
    const { profile, url, maxDepth, maxChildren, containerId, rootSelector } = normalizePayload(payload, { required: ['profile'] });
    logDebug('controller', 'containers:inspect', { profile, payload });
    const context = await this.captureInspectorSnapshot({
      profile,
      url,
      maxDepth,
      maxChildren,
      containerId,
      rootSelector,
    });
    const snapshot = context.snapshot;
    return {
      success: true,
      data: {
        sessionId: context.sessionId,
        profileId: context.profileId,
        url: context.targetUrl,
        snapshot,
        containerSnapshot: snapshot,
        domTree: snapshot?.dom_tree || null,
      },
    };
  }

  async handleContainerInspectContainer(payload: ActionPayload = {}) {
    const { profile, containerId, url, maxDepth, maxChildren, rootSelector } = normalizePayload(payload, { required: ['profile', 'containerId'] });
    const context = await this.captureInspectorSnapshot({
      profile,
      url,
      maxDepth,
      maxChildren,
      containerId,
      rootSelector,
    });
    return {
      success: true,
      data: {
        sessionId: context.sessionId,
        profileId: context.profileId,
        url: context.targetUrl,
        snapshot: context.snapshot,
      },
    };
  }

  async handleContainerInspectBranch(payload: ActionPayload = {}) {
    const { profile, path, url, maxDepth, maxChildren, rootSelector } = normalizePayload(payload, { required: ['profile', 'path'] });
    logDebug('controller', 'containers:inspect:branch', { profile, path, payload });
    const context = await this.captureInspectorBranch({
      profile,
      url,
      path,
      rootSelector,
      maxDepth,
      maxChildren,
    });
    return {
      success: true,
      data: {
        sessionId: context.sessionId,
        profileId: context.profileId,
        url: context.targetUrl,
        branch: context.branch,
      },
    };
  }

  async handleContainerRemap(payload: ActionPayload = {}) {
    const containerId = payload.containerId || payload.id;
    const selector = (payload.selector || '').trim();
    const definition = payload.definition || {};
    if (!containerId) {
      throw new Error('缺少容器 ID');
    }
    if (!selector) {
      throw new Error('缺少新的 selector');
    }
    const siteKey =
      payload.siteKey ||
      this.resolveSiteKeyFromUrl(payload.url) ||
      this.inferSiteFromContainerId(containerId);
    if (!siteKey) {
      throw new Error('无法确定容器所属站点');
    }
    const normalizedDefinition = { ...definition, id: containerId };
    const existingSelectors = Array.isArray(normalizedDefinition.selectors) ? normalizedDefinition.selectors : [];
    const filtered = existingSelectors.filter((item: any) => (item?.css || '').trim() && (item.css || '').trim() !== selector);
    normalizedDefinition.selectors = [{ css: selector, variant: 'primary', score: 1 }, ...filtered];
    await this.writeUserContainerDefinition(siteKey, containerId, normalizedDefinition);
    const { profile, url } = normalizePayload(payload, { required: ['profile'] });
    return this.handleContainerInspect({ profile, url });
  }

  async handleContainerCreateChild(payload: ActionPayload = {}) {
    const parentId = payload.parentId || payload.parent_id;
    const containerId = payload.containerId || payload.childId || payload.id;
    if (!parentId) {
      throw new Error('缺少父容器 ID');
    }
    if (!containerId) {
      throw new Error('缺少子容器 ID');
    }
    const siteKey =
      payload.siteKey ||
      this.resolveSiteKeyFromUrl(payload.url) ||
      this.inferSiteFromContainerId(containerId) ||
      this.inferSiteFromContainerId(parentId);
    if (!siteKey) {
      throw new Error('无法确定容器所属站点');
    }
    const selectorEntries = this.normalizeSelectors(payload.selectors || payload.selector || []) || [];
    if (!selectorEntries.length) {
      throw new Error('缺少 selector 定义');
    }
    const parentDefinition = (await this.readContainerDefinition(siteKey, parentId)) || { id: parentId, children: [] as string[] };
    const normalizedChild: any = {
      ...(payload.definition || {}),
      id: containerId,
      selectors: selectorEntries,
      name: payload.definition?.name || payload.alias || containerId,
      type: payload.definition?.type || 'section',
      capabilities:
        Array.isArray(payload.definition?.capabilities) && payload.definition.capabilities.length
          ? payload.definition.capabilities
          : ['highlight', 'find-child', 'scroll'],
    };
    const alias = typeof payload.alias === 'string' ? payload.alias.trim() : '';
    const metadata = { ...(normalizedChild.metadata || {}) };
    if (alias) {
      metadata.alias = alias;
      normalizedChild.alias = alias;
      normalizedChild.nickname = alias;
      if (!normalizedChild.name) {
        normalizedChild.name = alias;
      }
    } else {
      delete metadata.alias;
    }
    if (payload.domPath) {
      metadata.source_dom_path = payload.domPath;
    }
    if (payload.domMeta && typeof payload.domMeta === 'object') {
      metadata.source_dom_meta = payload.domMeta;
    }
    normalizedChild.metadata = metadata;
    if (!normalizedChild.page_patterns || !normalizedChild.page_patterns.length) {
      const parentPatterns = (parentDefinition as any).page_patterns || (parentDefinition as any).pagePatterns;
      if (parentPatterns?.length) {
        normalizedChild.page_patterns = parentPatterns;
      }
    }
    const nextParent = { ...parentDefinition };
    const childList = Array.isArray(nextParent.children) ? [...nextParent.children] : [];
    if (!childList.includes(containerId)) {
      childList.push(containerId);
    }
    nextParent.children = childList;
    await this.writeUserContainerDefinition(siteKey, containerId, normalizedChild);
    await this.writeUserContainerDefinition(siteKey, parentId, nextParent);
    // 正确流程：写入定义后立即进行容器匹配，并通过 containers.matched 事件推送最新树
    const { profile, url, maxDepth, maxChildren, rootSelector } = normalizePayload(payload, { required: ['profile'] });
    return this.handleContainerMatch({
      profile,
      url,
      maxDepth,
      maxChildren,
      rootSelector,
    });
  }

  async handleContainerUpdateAlias(payload: ActionPayload = {}) {
    const containerId = payload.containerId || payload.id;
    if (!containerId) {
      throw new Error('缺少容器 ID');
    }
    const alias = typeof payload.alias === 'string' ? payload.alias.trim() : '';
    const siteKey =
      payload.siteKey ||
      this.resolveSiteKeyFromUrl(payload.url) ||
      this.inferSiteFromContainerId(containerId);
    if (!siteKey) {
      throw new Error('无法确定容器所属站点');
    }
    const baseDefinition = (await this.readContainerDefinition(siteKey, containerId)) || { id: containerId };
    const metadata = { ...(baseDefinition as any).metadata || {} };
    if (alias) {
      metadata.alias = alias;
    } else {
      delete metadata.alias;
    }
    const next: any = {
      ...baseDefinition,
      name: (baseDefinition as any).name || alias || containerId,
      metadata,
    };
    if (alias) {
      next.alias = alias;
      next.nickname = alias;
    } else {
      delete next.alias;
      delete next.nickname;
    }
    await this.writeUserContainerDefinition(siteKey, containerId, next);
    const { profile, url } = normalizePayload(payload, { required: ['profile'] });
    return this.handleContainerInspect({ profile, url });
  }

  async handleContainerUpdateOperations(payload: ActionPayload = {}) {
    const containerId = payload.containerId || payload.id;
    if (!containerId) {
      throw new Error('缺少容器 ID');
    }
    const siteKey =
      payload.siteKey ||
      this.resolveSiteKeyFromUrl(payload.url) ||
      this.inferSiteFromContainerId(containerId);
    if (!siteKey) {
      throw new Error('无法确定容器所属站点');
    }
    const operations = Array.isArray(payload.operations) ? payload.operations : [];
    const baseDefinition = (await this.readContainerDefinition(siteKey, containerId)) || { id: containerId };
    const next = {
      ...baseDefinition,
      operations,
    };
    await this.writeUserContainerDefinition(siteKey, containerId, next);
    const { profile, url } = normalizePayload(payload, { required: ['profile'] });
    return this.handleContainerInspect({ profile, url, containerId });
  }


  async handleContainerMatch(payload: ActionPayload = {}) {
    const { profile, url, maxDepth, maxChildren, rootSelector } = normalizePayload(payload, { required: ['profile'] });

    logDebug('controller', 'containers:match', { profile, url, payload });
    
    try {
      const context = await this.captureInspectorSnapshot({
        profile,
        url,
        maxDepth: maxDepth || 2,
        maxChildren: maxChildren || 5,
        rootSelector,
      });
      
      const snapshot = context.snapshot;
      const rootContainer = snapshot?.root_match?.container || snapshot?.container_tree?.container || snapshot?.container_tree?.containers?.[0];
      const matchPayload = {
        sessionId: context.sessionId,
        profileId: context.profileId,
        url: context.targetUrl,
        matched: !!rootContainer,
        container: rootContainer || null,
        snapshot,
      };
      this.messageBus?.publish?.('containers.matched', matchPayload);
      if (matchPayload.container) {
        this.emitContainerAppearEvents(snapshot.container_tree, matchPayload);
      }
      this.messageBus?.publish?.('handshake.status', {
        status: matchPayload.matched ? 'ready' : 'pending',
        profileId: matchPayload.profileId,
        sessionId: matchPayload.sessionId,
        url: matchPayload.url,
        matched: matchPayload.matched,
        containerId: matchPayload.container?.id || null,
        source: 'containers:match',
        ts: Date.now(),
      });
      logDebug('controller', 'containers.matched', {
        profileId: matchPayload.profileId,
        matched: matchPayload.matched,
        containerId: matchPayload.container?.id,
        childrenCount: matchPayload.container?.children?.length,
        nodesCount: matchPayload.container?.match?.nodes?.length
      });
      
      return {
        success: true,
        data: matchPayload,
      };
    } catch (err: any) {
      throw new Error(`容器匹配失败: ${err?.message || String(err)}`);
    }
  }
  async handleBrowserHighlight(payload: ActionPayload = {}) {
    const { profile, selector, style, duration, channel, sticky, maxMatches } = normalizePayload(payload, { required: ['profile', 'selector'] });
    const highlightOpts: HighlightOptions = {
      style,
      duration,
      channel,
      sticky,
      maxMatches,
    };
    try {
      const result = await this.sendHighlightViaWs(profile, selector, highlightOpts);
      this.messageBus?.publish?.('ui.highlight.result', {
        success: true,
        selector,
        source: result?.source || 'unknown',
        details: result?.details || null,
      });
      return { success: true, data: result };
    } catch (err: any) {
      const errorMessage = err?.message || '高亮请求失败';
      this.messageBus?.publish?.('ui.highlight.result', {
        success: false,
        selector,
        error: errorMessage,
      });
      throw err || new Error(errorMessage);
    }
  }

  async handleBrowserClearHighlight(payload: ActionPayload = {}) {
    const { profile, channel } = normalizePayload(payload, { required: ['profile'] });
    try {
      const result = await this.sendClearHighlightViaWs(profile, channel || null);
      this.messageBus?.publish?.('ui.highlight.result', {
        success: true,
        selector: null,
        details: result,
      });
      return { success: true, data: result };
    } catch (err: any) {
      const message = err?.message || '清除高亮失败';
      this.messageBus?.publish?.('ui.highlight.result', {
        success: false,
        selector: null,
        error: message,
      });
     throw err;
   }
 }

  async handleBrowserExecute(payload: ActionPayload = {}) {
    const { profile, script } = normalizePayload(payload, { required: ['profile', 'script'] });
    try {
      const result = await this.sendExecuteViaWs(profile, script!);
      return { success: true, data: result };
    } catch (err: any) {
      const errorMessage = err?.message || '执行脚本失败';
      throw new Error(errorMessage);
    }
  }

  async handleBrowserScreenshot(payload: ActionPayload = {}) {
    const profileId = (payload.profileId || payload.profile || payload.sessionId || 'default').toString();
    const fullPage = typeof payload.fullPage === 'boolean' ? payload.fullPage : Boolean(payload.fullPage);
    // 截图在某些页面会更慢，放宽超时以保证调试证据可落盘
    const result = await this.browserServiceCommand('screenshot', { profileId, fullPage }, { timeoutMs: 60000 });
    return { success: true, data: result };
  }

  async handleBrowserPageList(payload: ActionPayload = {}) {
    const profileId = (payload.profileId || payload.profile || payload.sessionId || 'default').toString();
    const result = await this.browserServiceCommand('page:list', { profileId }, { timeoutMs: 30000 });
    return { success: true, data: result };
  }

  async handleBrowserPageNew(payload: ActionPayload = {}) {
    const profileId = (payload.profileId || payload.profile || payload.sessionId || 'default').toString();
    const url = payload.url ? String(payload.url) : undefined;
    const result = await this.browserServiceCommand('page:new', { profileId, ...(url ? { url } : {}) }, { timeoutMs: 30000 });
    const index = Number((result as any)?.index ?? (result as any)?.data?.index);
    if (Number.isFinite(index)) {
      return { success: true, data: result };
    }
    const list = await this.browserServiceCommand('page:list', { profileId }, { timeoutMs: 30000 });
    const activeIndexRaw = (list as any)?.activeIndex ?? (list as any)?.data?.activeIndex;
    const activeIndex = Number(activeIndexRaw);
    if (Number.isFinite(activeIndex)) {
      return { success: true, data: { ...(result || {}), index: activeIndex, fallback: 'activeIndex' } };
    }
    return { success: true, data: result };
  }

  async handleBrowserPageSwitch(payload: ActionPayload = {}) {
    const profileId = (payload.profileId || payload.profile || payload.sessionId || 'default').toString();
    const index = Number(payload.index);
    if (!Number.isFinite(index)) throw new Error('index required');
    const result = await this.browserServiceCommand('page:switch', { profileId, index }, { timeoutMs: 30000 });
    return { success: true, data: result };
  }

  async handleBrowserPageClose(payload: ActionPayload = {}) {
    const profileId = (payload.profileId || payload.profile || payload.sessionId || 'default').toString();
    const hasIndex = typeof payload.index !== 'undefined' && payload.index !== null;
    const index = hasIndex ? Number(payload.index) : undefined;
    const result = await this.browserServiceCommand(
      'page:close',
      { profileId, ...(Number.isFinite(index as number) ? { index } : {}) },
      { timeoutMs: 30000 },
    );
    return { success: true, data: result };
  }

  private getBrowserServiceHttpUrl(): string {
    return `${this.defaultHttpProtocol}://${this.defaultHttpHost}:${this.defaultHttpPort}`;
  }

  private async browserServiceCommand(action: string, args: Record<string, any>, options: { timeoutMs?: number } = {}) {
    const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : 20000;
    const res = await fetch(`${this.getBrowserServiceHttpUrl()}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const raw = await res.text();
    let data: any = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!res.ok) {
      throw new Error(data?.error || data?.body?.error || `browser-service command "${action}" HTTP ${res.status}`);
    }
    if (data && data.ok === false) {
      throw new Error(data.error || `browser-service command "${action}" failed`);
    }
    if (data && data.error) {
      throw new Error(data.error);
    }
    return data.body ?? data;
  }

  async handleBrowserGoto(payload: ActionPayload = {}) {
    const profileId = (payload.profileId || payload.profile || payload.sessionId || 'default').toString();
    const url = (payload.url || '').toString();
    if (!url) throw new Error('url required');
    const result = await this.browserServiceCommand('goto', { profileId, url });
    return { success: true, data: result };
  }

  async handleKeyboardPress(payload: ActionPayload = {}) {
    const profileId = (payload.profileId || payload.profile || payload.sessionId || 'default').toString();
    const key = (payload.key || 'Enter').toString();
    const delay = typeof payload.delay === 'number' ? payload.delay : undefined;
    const result = await this.browserServiceCommand('keyboard:press', { profileId, key, ...(delay ? { delay } : {}) });
    return { success: true, data: result };
  }

  async handleKeyboardType(payload: ActionPayload = {}) {
    const profileId = (payload.profileId || payload.profile || payload.sessionId || 'default').toString();
    const text = (payload.text ?? '').toString();
    const delay = typeof payload.delay === 'number' ? payload.delay : undefined;
    const submit = typeof payload.submit === 'boolean' ? payload.submit : Boolean(payload.submit);
    const result = await this.browserServiceCommand('keyboard:type', { profileId, text, ...(delay ? { delay } : {}), ...(submit ? { submit } : {}) });
    return { success: true, data: result };
  }

  async handleMouseWheel(payload: ActionPayload = {}) {
    const profileId = (payload.profileId || payload.profile || payload.sessionId || 'default').toString();
    const deltaY = Number(payload.deltaY ?? payload.y ?? payload.dy ?? 0) || 0;
    const deltaX = Number(payload.deltaX ?? payload.x ?? payload.dx ?? 0) || 0;
    const result = await this.browserServiceCommand('mouse:wheel', { profileId, deltaX, deltaY });
    return { success: true, data: result };
  }

  async handleBrowserHighlightDomPath(payload: ActionPayload = {}) {
    const { profile, path, url, rootSelector, style, sticky, duration, channel } = normalizePayload(payload, { required: ['profile', 'path'] });
    
    // 先加载 DOM 分支确保元素存在
    if (path !== 'root' && url) {
      try {
        await this.fetchDomBranchFromService({
          sessionId: profile,
          url,
          path,
          rootSelector,
          maxDepth: 2,
          maxChildren: 10,
        });
        logDebug('controller', 'highlight-dom-path', { message: 'DOM branch loaded', path });
      } catch (err: any) {
        logDebug('controller', 'highlight-dom-path', { message: 'Failed to load DOM branch', path, error: err.message });
      }
    }

    const finalChannel = channel || 'hover-dom';
    const finalStyle = style || '2px solid rgba(96, 165, 250, 0.95)';
    const finalSticky = typeof sticky === 'boolean' ? sticky : true;
    try {
      const result = await this.sendHighlightDomPathViaWs(profile, path!, {
        channel: finalChannel,
        style: finalStyle,
        sticky: finalSticky,
        duration,
        rootSelector: rootSelector || null,
      } as any);
      this.messageBus?.publish?.('ui.highlight.result', {
        success: true,
        selector: null,
        details: result?.details || null,
      });
      return { success: true, data: result };
    } catch (err: any) {
      const errorMessage = err?.message || 'DOM 路径高亮失败';
      this.messageBus?.publish?.('ui.highlight.result', {
        success: false,
        selector: null,
        error: errorMessage,
      });
      throw err;
    }
  }

  async handleBrowserCancelDomPick(payload: ActionPayload = {}) {
    const { profile } = normalizePayload(payload, { required: ['profile'] });
    try {
      const data = await this.sendCancelDomPickViaWs(profile);
      this.messageBus?.publish?.('ui.domPicker.result', {
        success: false,
        cancelled: true,
        source: 'cancel-action',
        details: data,
      });
      return { success: true, data };
    } catch (err: any) {
      const message = err?.message || '取消捕获失败';
      this.messageBus?.publish?.('ui.domPicker.result', {
        success: false,
        cancelled: true,
        error: message,
      });
      throw err;
    }
  }

  async handleBrowserPickDom(payload: ActionPayload = {}) {
    const { profile, timeout, rootSelector } = normalizePayload(payload, { required: ['profile'] });
    const finalTimeout = Math.min(Math.max(Number(timeout) || 25000, 3000), 60000);
    const startedAt = Date.now();
    try {
      const result = await this.sendDomPickerViaWs(profile, {
        timeout: finalTimeout,
        rootSelector,
      });
      this.messageBus?.publish?.('ui.domPicker.result', {
        success: true,
        selector: result?.selector || null,
        domPath: result?.dom_path || null,
        durationMs: Date.now() - startedAt,
      });
      return { success: true, data: result };
    } catch (err: any) {
      const message = err?.message || '元素拾取失败';
      this.messageBus?.publish?.('ui.domPicker.result', { success: false, error: message });
      throw err;
    }
  }

  // v2 DOM pick：直接暴露 dom_path + selector 给 UI
  async handleDomPick2(payload: ActionPayload = {}) {
    const { profile, timeout, rootSelector } = normalizePayload(payload, { required: ['profile'] });
    const finalTimeout = Math.min(Math.max(Number(timeout) || 25000, 3000), 60000);
    const result = await this.sendDomPickerViaWs(profile, { timeout: finalTimeout, rootSelector });
    // 统一输出结构：domPath + selector
    return {
      success: true,
      data: {
        domPath: result?.dom_path || null,
        selector: result?.selector || null,
        raw: result,
      },
    };
  }

  async sendHighlightViaWs(sessionId: string, selector: string, options: HighlightOptions = {}) {
    const payload: WsCommandPayload = {
      type: 'command',
      session_id: sessionId,
      data: {
        command_type: 'dev_command',
        action: 'highlight_element',
        parameters: {
          selector,
          ...(options.style ? { style: options.style } : {}),
          ...(typeof options.duration === 'number' ? { duration: options.duration } : {}),
          ...(options.channel ? { channel: options.channel } : {}),
          ...(typeof options.sticky === 'boolean' ? { sticky: options.sticky } : {}),
          ...(typeof options.maxMatches === 'number' ? { max_matches: options.maxMatches } : {}),
        },
      },
    };
    const response = await this.sendWsCommand(this.getBrowserWsUrl(), payload, 20000);
    const data = response?.data || response;
    const success = data?.success !== false;
    if (!success) {
      const err = data?.error || response?.error;
      throw new Error(err || 'highlight_element failed');
    }
    return {
      success: true,
      source: 'ws',
      details: data?.data || data,
    };
  }

  async sendHighlightDomPathViaWs(sessionId: string, domPath: string, options: HighlightOptions = {}) {
    const payload: WsCommandPayload = {
      type: 'command',
      session_id: sessionId,
      data: {
        command_type: 'dev_command',
        action: 'highlight_dom_path',
        parameters: {
          path: domPath,
          ...(options.style ? { style: options.style } : {}),
          ...(typeof options.duration === 'number' ? { duration: options.duration } : {}),
          ...(options.channel ? { channel: options.channel } : {}),
          ...(typeof options.sticky === 'boolean' ? { sticky: options.sticky } : {}),
          ...((options as any).rootSelector ? { root_selector: (options as any).rootSelector } : {}),
        },
      },
    };
    const response = await this.sendWsCommand(this.getBrowserWsUrl(), payload, 20000);
    const data = response?.data || response;
    const success = data?.success !== false;
    if (!success) {
      const err = data?.error || response?.error;
      throw new Error(err || 'highlight_dom_path failed');
    }
    return {
      success: true,
      source: 'ws',
      details: data?.data || data,
    };
  }

  async sendClearHighlightViaWs(sessionId: string, channel: string | null = null) {
    const payload: WsCommandPayload = {
      type: 'command',
      session_id: sessionId,
      data: {
        command_type: 'dev_command',
        action: 'clear_highlight',
        parameters: channel ? { channel } : {},
      },
    };
    const response = await this.sendWsCommand(this.getBrowserWsUrl(), payload, 10000);
    const data = response?.data || response;
    if (data?.success === false) {
      throw new Error(data?.error || 'clear_highlight failed');
    }
    return data?.data || data || { removed: 0 };
  }

  async sendCancelDomPickViaWs(sessionId: string) {
    const payload: WsCommandPayload = {
      type: 'command',
      session_id: sessionId,
      data: {
        command_type: 'dev_command',
        action: 'cancel_dom_pick',
        parameters: {},
      },
    };
    const response = await this.sendWsCommand(this.getBrowserWsUrl(), payload, 10000);
    const data = response?.data || response;
    if (data?.success === false) {
      throw new Error(data?.error || 'cancel_dom_pick failed');
    }
    return data?.data || data || { cancelled: false };
  }

  async sendDomPickerViaWs(sessionId: string, options: DomPickerOptions = {}) {
    const timeout = Math.min(Math.max(Number(options.timeout) || 25000, 3000), 60000);
    const payload: WsCommandPayload = {
      type: 'command',
      session_id: sessionId,
      data: {
        command_type: 'node_execute',
        node_type: 'pick_dom',
        parameters: {
          timeout,
          ...(options.rootSelector ? { root_selector: options.rootSelector } : {}),
        },
      },
    };
    const response = await this.sendWsCommand(this.getBrowserWsUrl(), payload, timeout + 5000);
    const data = response?.data;
    if (data?.success === false) {
      throw new Error(data?.error || 'pick_dom failed');
    }
    const result = data?.data || data;
    if (!result) {
      throw new Error('picker result missing');
    }
   return result;
 }

  async sendExecuteViaWs(sessionId: string, script: string) {
    const payload: WsCommandPayload = {
      type: 'command',
      session_id: sessionId,
      data: {
        command_type: 'node_execute',
        node_type: 'evaluate',
        parameters: {
          script,
        },
      },
    };
    const response = await this.sendWsCommand(this.getBrowserWsUrl(), payload, 10000);
    const data = response?.data || response;
    if (data?.success === false) {
      throw new Error(data?.error || 'execute failed');
    }
    return data?.data || data || { result: null };
  }

  async fetchContainerSnapshotFromService({ sessionId, url, maxDepth, maxChildren, rootContainerId, rootSelector }: { sessionId: string; url: string; maxDepth?: number; maxChildren?: number; rootContainerId?: string; rootSelector?: string }) {
    if (!sessionId || !url) {
      throw new Error('缺少 sessionId 或 URL');
    }
    const payload: WsCommandPayload = {
      type: 'command',
      session_id: sessionId,
      data: {
        command_type: 'container_operation',
        action: 'inspect_tree',
        page_context: { url },
        parameters: {
          ...(typeof maxDepth === 'number' ? { max_depth: maxDepth } : {}),
          ...(typeof maxChildren === 'number' ? { max_children: maxChildren } : {}),
          ...(rootContainerId ? { root_container_id: rootContainerId } : {}),
          ...(rootSelector ? { root_selector: rootSelector } : {}),
        },
      },
    };
    const response = await this.sendWsCommand(this.getBrowserWsUrl(), payload, 20000);
    if (response?.data?.success) {
      return response.data.data || response.data.snapshot || response.data;
    }
    throw new Error(response?.data?.error || response?.error || 'inspect_tree failed');
  }

  async fetchDomBranchFromService({ sessionId, url, path, rootSelector, maxDepth, maxChildren }: { sessionId: string; url: string; path: string; rootSelector?: string; maxDepth?: number; maxChildren?: number }) {
    if (!sessionId || !url || !path) {
      throw new Error('缺少 sessionId / URL / DOM 路径');
    }
    const payload: WsCommandPayload = {
      type: 'command',
      session_id: sessionId,
      data: {
        command_type: 'container_operation',
        action: 'inspect_dom_branch',
        page_context: { url },
        parameters: {
          path,
          ...(rootSelector ? { root_selector: rootSelector } : {}),
          ...(typeof maxDepth === 'number' ? { max_depth: maxDepth } : {}),
          ...(typeof maxChildren === 'number' ? { max_children: maxChildren } : {}),
        },
      }
    };
    const response = await this.sendWsCommand(this.getBrowserWsUrl(), payload, 20000);
    if (response?.data?.success) {
      return response.data.data || response.data.snapshot || response.data;
    }
    throw new Error(response?.data?.error || response?.error || 'inspect_dom_branch failed');
  }

  // 下列方法尚未在 TS 版本实现，仅为保持编译通过的占位实现
  async handleDomBranch2(_payload: ActionPayload = {}): Promise<any> {
    throw new Error('handleDomBranch2 is not implemented in controller.ts');
  }

  async fetchSessions(): Promise<Session[]> {
    try {
      const res = await this.runCliCommand('session-manager', ['list']);
      const sessions = res?.sessions || res?.data?.sessions || res?.data || [];
      return Array.isArray(sessions) ? sessions : [];
    } catch {
      return [];
    }
  }

  findSessionByProfile(sessions: Session[], profile: string): Session | null {
    if (!profile) return null;
    return (
      sessions.find(
        (session) =>
          session?.profileId === profile ||
          session?.profile_id === profile ||
          session?.session_id === profile ||
          session?.sessionId === profile,
      ) || null
    );
  }

  focusSnapshotOnContainer(snapshot: any, containerId: string) {
    if (!containerId || !snapshot?.container_tree) {
      return snapshot;
    }
    const target = this.cloneContainerSubtree(snapshot.container_tree, containerId);
    if (!target) {
      return snapshot;
    }
    const nextSnapshot = {
      ...snapshot,
      container_tree: target,
      metadata: {
        ...(snapshot.metadata || {}),
        root_container_id: containerId,
      },
    };
    if (!nextSnapshot.root_match || nextSnapshot.root_match?.container?.id !== containerId) {
      nextSnapshot.root_match = {
        container: {
          id: containerId,
          ...(target.name ? { name: target.name } : {}),
        },
        matched_selector: target.match?.matched_selector,
      };
    }
    return nextSnapshot;
  }

  cloneContainerSubtree(node: any, targetId: string): any {
    if (!node) return null;
    if (node.id === targetId || node.container_id === targetId) {
      return this.deepClone(node);
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const match = this.cloneContainerSubtree(child, targetId);
        if (match) return match;
      }
    }
    return null;
  }

  deepClone(payload: any) {
    return JSON.parse(JSON.stringify(payload));
  }

  async captureInspectorSnapshot(options: SnapshotOptions = {}) {
    const profile = options.profile;

    // 优先使用调用方提供的 URL，避免为了 containers:match 再额外跑一次 session-manager CLI
    // 只有在 URL 缺失时才回退到 CLI 查询当前会话列表。
    let targetSession: Session | null = null;
    let sessions: Session[] = [];

    if (!options.url) {
      sessions = await this.fetchSessions();
      targetSession = profile ? this.findSessionByProfile(sessions, profile) : sessions[0] || null;
    }

    const sessionId = profile || targetSession?.session_id || targetSession?.sessionId || null;
    const profileId = profile || targetSession?.profileId || targetSession?.profile_id || sessionId || null;
    const targetUrl = options.url || targetSession?.current_url || targetSession?.currentUrl;
    const requestedContainerId = (options as any).containerId || (options as any).rootContainerId;
    if (!targetUrl) {
      throw new Error('无法确定会话 URL，请先在浏览器中打开目标页面');
    }
    let liveError: Error | null = null;
    let snapshot: any = null;
    if (sessionId) {
      try {
        snapshot = await this.fetchContainerSnapshotFromService({
          sessionId,
          url: targetUrl,
          maxDepth: options.maxDepth,
          maxChildren: options.maxChildren,
          rootContainerId: requestedContainerId,
          rootSelector: (options as any).rootSelector,
        });
      } catch (err) {
        liveError = err as Error;
      }
    }
    if (!snapshot || !snapshot.container_tree) {
      const rootError = liveError || new Error('容器树为空，检查容器定义或选择器是否正确');
      throw rootError;
    }
    if (requestedContainerId) {
      snapshot = this.focusSnapshotOnContainer(snapshot, requestedContainerId);
    }
    return {
      sessionId: sessionId || profileId || 'unknown-session',
      profileId: profileId || 'default',
      targetUrl,
      snapshot,
    };
  }

  async captureInspectorBranch(options: BranchOptions = {}) {
    const profile = options.profile;
    const domPath = options.path;
    if (!profile) throw new Error('缺少 profile');
    if (!domPath) throw new Error('缺少 DOM 路径');
    const sessions = await this.fetchSessions();
    const targetSession = profile ? this.findSessionByProfile(sessions, profile) : sessions[0] || null;
    const sessionId = targetSession?.session_id || targetSession?.sessionId || profile || null;
    const profileId = profile || targetSession?.profileId || targetSession?.profile_id || sessionId || null;
    const targetUrl = options.url || targetSession?.current_url || targetSession?.currentUrl;
    if (!targetUrl) {
      throw new Error('无法确定会话 URL');
    }
    let branch: any = null;
    let liveError: Error | null = null;
    if (sessionId) {
      try {
        branch = await this.fetchDomBranchFromService({
          sessionId,
          url: targetUrl,
          path: domPath,
          rootSelector: options.rootSelector,
          maxDepth: options.maxDepth,
          maxChildren: options.maxChildren,
        });
      } catch (err) {
        liveError = err as Error;
      }
    }
    if (!branch?.node) {
      throw liveError || new Error('无法获取 DOM 分支');
    }
    return {
      sessionId: sessionId || profileId || 'unknown-session',
      profileId: profileId || 'default',
      targetUrl,
      branch,
    };
  }

  resolveSiteKeyFromUrl(url: string): string | null {
    if (!url) return null;
    let host = '';
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
    const index = this.loadContainerIndex();
    let bestKey: string | null = null;
    let bestLen = -1;
    for (const [key, meta] of Object.entries(index)) {
      const domain = ((meta as any)?.website || '').toLowerCase();
      if (!domain) continue;
      if (host === domain || host.endsWith(`.${domain}`)) {
        if (domain.length > bestLen) {
          bestKey = key;
          bestLen = domain.length;
        }
      }
    }
    return bestKey;
  }

  loadContainerIndex(): any {
    if (this._containerIndexCache) {
      return this._containerIndexCache;
    }
    if (!fs.existsSync(this.containerIndexPath)) {
      this._containerIndexCache = {};
      return this._containerIndexCache;
    }
    try {
      this._containerIndexCache = JSON.parse(fs.readFileSync(this.containerIndexPath, 'utf-8'));
    } catch {
      this._containerIndexCache = {};
    }
    return this._containerIndexCache;
  }

  inferSiteFromContainerId(containerId: string): string | null {
    if (!containerId) return null;
    const dotIdx = containerId.indexOf('.');
    if (dotIdx > 0) {
      return containerId.slice(0, dotIdx);
    }
    const underscoreIdx = containerId.indexOf('_');
    if (underscoreIdx > 0) {
      return containerId.slice(0, underscoreIdx);
    }
    return null;
  }

  async writeUserContainerDefinition(siteKey: string, containerId: string, definition: any): Promise<void> {
    const parts = containerId.split('.').filter(Boolean);
    const targetDir = path.join(this.userContainerRoot, siteKey, ...parts);
    await fsPromises.mkdir(targetDir, { recursive: true });
    const filePath = path.join(targetDir, 'container.json');
    const payload = { ...definition, id: containerId };
    await fsPromises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  normalizeSelectors(_selectors: any): any {
    return _selectors;
  }

  async readContainerDefinition(siteKey: string, containerId: string): Promise<any> {
    const parts = containerId.split('.').filter(Boolean);
    const targetDir = path.join(this.userContainerRoot, siteKey, ...parts);
    const filePath = path.join(targetDir, 'container.json');

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = await fsPromises.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private async sendWsCommand(_url: string, _payload: any, _timeout = 15000): Promise<any> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(_url);
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.terminate();
        reject(new Error("WebSocket command timeout"));
      }, _timeout);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.removeAllListeners();
      };

      socket.once("open", () => {
        try {
          socket.send(JSON.stringify(_payload));
        } catch (err) {
          cleanup();
          if (!settled) {
            settled = true;
            reject(err);
          }
        }
      });

      socket.once("message", (data) => {
        cleanup();
        if (settled) return;
        settled = true;
        try {
          resolve(JSON.parse(data.toString("utf-8")));
        } catch (err) {
          reject(err);
        } finally {
          socket.close();
        }
      });

      socket.once("error", (err) => {
        cleanup();
        if (settled) return;
        settled = true;
        reject(err);
      });

      socket.once("close", () => {
        cleanup();
        if (!settled) {
          settled = true;
          reject(new Error("WebSocket closed before response"));
        }
      });
    });
  }
  private getBrowserWsUrl(): string {
    return `ws://${this.defaultWsHost || '127.0.0.1'}:${this.defaultWsPort || 7701}/ws`;
  }

  async handleContainerOperation(payload: ActionPayload = {}) {
    const { containerId, operationId, config, profile } = normalizePayload(payload, { required: ['containerId', 'operationId', 'profile'] });
    
    // Determine target URL for HTTP post to container endpoint
    const port = process.env.WEBAUTO_UNIFIED_PORT || 7701;
    const host = '127.0.0.1';
    
    try {
      const response = await fetch(`http://${host}:${port}/v1/container/${containerId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId,
          config,
          sessionId: profile
        } as Record<string, any>)
      });
      
      if (!response.ok) {
        return { success: false, error: await response.text() };
      }
      
      return await response.json();
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private emitContainerAppearEvents(containerTree: any, context: { sessionId?: string; profileId?: string; url?: string; snapshot?: any }) {
    if (!this.messageBus?.publish) return;
    if (!containerTree || !containerTree.id) {
      logDebug('controller', 'emitContainerAppearEvents', { message: 'No valid container tree provided' });
      return;
    }

    const visited = new Set<string>();
    
    // Emit for root container (the containerTree itself)
    this.emitSingleContainerAppear(containerTree, context, visited);

    // Emit for all child containers in tree
    if (containerTree.children && Array.isArray(containerTree.children)) {
      for (const child of containerTree.children) {
        this.emitTreeContainerAppear(child, context, visited);
      }
    }
  }

  private emitSingleContainerAppear(container: any, context: { sessionId?: string; profileId?: string; url?: string }, visited: Set<string>) {
    if (!container || !container.id) return;
    const containerId = String(container.id);
    if (visited.has(containerId)) return;
    visited.add(containerId);

    const payload = {
      containerId,
      containerName: container.name || null,
      sessionId: context.sessionId,
      profileId: context.profileId,
      url: context.url,
      bbox: container.match?.bbox || container.bbox || null,
      visible: container.match?.visible ?? container.visible ?? null,
      score: container.match?.score ?? container.score ?? null,
      timestamp: Date.now(),
      source: 'containers:match',
    };

    this.messageBus?.publish?.('container:appear', payload);
    this.messageBus?.publish?.(`container:${containerId}:appear`, payload);
    
    logDebug('controller', 'container:appear', { containerId, containerName: container.name });
  }

  private emitTreeContainerAppear(node: any, context: { sessionId?: string; profileId?: string; url?: string }, visited: Set<string>) {
    if (!node || !node.id) return;
    
    // Emit for this node (node itself is a container object)
    this.emitSingleContainerAppear(node, context, visited);
    
    // Recursively emit for children
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        this.emitTreeContainerAppear(child, context, visited);
      }
    }
  }
}

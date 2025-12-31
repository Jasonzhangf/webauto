import path from 'node:path';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

export class UiController {
  constructor(options = {}) {
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
    this.errorHandler = null;
  }

  async handleAction(action, payload = {}) {
    switch (action) {
      case 'browser:status':
        return this.fetchBrowserStatus();
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
       return this.handleContainerInspect(payload);
     case 'containers:inspect-container':
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
    case 'browser:highlight':
      return this.handleBrowserHighlight(payload);
    case 'browser:clear-highlight':
      return this.handleBrowserClearHighlight(payload);
    case 'browser:execute':
      return this.handleBrowserExecute(payload);
     case 'browser:highlight-dom-path':
       return this.handleBrowserHighlightDomPath(payload);
     case 'browser:cancel-pick':
       return this.handleBrowserCancelDomPick(payload);
     case 'browser:pick-dom':
       return this.handleBrowserPickDom(payload);
     case 'dom:branch:2':
       return this.handleDomBranch2(payload);
     case 'dom:pick:2':
       return this.handleDomPick2(payload);
     case 'browser:inspect_tree':
       return this.fetchInspectTree(payload);
     case 'containers:match':
       return this.handleContainerMatch(payload);
     default:
       return { success: false, error: `Unknown action: ${action}` };
   }
 }

  async fetchBrowserStatus() {
    try {
      const url = `${this.getBrowserHttpBase()}/health`;
      const res = await fetch(url);
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      return { success: true, data: await res.json() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async fetchInspectTree(payload) {
    try {
      const wsUrl = this.getBrowserWsUrl();
      const command = {
        type: 'command',
        session_id: payload?.profile || 'default',
        data: {
          command_type: 'container_operation',
          action: 'inspect_tree',
          page_context: { url: payload?.url || 'https://example.com' },
          parameters: {
            ...(payload?.rootSelector ? { root_selector: payload.rootSelector } : {}),
            ...(typeof payload?.maxDepth === 'number' ? { max_depth: payload.maxDepth } : {}),
            ...(typeof payload?.maxChildren === 'number' ? { max_children: payload.maxChildren } : {}),
          },
        },
      };
      const wsResult = await this.sendWsCommand(wsUrl, command, 15000);
      if (wsResult?.data?.success !== true) {
        return { success: false, error: wsResult?.data?.error || 'inspect_tree failed' };
      }
      return { success: true, data: wsResult.data.data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async handleSessionCreate(payload = {}) {
    if (!payload.profile) {
      throw new Error('缺少 profile');
    }
    const args = ['create', '--profile', payload.profile];
    if (payload.url) args.push('--url', payload.url);
    if (payload.headless !== undefined) args.push('--headless', String(payload.headless));
    if (payload.keepOpen !== undefined) args.push('--keep-open', String(payload.keepOpen));
    return this.runCliCommand('session-manager', args);
  }

  async handleSessionDelete(payload = {}) {
    if (!payload.profile) {
      throw new Error('缺少 profile');
    }
    return this.runCliCommand('session-manager', ['delete', '--profile', payload.profile]);
  }

  async handleLogsStream(payload = {}) {
    const args = ['stream'];
    if (payload.source) args.push('--source', payload.source);
    if (payload.session) args.push('--session', payload.session);
    if (payload.lines) args.push('--lines', String(payload.lines));
    return this.runCliCommand('logging', args);
  }

  async handleOperationRun(payload = {}) {
    const op = payload.op || payload.operation || payload.id;
    if (!op) throw new Error('缺少操作 ID');
    const args = ['run', '--op', op];
    if (payload.config) {
      args.push('--config', JSON.stringify(payload.config));
    }
    return this.runCliCommand('operations', args);
  }

  async handleContainerInspect(payload = {}) {
    const profile = payload.profile;
    if (!profile) throw new Error('缺少 profile');
    const context = await this.captureInspectorSnapshot({
      profile,
      url: payload.url,
      maxDepth: payload.maxDepth,
      maxChildren: payload.maxChildren,
      containerId: payload.containerId,
      rootSelector: payload.rootSelector,
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

  async handleContainerInspectContainer(payload = {}) {
    if (!payload.profile) throw new Error('缺少 profile');
    if (!payload.containerId) throw new Error('缺少 containerId');
    const context = await this.captureInspectorSnapshot({
      profile: payload.profile,
      url: payload.url,
      maxDepth: payload.maxDepth,
      maxChildren: payload.maxChildren,
      containerId: payload.containerId,
      rootSelector: payload.rootSelector,
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

  async handleContainerInspectBranch(payload = {}) {
    if (!payload.profile) throw new Error('缺少 profile');
    if (!payload.path) throw new Error('缺少 DOM 路径');
    const context = await this.captureInspectorBranch({
      profile: payload.profile,
      url: payload.url,
      path: payload.path,
      rootSelector: payload.rootSelector,
      maxDepth: payload.maxDepth,
      maxChildren: payload.maxChildren,
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

  async handleContainerRemap(payload = {}) {
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
    const filtered = existingSelectors.filter((item) => (item?.css || '').trim() && (item.css || '').trim() !== selector);
    normalizedDefinition.selectors = [{ css: selector, variant: 'primary', score: 1 }, ...filtered];
    await this.writeUserContainerDefinition(siteKey, containerId, normalizedDefinition);
    return this.handleContainerInspect({ profile: payload.profile, url: payload.url });
  }

  async handleContainerCreateChild(payload = {}) {
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
    const parentDefinition = (await this.readContainerDefinition(siteKey, parentId)) || { id: parentId, children: [] };
    const normalizedChild = {
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
      const parentPatterns = parentDefinition.page_patterns || parentDefinition.pagePatterns;
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
    return this.handleContainerInspect({ profile: payload.profile, url: payload.url });
  }

  async handleContainerUpdateAlias(payload = {}) {
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
    const metadata = { ...(baseDefinition.metadata || {}) };
    if (alias) {
      metadata.alias = alias;
    } else {
      delete metadata.alias;
    }
    const next = {
      ...baseDefinition,
      name: baseDefinition.name || alias || containerId,
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
    return this.handleContainerInspect({ profile: payload.profile, url: payload.url });
  }

  async handleContainerUpdateOperations(payload = {}) {
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
    return this.handleContainerInspect({ profile: payload.profile, url: payload.url, containerId });
  }

  async handleContainerMatch(payload = {}) {
    const profile = payload.profileId || payload.profile;
    const url = payload.url;
    if (!profile) throw new Error('缺少 profile');
    if (!url) throw new Error('缺少 URL');
    try {
      const context = await this.captureInspectorSnapshot({
        profile,
        url,
        maxDepth: payload.maxDepth || 2,
        maxChildren: payload.maxChildren || 5,
        rootSelector: payload.rootSelector,
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
      return { success: true, data: matchPayload };
    } catch (err) {
      throw new Error(`容器匹配失败: ${err?.message || String(err)}`);
    }
  }

      async handleBrowserHighlight(payload = {}) {
    const profile = payload.profile || payload.sessionId;
    const selector = (payload.selector || '').trim();
    if (!profile) {
      throw new Error('缺少会话/ profile 信息');
    }
    if (!selector) {
      throw new Error('缺少 selector');
    }
    const options = payload.options || {};
    
    // 处理颜色
    let style = options.style;
    const color = payload.color;
    if (!style) {
        if (color === 'green') style = '2px solid rgba(76, 175, 80, 0.95)';
        else if (color === 'blue') style = '2px solid rgba(33, 150, 243, 0.95)';
        else if (color === 'red') style = '2px solid rgba(244, 67, 54, 0.95)';
        else if (color && /^[a-z]+$/i.test(color)) style = `2px solid ${color}`;
        else style = '2px solid rgba(255, 0, 0, 0.8)';
    }

    const highlightOpts = {
      style,
      duration: options.duration,
      channel: options.channel || payload.channel,
      sticky: options.sticky,
      maxMatches: options.maxMatches,
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
    } catch (err) {
      const errorMessage = err?.message || '高亮请求失败';
      this.messageBus?.publish?.('ui.highlight.result', {
        success: false,
        selector,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }


  async handleBrowserClearHighlight(payload = {}) {
    const profile = payload.profile || payload.sessionId;
    if (!profile) {
      throw new Error('缺少会话/ profile 信息');
    }
    try {
      const result = await this.sendClearHighlightViaWs(profile, payload.channel || payload.options?.channel || null);
      this.messageBus?.publish?.('ui.highlight.result', {
        success: true,
        selector: null,
        details: result,
      });
      return { success: true, data: result };
    } catch (err) {
      const message = err?.message || '清除高亮失败';
      this.messageBus?.publish?.('ui.highlight.result', {
        success: false,
        selector: null,
        error: message,
      });
      throw err;
    }
  }

  async handleBrowserHighlightDomPath(payload = {}) {
    const profile = payload.profile || payload.sessionId;
    const domPath = (payload.path || payload.domPath || payload.dom_path || '').trim();
    if (!profile) {
      throw new Error('缺少会话/ profile 信息');
    }
    if (!domPath) {
      throw new Error('缺少 DOM 路径');
    }
    const options = payload.options || {};
    const channel = options.channel || payload.channel || 'hover-dom';
    const rootSelector = options.rootSelector || payload.rootSelector || payload.root_selector || null;

    let style = options.style;
    if (!style && payload.color) {
      const color = payload.color;
      if (color === 'green') style = '2px solid rgba(76, 175, 80, 0.95)';
      else if (color === 'blue') style = '2px solid rgba(33, 150, 243, 0.95)';
      else if (color === 'red') style = '2px solid rgba(244, 67, 54, 0.95)';
      else if (color && /^[a-z]+$/i.test(color)) style = `2px solid ${color}`;
    }
    if (!style) {
      style = '2px solid rgba(96, 165, 250, 0.95)';
    }

    const sticky = typeof options.sticky === 'boolean' ? options.sticky : true;
    try {
      const result = await this.sendHighlightDomPathViaWs(profile, domPath, {
        channel,
        style,
        sticky,
        duration: options.duration,
        rootSelector,
      });
      this.messageBus?.publish?.('ui.highlight.result', {
        success: true,
        selector: null,
        details: result?.details || null,
      });
      return { success: true, data: result };
    } catch (err) {
      const errorMessage = err?.message || 'DOM 路径高亮失败';
      this.messageBus?.publish?.('ui.highlight.result', {
        success: false,
        selector: null,
        error: errorMessage,
      });
      throw err;
    }
  }

  async handleBrowserExecute(payload = {}) {
    const profile = payload.profile || payload.sessionId;
    const script = payload.script || payload.code || '';
    if (!profile) {
      throw new Error('缺少会话/ profile 信息');
    }
    if (!script) {
      throw new Error('缺少 script 参数');
    }
    try {
      const result = await this.sendExecuteViaWs(profile, script);
      return { success: true, data: result };
    } catch (err) {
      const errorMessage = err?.message || '执行脚本失败';
      throw new Error(errorMessage);
    }
  }

  async handleBrowserCancelDomPick(payload = {}) {
    const profile = payload.profile || payload.sessionId;
    if (!profile) {
      throw new Error('缺少会话/ profile 信息');
    }
    try {
      const data = await this.sendCancelDomPickViaWs(profile);
      this.messageBus?.publish?.('ui.domPicker.result', {
        success: false,
        cancelled: true,
        source: 'cancel-action',
        details: data,
      });
      return { success: true, data };
    } catch (err) {
      const message = err?.message || '取消捕获失败';
      this.messageBus?.publish?.('ui.domPicker.result', {
        success: false,
        cancelled: true,
        error: message,
      });
      throw err;
    }
  }

  async handleBrowserPickDom(payload = {}) {
    const profile = payload.profile || payload.sessionId;
    if (!profile) {
      throw new Error('缺少会话/ profile 信息');
    }
    const timeout = Math.min(Math.max(Number(payload.timeout) || 25000, 3000), 60000);
    const rootSelector = payload.rootSelector || payload.root_selector || null;
    const startedAt = Date.now();
    try {
      const result = await this.sendDomPickerViaWs(profile, {
        timeout,
        rootSelector,
      });
      this.messageBus?.publish?.('ui.domPicker.result', {
        success: true,
        selector: result?.selector || null,
        domPath: result?.dom_path || null,
        durationMs: Date.now() - startedAt,
      });
      return { success: true, data: result };
    } catch (err) {
      const message = err?.message || '元素拾取失败';
      this.messageBus?.publish?.('ui.domPicker.result', { success: false, error: message });
      throw err;
    }
  }

  // v2 DOM pick：直接暴露 dom_path + selector 给 UI
  async handleDomPick2(payload = {}) {
    const profile = payload.profile || payload.sessionId;
    if (!profile) {
      throw new Error('缺少会话/ profile 信息');
    }
    const timeout = Math.min(Math.max(Number(payload.timeout) || 25000, 3000), 60000);
    const rootSelector = payload.rootSelector || payload.root_selector || null;
    const result = await this.sendDomPickerViaWs(profile, { timeout, rootSelector });
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

  async sendHighlightViaWs(sessionId, selector, options = {}) {
    const payload = {
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

  async sendHighlightDomPathViaWs(sessionId, domPath, options = {}) {
    const payload = {
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
          ...(options.rootSelector ? { root_selector: options.rootSelector } : {}),
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

  async sendClearHighlightViaWs(sessionId, channel = null) {
    const payload = {
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

  async sendCancelDomPickViaWs(sessionId) {
    const payload = {
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

  async sendExecuteViaWs(sessionId, script) {
    const payload = {
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

  async sendDomPickerViaWs(sessionId, options = {}) {
    const timeout = Math.min(Math.max(Number(options.timeout) || 25000, 3000), 60000);
    const payload = {
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

  async fetchContainerSnapshotFromService({ sessionId, url, maxDepth, maxChildren, rootContainerId, rootSelector }) {
    if (!sessionId || !url) {
      throw new Error('缺少 sessionId 或 URL');
    }
    const payload = {
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

  async fetchDomBranchFromService({ sessionId, url, path, rootSelector, maxDepth, maxChildren }) {
    if (!sessionId || !url || !path) {
      throw new Error('缺少 sessionId / URL / DOM 路径');
    }
    
    // 使用 WebSocket 而不是 CLI（避免 fixture 依赖）
    const payload = {
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
      },
    };
    const response = await this.sendWsCommand(this.getBrowserWsUrl(), payload, 20000);
    if (response?.data?.success) {
      const data = response.data.data || response.data.branch || response.data;
      // 适配：确保返回结构包含 path 和 node 字段
      if (data && !data.node && data.path) {
        const nodeData = { 
          path: data.path, 
          children: data.children || [], 
          childCount: data.node_count || (data.children?.length || 0) 
        };
        if (data.tag) nodeData.tag = data.tag;
        if (data.id) nodeData.id = data.id;
        if (data.classes) nodeData.classes = data.classes;
        return { path: data.path, node: nodeData };
      }
      return data;
    }
    throw new Error(response?.data?.error || response?.error || 'inspect_dom_branch failed');
  }

  // v2 DOM branch：按 domPath + depth 获取局部树
  async handleDomBranch2(payload = {}) {
    const profile = payload.profile || payload.sessionId;
    const url = payload.url;
    const path = payload.path || payload.domPath;
    if (!profile) throw new Error('缺少会话/ profile 信息');
    if (!url) throw new Error('缺少 URL');
    if (!path) throw new Error('缺少 DOM 路径');
    const maxDepth = typeof payload.maxDepth === 'number' ? payload.maxDepth : payload.depth;
    const maxChildren = typeof payload.maxChildren === 'number' ? payload.maxChildren : (payload.maxChildren || 12);
    const rootSelector = payload.rootSelector || payload.root_selector || null;
    const sessionId = profile;
    const branch = await this.fetchDomBranchFromService({
      sessionId,
      url,
      path,
      rootSelector,
      maxDepth: typeof maxDepth === 'number' ? maxDepth : undefined,
      maxChildren: typeof maxChildren === 'number' ? maxChildren : undefined,
    });
    return { success: true, data: branch };
  }

  async captureSnapshotFromFixture({ profileId, url, maxDepth, maxChildren, containerId, rootSelector }) {
    const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'webauto-ui-'));
    const fixturePath = path.join(tmpDir, 'dom.html');
    try {
      const domArgs = ['dom-dump', '--url', url, '--headless', 'true', '--output', fixturePath];
      if (profileId) {
        domArgs.push('--profile', profileId);
      }
      await this.runCliCommand('browser-control', domArgs);
      const treeArgs = ['inspect-tree', '--url', url, '--fixture', fixturePath];
      if (containerId) treeArgs.push('--root-container-id', containerId);
      if (rootSelector) treeArgs.push('--root-selector', rootSelector);
      if (typeof maxDepth === 'number') {
        treeArgs.push('--max-depth', String(maxDepth));
      }
      if (typeof maxChildren === 'number') {
        treeArgs.push('--max-children', String(maxChildren));
      }
      const tree = await this.runCliCommand('container-matcher', treeArgs);
      return tree?.data || tree;
    } finally {
      fsPromises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async captureBranchFromFixture({ profileId, url, path: domPath, rootSelector, maxDepth, maxChildren }) {
    if (!domPath) {
      throw new Error('缺少 DOM 路径');
    }
    const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'webauto-branch-'));
    const fixturePath = path.join(tmpDir, 'dom.html');
    try {
      const domArgs = ['dom-dump', '--url', url, '--headless', 'true', '--output', fixturePath];
      if (profileId) domArgs.push('--profile', profileId);
      await this.runCliCommand('browser-control', domArgs);
      const branchArgs = ['inspect-branch', '--url', url, '--fixture', fixturePath, '--path', domPath];
      if (rootSelector) branchArgs.push('--root-selector', rootSelector);
      if (typeof maxDepth === 'number') branchArgs.push('--max-depth', String(maxDepth));
      if (typeof maxChildren === 'number') {
        branchArgs.push('--max-children', String(maxChildren));
      }
      const result = await this.runCliCommand('container-matcher', branchArgs);
      return result?.data || result;
    } finally {
      fsPromises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async captureInspectorSnapshot(options = {}) {
    const profile = options.profile;
    const sessions = await this.fetchSessions();
    const targetSession = profile ? this.findSessionByProfile(sessions, profile) : sessions[0] || null;
    const sessionId = targetSession?.session_id || targetSession?.sessionId || profile || null;
    const profileId = profile || targetSession?.profileId || targetSession?.profile_id || sessionId || null;
    const targetUrl = options.url || targetSession?.current_url || targetSession?.currentUrl;
    const requestedContainerId = options.containerId || options.rootContainerId;
    if (!targetUrl) {
      throw new Error('无法确定会话 URL，请先在浏览器中打开目标页面');
    }
    let liveError = null;
    let snapshot = null;
    if (sessionId) {
      try {
        snapshot = await this.fetchContainerSnapshotFromService({
          sessionId,
          url: targetUrl,
          maxDepth: options.maxDepth,
          maxChildren: options.maxChildren,
          rootContainerId: requestedContainerId,
          rootSelector: options.rootSelector,
        });
      } catch (err) {
        liveError = err;
      }
    }
    let fixtureSnapshot = null;
    if (!snapshot) {
      fixtureSnapshot = await this.captureSnapshotFromFixture({
        profileId,
        url: targetUrl,
        maxDepth: options.maxDepth,
        maxChildren: options.maxChildren,
        containerId: requestedContainerId,
        rootSelector: options.rootSelector,
      });
      snapshot = fixtureSnapshot;
    } else if (!snapshot?.dom_tree) {
      try {
        fixtureSnapshot = await this.captureSnapshotFromFixture({
          profileId,
          url: targetUrl,
          maxDepth: options.maxDepth,
          maxChildren: options.maxChildren,
          containerId: requestedContainerId,
          rootSelector: options.rootSelector,
        });
        if (fixtureSnapshot?.dom_tree) {
          snapshot.dom_tree = fixtureSnapshot.dom_tree;
          if (!snapshot.matches && fixtureSnapshot.matches) {
            snapshot.matches = fixtureSnapshot.matches;
          }
          const mergedMetadata = {
            ...(fixtureSnapshot.metadata || {}),
            ...(snapshot.metadata || {}),
          };
          if (!mergedMetadata.dom_source) {
            mergedMetadata.dom_source = 'fixture';
          }
          snapshot.metadata = mergedMetadata;
        }
      } catch (fixtureError) {
        if (this.errorHandler) this.errorHandler.warn('controller', 'fixture DOM capture failed', { error: fixtureError?.message || fixtureError });
        else console.warn('[controller] fixture DOM capture failed:', fixtureError?.message || fixtureError);
        console.warn('[controller] fixture DOM capture failed:', fixtureError?.message || fixtureError);
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

  async captureInspectorBranch(options = {}) {
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
    let branch = null;
    let liveError = null;
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
        liveError = err;
      }
    }
    if (!branch) {
      branch = await this.captureBranchFromFixture({
        profileId,
        url: targetUrl,
        path: domPath,
        rootSelector: options.rootSelector,
        maxDepth: options.maxDepth,
        maxChildren: options.maxChildren,
      });
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

  async runCliCommand(target, args = []) {
    const script = this.cliTargets[target];
    if (!script) throw new Error(`Unknown CLI target: ${target}`);
    return new Promise((resolve, reject) => {
      const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      console.log('[controller] runCliCommand', target, script, args.join(' '));
      const child = spawn(npxCmd, ['tsx', script, ...args], {
        cwd: this.repoRoot,
        env: process.env,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (err) => {
        console.warn('[controller] cli spawn error', target, err?.message || err);
        reject(err);
      });
      child.on('close', (code) => {
        console.log('[controller] cli exit', target, code);
        if (stdout.trim()) {
          console.log('[controller] cli stdout', target, stdout.trim());
        }
        if (stderr.trim()) {
          console.warn('[controller] cli stderr', target, stderr.trim());
        }
        if (code === 0) {
          resolve(this.normalizeCliResult(this.parseCliJson(stdout)));
        } else {
          reject(new Error(stderr.trim() || `CLI(${target}) exited with code ${code}`));
        }
      });
    });
  }

  parseCliJson(output = '') {
    const trimmed = output.trim();
    if (!trimmed) return {};
    const match = trimmed.match(/(\{[\s\S]*\})\s*$/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (e) {
        // ignore read error, file might be corrupted or empty
        if (this.errorHandler) this.errorHandler.debug('controller', 'read container file failed', { error: e.message });
        // ignore
      }
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return { raw: trimmed };
    }
  }

  normalizeCliResult(result) {
    if (result && typeof result === 'object' && 'data' in result && result.success) {
      return result.data;
    }
    return result;
  }

  async fetchSessions() {
    try {
      const res = await this.runCliCommand('session-manager', ['list']);
      const sessions = res?.sessions || res?.data?.sessions || res?.data || [];
      return Array.isArray(sessions) ? sessions : [];
    } catch {
      return [];
    }
  }

  findSessionByProfile(sessions, profile) {
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

  getBrowserWsUrl() {
    if (process.env.WEBAUTO_WS_URL) {
      return process.env.WEBAUTO_WS_URL;
    }
    const host = process.env.WEBAUTO_WS_HOST || this.defaultWsHost;
    const port = Number(process.env.WEBAUTO_WS_PORT || this.defaultWsPort);
    return `ws://${host}:${port}`;
  }

  getBrowserHttpBase() {
    if (process.env.WEBAUTO_BROWSER_HTTP_BASE) {
      return process.env.WEBAUTO_BROWSER_HTTP_BASE.replace(/\/$/, '');
    }
    const host = process.env.WEBAUTO_BROWSER_HTTP_HOST || this.defaultHttpHost;
    const port = Number(process.env.WEBAUTO_BROWSER_HTTP_PORT || this.defaultHttpPort);
    const protocol = process.env.WEBAUTO_BROWSER_HTTP_PROTO || this.defaultHttpProtocol;
    return `${protocol}://${host}:${port}`;
  }

  sendWsCommand(wsUrl, payload, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.terminate();
        reject(new Error('WebSocket command timeout'));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.removeAllListeners();
      };

      socket.once('open', () => {
        try {
          socket.send(JSON.stringify(payload));
        } catch (err) {
          cleanup();
          if (!settled) {
            settled = true;
            reject(err);
          }
        }
      });

      socket.once('message', (data) => {
        cleanup();
        if (settled) return;
        settled = true;
        try {
          resolve(JSON.parse(data.toString('utf-8')));
        } catch (err) {
          reject(err);
        } finally {
          socket.close();
        }
      });

      socket.once('error', (err) => {
        cleanup();
        if (settled) return;
        settled = true;
        reject(err);
      });

      socket.once('close', () => {
        cleanup();
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket closed before response'));
        }
      });
    });
  }

  resolveSiteBaseDir(siteKey) {
    const index = this.loadContainerIndex();
    const rel = index[siteKey]?.path || path.join('container-library', siteKey);
    return path.isAbsolute(rel) ? rel : path.join(this.repoRoot, rel);
  }

  buildContainerPath(baseDir, containerId) {
    if (!baseDir || !containerId) return null;
    const parts = containerId.split('.').filter(Boolean);
    if (!parts.length) return null;
    return path.join(baseDir, ...parts, 'container.json');
  }

  async readContainerDefinition(siteKey, containerId) {
    if (!siteKey || !containerId) return null;
    const userBase = path.join(this.userContainerRoot, siteKey);
    const userFile = this.buildContainerPath(userBase, containerId);
    if (userFile && fs.existsSync(userFile)) {
      try {
        const raw = await fsPromises.readFile(userFile, 'utf-8');
        return JSON.parse(raw);
      } catch (e) {
        // ignore read error, file might be corrupted or empty
        if (this.errorHandler) this.errorHandler.debug('controller', 'read container file failed', { error: e.message });
        // ignore
      }
    }
    const builtinBase = this.resolveSiteBaseDir(siteKey);
    const builtinFile = this.buildContainerPath(builtinBase, containerId);
    if (builtinFile && fs.existsSync(builtinFile)) {
      try {
        const raw = await fsPromises.readFile(builtinFile, 'utf-8');
        return JSON.parse(raw);
      } catch (e) {
        // ignore read error, file might be corrupted or empty
        if (this.errorHandler) this.errorHandler.debug('controller', 'read container file failed', { error: e.message });
        // ignore
      }
    }
    return null;
  }

  normalizeSelectors(source) {
    const selectors = Array.isArray(source)
      ? source
      : typeof source === 'string'
        ? [{ css: source }]
        : [];
    const result = [];
    const seen = new Set();
    selectors.forEach((entry, index) => {
      if (!entry) return;
      const css = (entry.css || '').trim();
      if (!css || seen.has(css)) return;
      seen.add(css);
      result.push({
        css,
        variant: entry.variant || (index === 0 ? 'primary' : 'fallback'),
        score: typeof entry.score === 'number' ? entry.score : index === 0 ? 1 : 0.7,
      });
    });
    return result;
  }

  async writeUserContainerDefinition(siteKey, containerId, definition) {
    const parts = containerId.split('.').filter(Boolean);
    const targetDir = path.join(this.userContainerRoot, siteKey, ...parts);
    await fsPromises.mkdir(targetDir, { recursive: true });
    const filePath = path.join(targetDir, 'container.json');
    const payload = { ...definition, id: containerId };
    await fsPromises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  focusSnapshotOnContainer(snapshot, containerId) {
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

  cloneContainerSubtree(node, targetId) {
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

  deepClone(payload) {
    return JSON.parse(JSON.stringify(payload));
  }

  resolveSiteKeyFromUrl(url) {
    if (!url) return null;
    let host = '';
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
    const index = this.loadContainerIndex();
    let bestKey = null;
    let bestLen = -1;
    for (const [key, meta] of Object.entries(index)) {
      const domain = (meta?.website || '').toLowerCase();
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

  loadContainerIndex() {
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

  inferSiteFromContainerId(containerId) {
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
}

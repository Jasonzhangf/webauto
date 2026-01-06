"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UiController = void 0;
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_fs_2 = require("node:fs");
const node_os_1 = __importDefault(require("node:os"));
const node_child_process_1 = require("node:child_process");
const ws_1 = __importDefault(require("ws"));
const index_js_1 = require("../../../modules/logging/src/index.js");
class UiController {
    constructor(options = {}) {
        this.repoRoot = options.repoRoot || process.cwd();
        this.messageBus = options.messageBus;
        this.userContainerRoot = options.userContainerRoot || node_path_1.default.join(node_os_1.default.homedir(), '.webauto', 'container-lib');
        this.containerIndexPath = options.containerIndexPath || node_path_1.default.join(this.repoRoot, 'container-library.index.json');
        this.cliTargets = options.cliTargets || {};
        this.defaultWsHost = options.defaultWsHost || '127.0.0.1';
        this.defaultWsPort = Number(options.defaultWsPort || 8765);
        this.defaultHttpHost = options.defaultHttpHost || '127.0.0.1';
        this.defaultHttpPort = Number(options.defaultHttpPort || 7704);
        this.defaultHttpProtocol = options.defaultHttpProtocol || 'http';
        this._containerIndexCache = null;
        this.cliTargets = options.cliTargets || {};
        (0, index_js_1.logDebug)('controller', 'init', {
            wsHost: this.defaultWsHost,
            wsPort: this.defaultWsPort,
            httpHost: this.defaultHttpHost,
            httpPort: this.defaultHttpPort
        });
    }
    async runCliCommand(moduleName, args) {
        const scriptPath = this.cliTargets[moduleName];
        if (!scriptPath) {
            throw new Error(`Unknown module: ${moduleName}`);
        }
        console.log(`[controller] runCliCommand ${moduleName} ${scriptPath} ${args.join(' ')}`);
        return new Promise((resolve, reject) => {
            const child = (0, node_child_process_1.spawn)('npx', ['tsx', scriptPath, ...args]);
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
                }
                catch (e) {
                    console.error(`[controller] cli parse error ${moduleName}`, e);
                    resolve({ success: true, raw: stdout.trim() });
                }
            });
            child.on('error', (err) => {
                reject(err);
            });
        });
    }
    async handleAction(action, payload = {}) {
        (0, index_js_1.logDebug)('controller', 'handleAction', { action, payload });
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
            case 'containers:match':
                return this.handleContainerMatch(payload);
            case 'browser:highlight':
                return this.handleBrowserHighlight(payload);
            case 'browser:clear-highlight':
                return this.handleBrowserClearHighlight(payload);
            case 'browser:highlight-dom-path':
                return this.handleBrowserHighlightDomPath(payload);
            case 'browser:execute':
                return this.handleBrowserExecute(payload);
            case 'browser:cancel-pick':
                return this.handleBrowserCancelDomPick(payload);
            case 'browser:pick-dom':
                return this.handleBrowserPickDom(payload);
            case 'dom:branch:2':
                return this.handleDomBranch2(payload);
            case 'dom:pick:2':
                return this.handleDomPick2(payload);
            default:
                return { success: false, error: `Unknown action: ${action}` };
        }
    }
    async handleSessionCreate(payload = {}) {
        if (!payload.profile) {
            throw new Error('缺少 profile');
        }
        (0, index_js_1.logDebug)('controller', 'session:create', { payload });
        const args = ['create', '--profile', payload.profile];
        if (payload.url)
            args.push('--url', payload.url);
        if (payload.headless !== undefined)
            args.push('--headless', String(payload.headless));
        if (payload.keepOpen !== undefined)
            args.push('--keep-open', String(payload.keepOpen));
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
        if (payload.source)
            args.push('--source', payload.source);
        if (payload.session)
            args.push('--session', payload.session);
        if (payload.lines)
            args.push('--lines', String(payload.lines));
        return this.runCliCommand('logging', args);
    }
    async handleOperationRun(payload = {}) {
        const op = payload.op || payload.operation || payload.id;
        if (!op)
            throw new Error('缺少操作 ID');
        const args = ['run', '--op', op];
        if (payload.config) {
            args.push('--config', JSON.stringify(payload.config));
        }
        return this.runCliCommand('operations', args);
    }
    async handleContainerInspect(payload = {}) {
        const profile = payload.profile;
        if (!profile)
            throw new Error('缺少 profile');
        (0, index_js_1.logDebug)('controller', 'containers:inspect', { profile, payload });
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
        if (!payload.profile)
            throw new Error('缺少 profile');
        if (!payload.containerId)
            throw new Error('缺少 containerId');
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
        if (!payload.profile)
            throw new Error('缺少 profile');
        if (!payload.path)
            throw new Error('缺少 DOM 路径');
        (0, index_js_1.logDebug)('controller', 'containers:inspect:branch', { profile: payload.profile, path: payload.path, payload });
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
        const siteKey = payload.siteKey ||
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
        const siteKey = payload.siteKey ||
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
            capabilities: Array.isArray(payload.definition?.capabilities) && payload.definition.capabilities.length
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
        }
        else {
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
        // 正确流程：写入定义后立即进行容器匹配，并通过 containers.matched 事件推送最新树
        return this.handleContainerMatch({
            profile: payload.profile,
            url: payload.url,
            maxDepth: payload.maxDepth,
            maxChildren: payload.maxChildren,
            rootSelector: payload.rootSelector,
        });
    }
    async handleContainerUpdateAlias(payload = {}) {
        const containerId = payload.containerId || payload.id;
        if (!containerId) {
            throw new Error('缺少容器 ID');
        }
        const alias = typeof payload.alias === 'string' ? payload.alias.trim() : '';
        const siteKey = payload.siteKey ||
            this.resolveSiteKeyFromUrl(payload.url) ||
            this.inferSiteFromContainerId(containerId);
        if (!siteKey) {
            throw new Error('无法确定容器所属站点');
        }
        const baseDefinition = (await this.readContainerDefinition(siteKey, containerId)) || { id: containerId };
        const metadata = { ...baseDefinition.metadata || {} };
        if (alias) {
            metadata.alias = alias;
        }
        else {
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
        }
        else {
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
        const siteKey = payload.siteKey ||
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
        if (!profile)
            throw new Error('缺少 profile');
        if (!url)
            throw new Error('缺少 URL');
        (0, index_js_1.logDebug)('controller', 'containers:match', { profile, url, payload });
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
            (0, index_js_1.logDebug)('controller', 'containers.matched', {
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
        }
        catch (err) {
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
        const highlightOpts = {
            style: options.style,
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
        }
        catch (err) {
            const errorMessage = err?.message || '高亮请求失败';
            this.messageBus?.publish?.('ui.highlight.result', {
                success: false,
                selector,
                error: errorMessage,
            });
            throw err || new Error(errorMessage);
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
        }
        catch (err) {
            const message = err?.message || '清除高亮失败';
            this.messageBus?.publish?.('ui.highlight.result', {
                success: false,
                selector: null,
                error: message,
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
        }
        catch (err) {
            const errorMessage = err?.message || '执行脚本失败';
            throw new Error(errorMessage);
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
        // 先加载 DOM 分支确保元素存在
        if (domPath !== 'root' && payload.url) {
            try {
                await this.fetchDomBranchFromService({
                    sessionId: profile,
                    url: payload.url,
                    path: domPath,
                    rootSelector: payload.rootSelector || payload.root_selector,
                    maxDepth: 2,
                    maxChildren: 10,
                });
                (0, index_js_1.logDebug)('controller', 'highlight-dom-path', { message: 'DOM branch loaded', path: domPath });
            }
            catch (err) {
                (0, index_js_1.logDebug)('controller', 'highlight-dom-path', { message: 'Failed to load DOM branch', path: domPath, error: err.message });
            }
        }
        const options = payload.options || {};
        const channel = options.channel || payload.channel || 'hover-dom';
        const style = options.style || '2px solid rgba(96, 165, 250, 0.95)';
        const sticky = typeof options.sticky === 'boolean' ? options.sticky : true;
        try {
            const result = await this.sendHighlightDomPathViaWs(profile, domPath, {
                channel,
                style,
                sticky,
                duration: options.duration,
                rootSelector: options.rootSelector || payload.rootSelector || payload.root_selector || null,
            });
            this.messageBus?.publish?.('ui.highlight.result', {
                success: true,
                selector: null,
                details: result?.details || null,
            });
            return { success: true, data: result };
        }
        catch (err) {
            const errorMessage = err?.message || 'DOM 路径高亮失败';
            this.messageBus?.publish?.('ui.highlight.result', {
                success: false,
                selector: null,
                error: errorMessage,
            });
            throw err;
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
        }
        catch (err) {
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
        }
        catch (err) {
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
            }
        };
        const response = await this.sendWsCommand(this.getBrowserWsUrl(), payload, 20000);
        if (response?.data?.success) {
            return response.data.data || response.data.snapshot || response.data;
        }
        throw new Error(response?.data?.error || response?.error || 'inspect_dom_branch failed');
    }
    // 下列方法尚未在 TS 版本实现，仅为保持编译通过的占位实现
    async handleDomBranch2(_payload = {}) {
        throw new Error('handleDomBranch2 is not implemented in controller.ts');
    }
    async fetchSessions() {
        try {
            const res = await this.runCliCommand('session-manager', ['list']);
            const sessions = res?.sessions || res?.data?.sessions || res?.data || [];
            return Array.isArray(sessions) ? sessions : [];
        }
        catch {
            return [];
        }
    }
    findSessionByProfile(sessions, profile) {
        if (!profile)
            return null;
        return (sessions.find((session) => session?.profileId === profile ||
            session?.profile_id === profile ||
            session?.session_id === profile ||
            session?.sessionId === profile) || null);
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
        if (!node)
            return null;
        if (node.id === targetId || node.container_id === targetId) {
            return this.deepClone(node);
        }
        if (Array.isArray(node.children)) {
            for (const child of node.children) {
                const match = this.cloneContainerSubtree(child, targetId);
                if (match)
                    return match;
            }
        }
        return null;
    }
    deepClone(payload) {
        return JSON.parse(JSON.stringify(payload));
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
            }
            catch (err) {
                liveError = err;
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
        if (!profile)
            throw new Error('缺少 profile');
        if (!domPath)
            throw new Error('缺少 DOM 路径');
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
            }
            catch (err) {
                liveError = err;
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
    resolveSiteKeyFromUrl(url) {
        if (!url)
            return null;
        let host = '';
        try {
            host = new URL(url).hostname.toLowerCase();
        }
        catch {
            return null;
        }
        const index = this.loadContainerIndex();
        let bestKey = null;
        let bestLen = -1;
        for (const [key, meta] of Object.entries(index)) {
            const domain = (meta?.website || '').toLowerCase();
            if (!domain)
                continue;
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
        if (!node_fs_1.default.existsSync(this.containerIndexPath)) {
            this._containerIndexCache = {};
            return this._containerIndexCache;
        }
        try {
            this._containerIndexCache = JSON.parse(node_fs_1.default.readFileSync(this.containerIndexPath, 'utf-8'));
        }
        catch {
            this._containerIndexCache = {};
        }
        return this._containerIndexCache;
    }
    inferSiteFromContainerId(containerId) {
        if (!containerId)
            return null;
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
    async writeUserContainerDefinition(siteKey, containerId, definition) {
        const parts = containerId.split('.').filter(Boolean);
        const targetDir = node_path_1.default.join(this.userContainerRoot, siteKey, ...parts);
        await node_fs_2.promises.mkdir(targetDir, { recursive: true });
        const filePath = node_path_1.default.join(targetDir, 'container.json');
        const payload = { ...definition, id: containerId };
        await node_fs_2.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    }
    normalizeSelectors(_selectors) {
        return _selectors;
    }
    async readContainerDefinition(siteKey, containerId) {
        const parts = containerId.split('.').filter(Boolean);
        const targetDir = node_path_1.default.join(this.userContainerRoot, siteKey, ...parts);
        const filePath = node_path_1.default.join(targetDir, 'container.json');
        if (!node_fs_1.default.existsSync(filePath)) {
            return null;
        }
        try {
            const content = await node_fs_2.promises.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    async sendWsCommand(_url, _payload, _timeout = 15000) {
        return new Promise((resolve, reject) => {
            const socket = new ws_1.default(_url);
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled)
                    return;
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
                }
                catch (err) {
                    cleanup();
                    if (!settled) {
                        settled = true;
                        reject(err);
                    }
                }
            });
            socket.once("message", (data) => {
                cleanup();
                if (settled)
                    return;
                settled = true;
                try {
                    resolve(JSON.parse(data.toString("utf-8")));
                }
                catch (err) {
                    reject(err);
                }
                finally {
                    socket.close();
                }
            });
            socket.once("error", (err) => {
                cleanup();
                if (settled)
                    return;
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
    getBrowserWsUrl() {
        return `ws://${this.defaultWsHost || '127.0.0.1'}:${this.defaultWsPort || 7701}/ws`;
    }
}
exports.UiController = UiController;

// 工作流引擎核心类
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import NodeRegistry from './NodeRegistry';
import VariableManager from './VariableManager';
import Logger from './Logger';
import SessionRegistry from './SessionRegistry';
import SessionFS from './SessionFS';
import BehaviorRecorder from './BehaviorRecorder';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_HIGHLIGHT = Object.freeze({
  enabled: true,
  persist: true,
  durationMs: 4000,
  anchor: { enabled: true, color: '#34c759', label: 'ANCHOR', persist: true, durationMs: 4000 },
  action: { enabled: true, color: '#ff2d55', label: 'ACTION', persist: false, durationMs: 5000 },
  perNode: {},
});

const deepMerge = (base = {}, patch = {}) => {
  if (!patch || typeof patch !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge(out[key] || {}, value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
};

class WorkflowEngine {
  constructor() {
    this.nodeRegistry = new NodeRegistry();
    this.variableManager = new VariableManager();
    this.logger = new Logger();
    this.browser = null;
    this.context = null;
    this.page = null;
    this.currentState = 'idle';
    this.executionStack = [];
    this.results = {};
    this.behaviorLog = [];
    this.recorder = null;
    this.highlightDefaults = { ...DEFAULT_HIGHLIGHT };

    // Focus manager: unify focus scope + pulse highlight (no scroll by default)
    const self = this;
    this.focus = {
      _current: null, // { scopeSelector, frameCfg, label, color }
      _defaults: { enabled: true, pulseMs: 500, noScroll: true, color: '#34c759', label: 'FOCUS' },
      setFocus(scopeSelector, frameCfg = null, meta = {}) {
        try {
          self.logger.info(`🎯 设置焦点: ${scopeSelector || '(null)'}`);
          this._current = { scopeSelector, frameCfg, ...meta };
        } catch {}
      },
      getFocus() { return this._current; },
      clear() { this._current = null; },
      async pulse(label, color, ms, opts = {}) {
        try {
          const f = this._current; if (!f) return false;
          const page = self.page; if (!page) return false;
          const { highlightInline } = await import('./ContainerResolver.js');
          const usedLabel = label || f.label || this._defaults.label;
          const usedColor = color || f.color || this._defaults.color;
          const usedMs = typeof ms === 'number' ? ms : this._defaults.pulseMs;
          const noScroll = (opts.noScroll !== undefined) ? !!opts.noScroll : this._defaults.noScroll;
          if (!f.frameCfg) {
            return await highlightInline(page, { selector: f.scopeSelector, scopeSelector: null, label: usedLabel, color: usedColor, durationMs: usedMs, noScroll });
          } else {
            // frame-aware inline highlight
            const frames = page.frames();
            let target = null;
            try {
              const cfg = f.frameCfg;
              if (cfg.urlPattern) { const re=new RegExp(cfg.urlPattern); target = frames.find(fr=>re.test(fr.url())); }
              else if (cfg.urlIncludes) { target = frames.find(fr=>fr.url().includes(cfg.urlIncludes)); }
              else if (typeof cfg.index==='number' && frames[cfg.index]) target = frames[cfg.index];
            } catch {}
            target = target || page;
            await target.evaluate((p)=>{
              const el = document.querySelector(p.sel); if(!el) return false;
              if(!p.noScroll){ try{ el.scrollIntoView({behavior:'instant', block:'center'});}catch{} }
              if (!document.getElementById('__waHL_style')){
                const st=document.createElement('style'); st.id='__waHL_style';
                st.textContent = `.wa-hl-inline{ outline:2px solid var(--wa-color,#34c759)!important; outline-offset:2px!important; border-radius:6px!important; position:relative!important; } .wa-hl-inline[data-wa-label]:after{ content: attr(data-wa-label); position:absolute; left:0; top:-18px; background: var(--wa-color,#34c759); color:#fff; padding:1px 6px; border-radius:4px; font:12px -apple-system,system-ui; z-index:2147483647 }`;
                document.head.appendChild(st);
              }
              el.classList.add('wa-hl-inline'); el.style.setProperty('--wa-color', p.color);
              el.setAttribute('data-wa-label', p.label);
              if (p.ms>0) setTimeout(()=>{ try{ el.classList.remove('wa-hl-inline'); el.removeAttribute('data-wa-label'); }catch{} }, p.ms);
              return true;
            }, { sel: f.scopeSelector, label: usedLabel, color: usedColor, ms: usedMs, noScroll });
            return true;
          }
        } catch { return false; }
      }
    };
  }

  applyHighlightDefaults(overrides) {
    if (!overrides) return;
    this.highlightDefaults = deepMerge(this.highlightDefaults, overrides);
  }

  resolveHighlightContext(node) {
    const perNode = this.highlightDefaults.perNode?.[node?.type] || {};
    const merged = deepMerge(
      deepMerge(this.highlightDefaults, perNode),
      node?.config?.highlightOverrides
    );
    if (node?.config?.highlight === false || merged.enabled === false) {
      return {
        ...merged,
        enabled: false,
        anchor: { ...(merged.anchor || {}), enabled: false },
        action: { ...(merged.action || {}), enabled: false },
      };
    }
    return merged;
  }

  async executeWorkflow(workflowConfig, parameters = {}, options = {}) {
        try {
            // 初始化高亮默认配置
            this.highlightDefaults = { ...DEFAULT_HIGHLIGHT };
            this.applyHighlightDefaults(workflowConfig?.highlightDefaults);
            if (parameters?.highlightDefaults) {
                this.applyHighlightDefaults(parameters.highlightDefaults);
            }
            
            this.logger.info(`🚀 开始执行工作流: ${workflowConfig.name}`);
            this.currentState = 'running';
            // 推送 workflow.start 事件
            if (this.recorder) this.recorder.record('workflow.start', { workflow: workflowConfig.name, sessionId, startedAt: new Date().toISOString() });
            this.variableManager.initialize(workflowConfig.variables);
            // 记录工作流名称，便于外部节点输出
            this.variableManager.set('workflowName', workflowConfig.name || 'workflow');

            // 设置参数
            if (workflowConfig.parameters) {
                Object.keys(workflowConfig.parameters).forEach(key => {
                    if (parameters[key] !== undefined) {
                        this.variableManager.set(key, parameters[key]);
                    }
                });
            }

            // 准备会话ID（用于跨工作流共享浏览器上下文）
            const providedSessionId = parameters.sessionId || workflowConfig.sessionId;
            const sessionId = providedSessionId || `sess-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
            this.variableManager.set('sessionId', sessionId);
            // 会话目录
            const sessionDir = SessionFS.ensureSessionDir(sessionId);
            this.variableManager.set('sessionDir', sessionDir);

            // 传入参数（全部写入为变量，便于节点读取，如 debug）
            for (const k of Object.keys(parameters || {})) {
                this.variableManager.set(k, parameters[k]);
            }

            // 行为记录器（传入 publish 回调以广播关键状态）
            this.recorder = new BehaviorRecorder({
              workflow: workflowConfig.name || 'workflow',
              sessionId,
              sessionDir,
              publish: (type: string, data: any) => {
                // 导出到 options.publish 提供者（由调用者 secure 后注入）
                if (typeof options.publish === 'function') {
                  try {
                    options.publish(type, data);
                  } catch {}
                }
              },
            });

            // 开始时间
            this.variableManager.set('startTime', new Date().toISOString());

            // 查找开始节点
            const startNode = workflowConfig.nodes.find(node => node.type === 'StartNode');
            if (!startNode) {
                throw new Error('工作流必须包含一个StartNode');
            }

            // 执行工作流
            await this.executeNode(workflowConfig, startNode, workflowConfig.nodes);

            // 结束时间
            this.variableManager.set('endTime', new Date().toISOString());

            this.logger.info('✅ 工作流执行完成');
            this.currentState = 'completed';
            // 推送 workflow.completed 事件
            if (this.recorder) this.recorder.record('workflow.completed', { workflow: workflowConfig.name, sessionId, finishedAt: endTime });

            return {
                success: true,
                results: this.results,
                variables: this.variableManager.getAll(),
                executionTime: this.calculateExecutionTime()
            };

        } catch (error) {
            const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
            this.logger.error(`❌ 工作流执行失败: ${errorMessage}`);
            this.currentState = 'failed';
            // 推送 workflow.failed 事件
            if (this.recorder) this.recorder.record('workflow.failed', { workflow: workflowConfig.name, sessionId, error: errorMessage, finishedAt: new Date().toISOString() });

            return {
                success: false,
                error: errorMessage,
                results: this.results,
                variables: this.variableManager.getAll()
            };
        }
    }

    async executeNode(workflowConfig, node, allNodes) {
        if (!node) {
            throw new Error('节点参数不能为空');
        }
        this.logger.info(`🔧 执行节点: ${node.name || '未知节点'} (${node.type || '未知类型'})`);

        try {
            // 获取节点处理器
            const nodeHandler = this.nodeRegistry.getNodeHandler(node.type);
            if (!nodeHandler) {
                throw new Error(`未找到节点类型 ${node.type} 的处理器`);
            }

            // 准备节点上下文
            const nodeContext = {
                workflow: workflowConfig,
                node: node,
                config: node.config,
                variables: this.variableManager,
                logger: this.logger,
                browser: this.browser,
                context: this.context,
                page: this.page,
                results: this.results,
                engine: this,
                highlight: this.resolveHighlightContext(node)
            };

            // 执行节点
            const nodeResult = await nodeHandler.execute(nodeContext);

            // 处理节点结果
            if (nodeResult.success) {
                this.logger.info(`✅ 节点 ${node.name || '未知节点'} 执行成功`);

                // 更新变量
                if (nodeResult.variables) {
                    Object.keys(nodeResult.variables).forEach(key => {
                        this.variableManager.set(key, nodeResult.variables[key]);
                    });
                }

                // 更新结果
                if (nodeResult.results) {
                    Object.assign(this.results, nodeResult.results);
                }

                // 更新浏览器实例
                if (nodeResult.browser) {
                    this.browser = nodeResult.browser;
                }
                if (nodeResult.context) {
                    this.context = nodeResult.context;
                }
                if (nodeResult.page) {
                    this.page = nodeResult.page;
                }

                // 执行下一个节点
                if (node.next && node.next.length > 0) {
                    const nextNodeId = node.next[0];
                    const nextNode = allNodes.find(n => n.id === nextNodeId);
                    if (nextNode) {
                        await this.executeNode(workflowConfig, nextNode, allNodes);
                    }
                }

            } else {
                const nodeError = nodeResult && nodeResult.error ? nodeResult.error : '未知错误';
                this.logger.error(`❌ 节点 ${node.name || '未知节点'} 执行失败: ${nodeError}`);

                // 处理错误分支
                if (node && node.error && Array.isArray(node.error) && node.error.length > 0) {
                    const errorNodeId = node.error[0];
                    const errorNode = allNodes.find(n => n.id === errorNodeId);
                    if (errorNode) {
                        await this.executeNode(workflowConfig, errorNode, allNodes);
                    }
                } else {
                    throw new Error(nodeError);
                }
            }

        } catch (error) {
            const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
            this.logger.error(`💥 节点 ${node.name || '未知节点'} 执行异常: ${errorMessage}`);
            throw error;
        }
    }

    // 保存会话到注册表（供后续工作流接力）
  saveSession() {
    const sessionId = this.variableManager.get('sessionId');
    if (!sessionId) return false;
    return SessionRegistry.save(sessionId, {
      browser: this.browser,
      context: this.context,
      page: this.page
    });
  }

    // 附着已有会话（可供 AttachSessionNode 调用）
  attachSession(sessionId) {
    const s = SessionRegistry.get(sessionId);
    if (!s) return false;
    this.browser = s.browser;
    this.context = s.context;
    this.page = s.page;
    return true;
  }

  // 行为记录（供节点调用）
  recordBehavior(type, data = {}) {
    try {
      if (this.recorder) this.recorder.record(type, data);
      this.behaviorLog.push({ ts: Date.now(), type, data });
    } catch {}
  }

  getBehaviorLog() { return this.behaviorLog.slice(); }

    calculateExecutionTime() {
        const startTime = this.variableManager.get('startTime');
        const endTime = this.variableManager.get('endTime');

        if (startTime && endTime) {
            return new Date(endTime) - new Date(startTime);
        }
        return 0;
    }

    getStatus() {
        return {
            state: this.currentState,
            variables: this.variableManager.getAll(),
            results: this.results,
            executionTime: this.calculateExecutionTime()
        };
    }
}

export default WorkflowEngine;

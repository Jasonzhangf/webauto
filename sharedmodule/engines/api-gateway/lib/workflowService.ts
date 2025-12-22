// @ts-nocheck
import { readFileSync, existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

function forceEndNodePolicy(cfg) {
  try {
    if (!cfg || !cfg.nodes || !Array.isArray(cfg.nodes)) return cfg;
    for (const n of cfg.nodes) {
      if (n.type === 'EndNode') {
        n.config = {
          ...(n.config || {}),
          persistSession: true,
          cleanup: false,
          cleanupHighlights: n.config?.cleanupHighlights ?? true,
        };
      }
    }
  } catch {}
  return cfg;
}

function loadWorkflowFromPath(pathLike) {
  const abs = isAbsolute(pathLike) ? pathLike : join(process.cwd(), pathLike);
  if (!existsSync(abs)) throw new Error(`workflow not found: ${abs}`);
  const raw = readFileSync(abs, 'utf8');
  const cfg = JSON.parse(raw);
  return { abs, cfg };
}

export async function runWorkflowService({ workflowPath, workflowConfig, parameters = {}, sessionId, options = {} }) {
  let WorkflowRunner: any = null;
  const p1 = `${process.cwd()}/apps/webauto/core/workflow/WorkflowRunner.js`;
  const p2 = `${process.cwd()}/src/core/workflow/WorkflowRunner.js`;
  try {
    WorkflowRunner = (await import(p1)).default;
  } catch {
    WorkflowRunner = (await import(p2)).default;
  }
  const runner = new WorkflowRunner();
  if (!WorkflowRunner) {
    throw new Error('WorkflowRunner not found');
  }
  let cfg;
  let usedPath = null;

  if (workflowPath) {
    const loaded = loadWorkflowFromPath(workflowPath);
    cfg = loaded.cfg;
    usedPath = loaded.abs;
  } else if (workflowConfig) {
    cfg = workflowConfig;
  } else {
    throw new Error('workflowPath or workflowConfig is required');
  }

  if (options.forceNoCleanup !== false) cfg = forceEndNodePolicy(cfg);

  const params = { ...(parameters || {}) };
  if (sessionId) params.sessionId = sessionId;
  if (options.skipPreflows) params.skipPreflows = true;

  // 注入统一事件发布钩子：由 engine.runWorkflow 接收并透传 BehaviorRecorder
  const broadcast = (type: string, data: any) => {
    const topic = type.startsWith('workflow.') || type.startsWith('handshake.') ? type : `workflow.event.${type}`;
    try {
      // 通过 unified-api 公开接口广播，安全隔离，不抛出
      const controller = (global as any).__workflowPublishedController;
      controller?.publishEvent?.(topic, data);
    } catch {}
  };
  params.publish = broadcast;

  const result = await runner.runWorkflow(usedPath || 'inline', params);
  try { runner.engine?.saveSession?.(); } catch {}

  return result;
}


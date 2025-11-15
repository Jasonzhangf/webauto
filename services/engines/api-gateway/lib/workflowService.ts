// @ts-nocheck
import { readFileSync, existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

function forceEndNodePolicy(cfg: any) {
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

function loadWorkflowFromPath(pathLike: string) {
  const abs = isAbsolute(pathLike) ? pathLike : join(process.cwd(), pathLike);
  if (!existsSync(abs)) throw new Error(`workflow not found: ${abs}`);
  const raw = readFileSync(abs, 'utf8');
  const cfg = JSON.parse(raw);
  return { abs, cfg };
}

export async function runWorkflowService({ workflowPath, workflowConfig, parameters = {}, sessionId, options = {} }: any) {
  // Prefer apps/webauto path; fallback to legacy src
  let WorkflowRunnerMod: any = null;
  const p1 = `${process.cwd()}/apps/webauto/core/workflow/WorkflowRunner.js`;
  const p2 = `${process.cwd()}/src/core/workflow/WorkflowRunner.js`;
  try {
    WorkflowRunnerMod = (await import(p1)).default;
  } catch {
    WorkflowRunnerMod = (await import(p2)).default;
  }
  const runner = new WorkflowRunnerMod();

  let cfg: any;
  let usedPath: string | null = null;

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

  const params: any = { ...(parameters || {}) };
  if (sessionId) params.sessionId = sessionId;
  if (options.skipPreflows) params.skipPreflows = true;

  const result = await runner.runWorkflow(usedPath || 'inline', params);
  try { runner.engine?.saveSession?.(); } catch {}
  return result;
}


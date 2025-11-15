// @ts-nocheck
import { runWorkflowService } from '../lib/workflowService.js';

export async function switchRun(req, res) {
  try {
    let { workflowPath, sessionId, maxHops = 3, parameters = {}, options = {} } = req.body || {};
    if (!workflowPath) return res.status(400).json({ success:false, error:'workflowPath required' });
    const hops = [];
    for (let i=0; i<Math.max(1, Math.min(10, Number(maxHops))); i++) {
      const out = await runWorkflowService({ workflowPath, parameters, sessionId, options });
      hops.push({ workflowPath, success: out?.success, error: out?.error, record: out?.record, variables: out?.variables });
      if (!(out && out.variables && out.variables.switchToWorkflow)) break;
      workflowPath = out.variables.switchToWorkflow;
      sessionId = out.variables.sessionId || sessionId;
    }
    return res.json({ success: true, hops });
  } catch (e) {
    return res.status(500).json({ success:false, error: e.message });
  }
}


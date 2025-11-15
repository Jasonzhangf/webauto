// @ts-nocheck
import { submit, status as jobStatus } from '../lib/jobManager.js';
import { runWorkflowService } from '../lib/workflowService.js';

export async function submitWorkflow(req, res) {
  try {
    const payload = req.body || {};
    const id = submit('workflow', async (p)=> await runWorkflowService(p), payload);
    return res.json({ success:true, jobId: id });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function status(req, res) {
  const id = req.params?.id;
  if (!id) return res.status(400).json({ success:false, error:'id required' });
  try { const r = jobStatus(id); return res.json(r); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}


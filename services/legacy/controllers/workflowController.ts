// @ts-nocheck
import { runWorkflowService } from '../lib/workflowService.js';
import { listSessions } from '../lib/sessionAdapter.js';

const lastStatus = new Map(); // sessionId -> status snapshot

export async function run(req, res) {
  try {
    const { workflowPath, workflowConfig, parameters, sessionId, options } = req.body || {};
    const result = await runWorkflowService({ workflowPath, workflowConfig, parameters, sessionId, options });
    const usedSessionId = (parameters?.sessionId) || sessionId || result?.variables?.sessionId;
    if (usedSessionId) {
      lastStatus.set(usedSessionId, {
        state: result?.success ? 'completed' : 'failed',
        variables: result?.variables || {},
        results: result?.results || {},
        executionTime: result?.executionTime || 0
      });
    }
    return res.json({ success: true, ...result });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function status(req, res) {
  const sessionId = req.params?.sessionId;
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  const s = lastStatus.get(sessionId);
  if (!s) return res.json({ success: true, state: 'unknown', variables: {}, results: {}, executionTime: 0 });
  return res.json({ success: true, ...s });
}

export async function health(req, res) {
  try {
    const sessions = await listSessions();
    return res.json({ status: 'ok', uptime: process.uptime()*1000 | 0, sessions, running: true });
  } catch (e) {
    return res.status(500).json({ status: 'error', error: e.message, running: false });
  }
}


// @ts-nocheck
import { saveSession, getSession, hasSession, closeSession, listSessions as list } from '../lib/sessionAdapter.js';

export async function listSessions(req, res) {
  try {
    const r = await list();
    return res.json({ success: true, sessions: r });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function start(req, res) {
  try {
    const { sessionId, payload } = req.body || {};
    await saveSession(sessionId, payload || {});
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function close(req, res) {
  try {
    const { sessionId } = req.body || {};
    await closeSession(sessionId);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}


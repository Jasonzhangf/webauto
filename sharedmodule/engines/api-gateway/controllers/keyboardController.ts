// @ts-nocheck
import { getPageBySession } from '../lib/sessionUtils.js';

export async function type(req, res) {
  const { sessionId, text, delay = 0 } = req.body || {};
  if (!sessionId || typeof text !== 'string') return res.status(400).json({ success:false, error:'sessionId and text required' });
  try { const { page } = await getPageBySession(sessionId); await page.keyboard.type(text, { delay }); return res.json({ success:true }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function press(req, res) {
  const { sessionId, key, delay = 0 } = req.body || {};
  if (!sessionId || !key) return res.status(400).json({ success:false, error:'sessionId and key required' });
  try { const { page } = await getPageBySession(sessionId); await page.keyboard.press(key, { delay }); return res.json({ success:true }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function down(req, res) {
  const { sessionId, key } = req.body || {};
  if (!sessionId || !key) return res.status(400).json({ success:false, error:'sessionId and key required' });
  try { const { page } = await getPageBySession(sessionId); await page.keyboard.down(key); return res.json({ success:true }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function up(req, res) {
  const { sessionId, key } = req.body || {};
  if (!sessionId || !key) return res.status(400).json({ success:false, error:'sessionId and key required' });
  try { const { page } = await getPageBySession(sessionId); await page.keyboard.up(key); return res.json({ success:true }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}


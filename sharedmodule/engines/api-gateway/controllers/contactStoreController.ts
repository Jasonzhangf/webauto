// @ts-nocheck
import { list1688, has1688, add1688, remove1688, clear1688 } from '../../../src/core/workflow/ContactStore.js';

export async function list(req, res) {
  try { const items = list1688(); return res.json({ success:true, items }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function check(req, res) {
  const { key, uid, offerId, chatUrl } = req.body || {};
  try { const exists = has1688({ key, uid, offerId, chatUrl }); return res.json({ success:true, exists }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function add(req, res) {
  const { key, uid, offerId, chatUrl, extra } = req.body || {};
  try { const rec = add1688({ key, uid, offerId, chatUrl, extra }); return res.json({ success:true, record: rec }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function remove(req, res) {
  const { key, uid, offerId, chatUrl } = req.body || {};
  try { const ok = remove1688({ key, uid, offerId, chatUrl }); return res.json({ success: ok }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function clear(req, res) {
  try { clear1688(); return res.json({ success:true }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}


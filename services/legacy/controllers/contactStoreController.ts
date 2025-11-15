// @ts-nocheck
async function mod(){ return await import(`${process.cwd()}/src/core/workflow/ContactStore.mjs`); }

export async function list(req, res) {
  try { const { list1688 } = await mod(); const items = list1688(); return res.json({ success:true, items }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function check(req, res) {
  const { key, uid, offerId, chatUrl } = req.body || {};
  try { const { has1688 } = await mod(); const exists = has1688({ key, uid, offerId, chatUrl }); return res.json({ success:true, exists }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function add(req, res) {
  const { key, uid, offerId, chatUrl, extra } = req.body || {};
  try { const { add1688 } = await mod(); const rec = add1688({ key, uid, offerId, chatUrl, extra }); return res.json({ success:true, record: rec }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function remove(req, res) {
  const { key, uid, offerId, chatUrl } = req.body || {};
  try { const { remove1688 } = await mod(); const ok = remove1688({ key, uid, offerId, chatUrl }); return res.json({ success: ok }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function clear(req, res) {
  try { const { clear1688 } = await mod(); clear1688(); return res.json({ success:true }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

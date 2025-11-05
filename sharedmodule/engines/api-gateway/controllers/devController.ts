// @ts-nocheck
import { getSession } from '../lib/sessionAdapter.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

async function getPage(sessionId) {
  const s = await getSession(sessionId);
  if (!s) throw new Error('session not found');
  let page = s.page;
  if (!(page && typeof page.evaluate === 'function')) {
    const pages = typeof s.context?.pages === 'function' ? s.context.pages() : [];
    if (pages && pages.length) page = pages[pages.length - 1];
  }
  if (!page) throw new Error('page not available');
  return page;
}

function resolveFrame(page, frame) {
  try {
    if (!frame) return page;
    const frames = page.frames();
    if (frame.urlPattern) { const re=new RegExp(frame.urlPattern); const f=frames.find(fr=>re.test(fr.url())); if (f) return f; }
    if (frame.urlIncludes) { const f=frames.find(fr=>fr.url().includes(frame.urlIncludes)); if (f) return f; }
    if (typeof frame.index==='number' && frames[frame.index]) return frames[frame.index];
  } catch {}
  return page;
}

export async function evalFile(req, res) {
  const { sessionId, filePath, frame } = req.body || {};
  if (!sessionId || !filePath) return res.status(400).json({ success:false, error:'sessionId and filePath required' });
  try {
    const page = await getPage(sessionId);
    const target = resolveFrame(page, frame);
    const abs = filePath.startsWith('.') || filePath.startsWith('/') ? join(process.cwd(), filePath) : join(process.cwd(), filePath);
    if (!existsSync(abs)) return res.status(404).json({ success:false, error:'file not found' });
    const script = readFileSync(abs,'utf8');
    const value = await target.evaluate((code)=>{ try{ var fn=new Function(code); return { ok:true, val: fn() }; }catch(e){ return { ok:false, err: String(e) }; } }, script);
    if (!value.ok) return res.status(500).json({ success:false, error:value.err });
    return res.json({ success:true, value:value.val });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function evalCode(req, res) {
  const { sessionId, code, frame } = req.body || {};
  if (!sessionId || !code) return res.status(400).json({ success:false, error:'sessionId and code required' });
  try {
    const page = await getPage(sessionId);
    const target = resolveFrame(page, frame);
    const value = await target.evaluate((src)=>{ try{ var fn=new Function(src); return { ok:true, val: fn() }; }catch(e){ return { ok:false, err:String(e) }; } }, code);
    if (!value.ok) return res.status(500).json({ success:false, error:value.err });
    return res.json({ success:true, value:value.val });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function installPicker(req, res) {
  const { sessionId, frame } = req.body || {};
  if (!sessionId) return res.status(400).json({ success:false, error:'sessionId required' });
  try {
    const page = await getPage(sessionId);
    const target = resolveFrame(page, frame);
    const scriptPath = join(process.cwd(), 'local-dev', 'element-picker.js');
    if (!existsSync(scriptPath)) return res.status(404).json({ success:false, error:'picker script missing' });
    const code = readFileSync(scriptPath,'utf8');
    const value = await target.evaluate((src)=>{ try{ var fn=new Function(src); return { ok:true, val: fn() }; }catch(e){ return { ok:false, err:String(e) }; } }, code);
    if (!value.ok) return res.status(500).json({ success:false, error:value.err });
    return res.json({ success:true, value:value.val });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}


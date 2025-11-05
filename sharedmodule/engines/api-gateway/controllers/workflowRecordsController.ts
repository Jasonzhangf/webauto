// @ts-nocheck
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export async function list(req, res) {
  try {
    const dir = join(process.cwd(), 'archive', 'workflow-records');
    let files = [];
    try { files = readdirSync(dir).filter(f=>f.endsWith('.json')); } catch {}
    files.sort((a,b)=> statSync(join(dir,b)).mtime - statSync(join(dir,a)).mtime);
    const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 50)));
    const items = files.slice(0, limit).map(f=>{
      try { const j = JSON.parse(readFileSync(join(dir,f), 'utf8')); return { file: f, name: j?.name, success: j?.success, error: j?.error, startedAt: j?.startedAt, finishedAt: j?.finishedAt, sessionId: j?.variables?.sessionId || j?.parameters?.sessionId || null }; } catch { return { file: f }; }
    });
    return res.json({ success:true, records: items });
  } catch (e) { return res.status(500).json({ success:false, error: e.message }); }
}


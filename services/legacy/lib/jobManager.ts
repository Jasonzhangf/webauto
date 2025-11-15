// @ts-nocheck
let _id = 0;
const jobs = new Map(); // id -> { status, startedAt, finishedAt, kind, payload, result }

export function submit(kind, handler, payload) {
  const id = `job-${Date.now()}-${++_id}`;
  const rec = { id, status: 'queued', startedAt: Date.now(), finishedAt: null, kind, payload: payload || null, result: null };
  jobs.set(id, rec);
  (async () => {
    rec.status = 'running';
    try {
      const out = await handler(payload);
      rec.result = out; rec.status = 'completed'; rec.finishedAt = Date.now();
    } catch (e) {
      rec.result = { success:false, error: e?.message || String(e) }; rec.status = 'failed'; rec.finishedAt = Date.now();
    }
  })();
  return id;
}

export function status(id) {
  const rec = jobs.get(id);
  if (!rec) return { success:false, error: 'job not found' };
  return { success:true, job: rec };
}


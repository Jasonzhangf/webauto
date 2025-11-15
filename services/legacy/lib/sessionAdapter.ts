// @ts-nocheck
let _regPromise = null;
async function getRegistry() {
  if (!_regPromise) {
    const p1 = `${process.cwd()}/apps/webauto/core/workflow/SessionRegistry.js`;
    const p2 = `${process.cwd()}/src/core/workflow/SessionRegistry.js`;
    _regPromise = import(p1).then(m => m.default).catch(async () => (await import(p2)).default);
  }
  return _regPromise;
}

export async function saveSession(sessionId, payload) {
  const r = await getRegistry();
  return r.save(sessionId, payload);
}

export async function getSession(sessionId) {
  const r = await getRegistry();
  return r.get(sessionId);
}

export async function hasSession(sessionId) {
  const r = await getRegistry();
  return r.has(sessionId);
}

export async function closeSession(sessionId) {
  const r = await getRegistry();
  return await r.close(sessionId);
}

export async function listSessions() {
  const r = await getRegistry();
  return r.list();
}

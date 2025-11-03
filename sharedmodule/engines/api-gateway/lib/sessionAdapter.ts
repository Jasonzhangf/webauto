// @ts-nocheck
let _regPromise = null;
async function getRegistry() {
  if (!_regPromise) {
    _regPromise = import(`${process.cwd()}/src/core/workflow/SessionRegistry.js`).then(m => m.default);
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


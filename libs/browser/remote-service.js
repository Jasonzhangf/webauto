/**
 * 浏览器远程控制服务（HTTP + SSE）
 * - 默认端口可通过 env PORT_BROWSER 或传参覆盖
 * - 提供基本命令：start, newPage, goto, getCookies, saveCookies, loadCookies, getStatus, switchControl, close
 * - 提供 /events SSE 事件流，推送浏览器状态变化
 */

import http from 'http';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { loadBrowserServiceConfig } from './browser-service-config.js';

const clients = new Set();
const sessions = new Map(); // profileId -> sessionId
const autoLoops = new Map(); // sessionId -> { timer, lastHost, running }

function backendBase() {
    const cfg = loadBrowserServiceConfig();
    const base = cfg.backend && cfg.backend.baseUrl ? cfg.backend.baseUrl : 'http://127.0.0.1:7701';
    return base.replace(/\/$/,'');
}

async function backend(path, method = 'GET', body = undefined) {
    const url = backendBase() + path;
    const opts = { method, headers: { 'content-type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text}`);
    try { return JSON.parse(text); } catch { return { ok: true, raw: text }; }
}

function sendEvent(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
        try { res.write(payload); } catch (_) {}
    }
}

function json(res, status, body) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    });
    res.end(data);
}

async function handleCommand(req, res) {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', async () => {
        try {
            const { action, args = {} } = raw ? JSON.parse(raw) : { action: null, args: {} };
            if (!action) return json(res, 400, { error: 'missing action' });

            switch (action) {
                case 'start': {
                    const { headless = false, profileId = 'default', persistSession = true, url } = args;
                    try {
                        const payload = { headless, profileId, persistSession, url: url || undefined };
                        const out = await backend('/v1/browser/session/launch', 'POST', payload);
                        const sessionId = out?.sessionId || out?.id || null;
                        if (sessionId) sessions.set(profileId, sessionId);
                        sendEvent('browser:started', { profileId, headless, sessionId });
                        return json(res, 200, { ok: true, sessionId, profileId });
                    } catch (e) {
                        return json(res, 500, { error: String(e?.message || e) });
                    }
                }
                case 'newPage': {
                    // 由后端会话驱动，这里不单独创建页面
                    return json(res, 501, { error: 'newPage not supported at proxy level' });
                }
                case 'goto': {
                    const { url, profileId = 'default' } = args;
                    if (!url) return json(res, 400, { error: 'url required' });
                    const sessionId = sessions.get(profileId);
                    if (!sessionId) return json(res, 400, { error: 'session not started' });
                    try {
                        const payload = { sessionId, url };
                        const out = await backend('/v1/browser/navigate', 'POST', payload);
                        sendEvent('page:navigated', { url, sessionId });
                        return json(res, 200, { ok: true, info: out || { url } });
                    } catch (e) {
                        return json(res, 500, { error: String(e?.message || e) });
                    }
                }
                case 'getCookies': {
                    const { profileId = 'default' } = args || {};
                    const sessionId = sessions.get(profileId);
                    if (!sessionId) return json(res, 400, { error: 'session not started' });
                    try {
                        const out = await backend('/v1/browser/cookies/list', 'GET');
                        return json(res, 200, { ok: true, ...(out || {}) });
                    } catch (e) {
                        return json(res, 500, { error: String(e?.message || e) });
                    }
                }
                case 'saveCookies': {
                    const { path, profileId = 'default' } = args;
                    if (!path) return json(res, 400, { error: 'path required' });
                    const sessionId = sessions.get(profileId);
                    if (!sessionId) return json(res, 400, { error: 'session not started' });
                    try {
                        const out = await backend('/v1/browser/cookies/save', 'POST', { path, sessionId });
                        sendEvent('cookies:saved', { path });
                        return json(res, 200, { ok: true, ...(out || {}) });
                    } catch (e) {
                        return json(res, 500, { error: String(e?.message || e) });
                    }
                }
                case 'loadCookies': {
                    const { path, profileId = 'default' } = args;
                    if (!path) return json(res, 400, { error: 'path required' });
                    const sessionId = sessions.get(profileId);
                    if (!sessionId) return json(res, 400, { error: 'session not started' });
                    try {
                        const out = await backend('/v1/browser/cookies/inject', 'POST', { path, sessionId });
                        sendEvent('cookies:loaded', { path });
                        return json(res, 200, { ok: true, ...(out || {}) });
                    } catch (e) {
                        return json(res, 500, { error: String(e?.message || e) });
                    }
                }
                case 'getStatus': {
                    const autos = {};
                    for (const [sid, info] of autoLoops.entries()) autos[sid] = { running: !!info?.running, lastHost: info?.lastHost || null };
                    return json(res, 200, { ok: true, status: { sessions: Array.from(sessions.entries()), autoCookies: autos } });
                }
                case 'switchControl': {
                    // 直接代理功能暂不支持
                    return json(res, 501, { error: 'not supported' });
                }
                case 'screenshot': {
                    const { fullPage = true, profileId = 'default' } = args;
                    const sessionId = sessions.get(profileId);
                    if (!sessionId) return json(res, 400, { error: 'session not started' });
                    try {
                        const out = await backend('/v1/browser/screenshot', 'POST', { sessionId, fullPage });
                        return json(res, 200, { ok: true, ...(out || {}) });
                    } catch (e) {
                        return json(res, 500, { error: String(e?.message || e) });
                    }
                }
                case 'autoCookies:start': {
                    const { profileId = 'default', intervalMs = 2500 } = args || {};
                    const sessionId = sessions.get(profileId);
                    if (!sessionId) return json(res, 400, { error: 'session not started' });
                    startAutoCookieLoop(sessionId, intervalMs);
                    return json(res, 200, { ok: true, sessionId });
                }
                case 'autoCookies:stop': {
                    const { profileId = 'default' } = args || {};
                    const sessionId = sessions.get(profileId);
                    if (!sessionId) return json(res, 400, { error: 'session not started' });
                    stopAutoCookieLoop(sessionId);
                    return json(res, 200, { ok: true, sessionId });
                }
                case 'autoCookies:status': {
                    const { profileId = 'default' } = args || {};
                    const sessionId = sessions.get(profileId);
                    const loop = sessionId ? autoLoops.get(sessionId) : null;
                    return json(res, 200, { ok: true, sessionId: sessionId || null, running: !!loop?.running, lastHost: loop?.lastHost || null });
                }
                default:
                    return json(res, 400, { error: `unknown action: ${action}` });
            }
        } catch (e) {
            return json(res, 500, { error: e.message });
        }
    });
}

export function startBrowserService(options = {}) {
    const cfg = loadBrowserServiceConfig();
    const listenPort = Number(options.port || process.env.PORT_BROWSER || cfg.port || 7704);
    const listenHost = String(options.host || cfg.host || '0.0.0.0');

    const server = http.createServer(async (req, res) => {
        const { pathname } = new URL(req.url, `http://${req.headers.host}`);
        
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            return res.end();
        }
        
        if (pathname === '/health') {
            const status = { sessions: Array.from(sessions.entries()) };
            return json(res, 200, { ok: true, status });
        }
        
        if (pathname === '/events') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            clients.add(res);
            res.on('close', () => clients.delete(res));
            
            // 初始事件
            sendEvent('service:connected', { time: Date.now() });
            return;
        }

        if (req.method === 'POST' && pathname === '/command') {
            return handleCommand(req, res);
        }

        return json(res, 404, { error: 'not found' });
    });

    server.listen(listenPort, listenHost);
    return { server, port: listenPort, host: listenHost };
}

// ---------- Auto Cookie Loop ----------
function eTLDPlusOne(host) {
    try {
        const parts = String(host||'').toLowerCase().split('.').filter(Boolean);
        if (parts.length >= 2) return parts.slice(-2).join('.');
        return host || '';
    } catch { return host || ''; }
}

function cookieCandidatesForHost(host) {
    const baseDir = join(homedir(), '.webauto', 'cookies');
    const files = [];
    if (!host) return { baseDir, files };
    const etld = eTLDPlusOne(host);
    files.push(join(baseDir, `${host}.json`));
    if (etld && etld !== host) files.push(join(baseDir, `${etld}.json`));
    if (host.includes('weibo.com')) files.push(join(baseDir, 'weibo-domestic.json'));
    if (host.includes('1688.com')) files.push(join(baseDir, '1688-domestic.json'));
    return { baseDir, files };
}

async function injectExistingCookies(sessionId, host) {
    const { files } = cookieCandidatesForHost(host);
    for (const f of files) {
        try {
            if (existsSync(f)) await backend('/v1/browser/cookies/inject', 'POST', { sessionId, path: f });
        } catch {}
    }
}

async function saveCurrentCookies(sessionId, host) {
    const { baseDir, files } = cookieCandidatesForHost(host);
    try { mkdirSync(baseDir, { recursive: true }); } catch {}
    for (const f of files) {
        try { await backend('/v1/browser/cookies/save', 'POST', { sessionId, path: f }); } catch {}
    }
}

function startAutoCookieLoop(sessionId, intervalMs = 2500) {
    const info = autoLoops.get(sessionId) || { running: false, lastHost: null, timer: null };
    if (info.running) return;
    info.running = true;
    info.timer = setInterval(async () => {
        try {
            const r = await backend('/v1/browser/url', 'GET');
            const url = (r?.url) || '';
            const host = (()=>{ try { return new URL(url).hostname; } catch { return ''; }})();
            if (!host) return;
            if (host !== info.lastHost) {
                // domain changed: inject candidate cookies first
                await injectExistingCookies(sessionId, host);
                info.lastHost = host;
            }
            // then save current cookies snapshot periodically
            await saveCurrentCookies(sessionId, host);
        } catch {}
    }, Math.max(1000, Number(intervalMs||0)));
    autoLoops.set(sessionId, info);
}

function stopAutoCookieLoop(sessionId) {
    const info = autoLoops.get(sessionId);
    if (!info) return;
    try { clearInterval(info.timer); } catch {}
    autoLoops.delete(sessionId);
}

// 直接运行文件则启动服务（支持 CLI 覆盖）
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const idxPort = args.indexOf('--port');
    const idxHost = args.indexOf('--host');
    const cli = {};
    if (idxPort !== -1) cli.port = Number(args[idxPort + 1]);
    if (idxHost !== -1) cli.host = String(args[idxHost + 1]);
    const { port, host } = startBrowserService(cli);
    // 输出简单提示
    console.log(`Browser service listening on http://${host}:${port}`);
}

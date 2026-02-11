#!/usr/bin/env node
/**
 * Core Daemon - Single service for all infrastructure
 * Port: 7700
 */
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 7700;
const HOME = process.env.HOME || '/Users/fanzhang';

// State
const state = {
  profiles: {},
  searchGate: {}
};

// Load allowed profiles
let ALLOWED_PROFILES = ['xiaohongshu_batch-1', 'xiaohongshu_batch-2'];
try {
  const configPath = path.join(process.cwd(), 'scripts/xiaohongshu/lib/allowed-profiles.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  ALLOWED_PROFILES = config.allowedProfiles || ALLOWED_PROFILES;
} catch {}

// Initialize profiles
ALLOWED_PROFILES.forEach(id => {
  state.profiles[id] = { status: 'available', allocatedTo: null, lastHeartbeat: null };
});

// Validate cookie
async function validateCookie(profileId) {
  try {
    const cookiePath = path.join(HOME, '.webauto/cookies', `${profileId}.json`);
    const data = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
    return !data.url?.includes('login');
  } catch { return false; }
}

// Routes
const routes = {
  '/health': () => ({
    ok: true,
    service: 'core-daemon',
    modules: ['unified-api', 'browser', 'search-gate', 'profile-gate'],
    profiles: {
      total: ALLOWED_PROFILES.length,
      available: ALLOWED_PROFILES.filter(id => state.profiles[id]?.status === 'available').length
    }
  }),

  'POST /profile/request': async (req, res, body) => {
    const { taskId } = body;
    const available = ALLOWED_PROFILES.find(id => state.profiles[id]?.status === 'available');
    if (!available) return { error: 'No profile available', code: 503 };
    
    if (!(await validateCookie(available))) {
      state.profiles[available].status = 'invalid';
      return { error: `Profile ${available} cookie invalid`, code: 503 };
    }
    
    state.profiles[available] = { status: 'allocated', allocatedTo: taskId, lastHeartbeat: Date.now() };
    return { profile: available, token: `${available}-${Date.now()}`, expiresAt: Date.now() + 300000 };
  },

  'POST /profile/release': (req, res, body) => {
    const { profile } = body;
    if (ALLOWED_PROFILES.includes(profile)) {
      state.profiles[profile] = { status: 'available', allocatedTo: null, lastHeartbeat: null };
    }
    return { released: profile };
  },

  'POST /profile/heartbeat': (req, res, body) => {
    const { profile } = body;
    if (state.profiles[profile]?.status === 'allocated') {
      state.profiles[profile].lastHeartbeat = Date.now();
      return { ok: true };
    }
    return { error: 'Not allocated', code: 410 };
  },

  '/profile/list': () => ({ allowed: ALLOWED_PROFILES, state: state.profiles }),

  'POST /search/check': (req, res, body) => {
    const { keyword, profile } = body;
    const key = `${profile}:${keyword}`;
    const now = Date.now();
    const WINDOW = 60000, MAX = 2;
    
    if (!state.searchGate[key]) state.searchGate[key] = [];
    state.searchGate[key] = state.searchGate[key].filter(ts => now - ts < WINDOW);
    
    if (state.searchGate[key].length >= MAX) {
      return { allowed: false, retryAfter: Math.ceil((WINDOW - (now - state.searchGate[key][0])) / 1000) };
    }
    state.searchGate[key].push(now);
    return { allowed: true, remaining: MAX - state.searchGate[key].length };
  }
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const key = `${req.method} ${url.pathname}`;
  const route = routes[key] || routes[url.pathname];
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (!route) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
  
  try {
    let body = {};
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    }
    const result = await route(req, res, body);
    const code = result.code || 200;
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
  }
}).listen(PORT, () => console.log(`[CoreDaemon] Port ${PORT}`));

// Auto-cleanup
setInterval(() => {
  const now = Date.now();
  ALLOWED_PROFILES.forEach(id => {
    const p = state.profiles[id];
    if (p?.status === 'allocated' && now - p.lastHeartbeat > 120000) {
      console.log(`[CoreDaemon] Auto-release: ${id}`);
      state.profiles[id] = { status: 'available', allocatedTo: null, lastHeartbeat: null };
    }
  });
}, 30000);

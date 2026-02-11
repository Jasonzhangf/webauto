#!/usr/bin/env node
/**
 * Unified Gate Service
 * Combines: SearchGate + ProfileGate + RateLimiter
 * Port: 7800
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 7800;
const STATE_FILE = path.join(process.env.HOME, '.webauto', 'unified-gate-state.json');

// Load allowed profiles
let ALLOWED_PROFILES = ['xiaohongshu_batch-1', 'xiaohongshu_batch-2'];
try {
  const profilesPath = path.join(process.cwd(), 'scripts/xiaohongshu/lib/allowed-profiles.json');
  const profilesConfig = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
  ALLOWED_PROFILES = profilesConfig.allowedProfiles || ALLOWED_PROFILES;
} catch (e) {
  console.log('[UnifiedGate] Using default allowed profiles');
}

// State management
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {
      profiles: {},
      searchGate: {},
      rateLimits: {}
    };
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[UnifiedGate] Failed to save state:', e.message);
  }
}

let state = loadState();

// Initialize profiles
ALLOWED_PROFILES.forEach(profileId => {
  if (!state.profiles[profileId]) {
    state.profiles[profileId] = {
      status: 'available', // available, allocated, checking, invalid
      allocatedTo: null,
      allocatedAt: null,
      lastHeartbeat: null,
      cookieValid: null
    };
  }
});

// Cookie validation
async function validateCookie(profileId) {
  const cookiePath = path.join(process.env.HOME, '.webauto', 'cookies', `${profileId}.json`);
  try {
    const cookieData = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
    // Check if URL indicates logged-in state
    const isLoggedIn = !cookieData.url?.includes('login');
    return {
      valid: isLoggedIn,
      url: cookieData.url,
      timestamp: cookieData.timestamp
    };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// HTTP handlers
const handlers = {
  // ProfileGate: Request a profile
  async '/profile/request'(req, res, body) {
    const { taskId, timeout = 30000 } = body;
    
    // Find available profile
    const availableProfile = ALLOWED_PROFILES.find(id => 
      state.profiles[id]?.status === 'available'
    );
    
    if (!availableProfile) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return { error: 'No profile available', queue: true, retryAfter: 5 };
    }
    
    // Validate cookie first
    const validation = await validateCookie(availableProfile);
    if (!validation.valid) {
      state.profiles[availableProfile].status = 'invalid';
      saveState(state);
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return { error: `Profile ${availableProfile} cookie invalid`, profile: availableProfile };
    }
    
    // Allocate profile
    state.profiles[availableProfile] = {
      status: 'allocated',
      allocatedTo: taskId,
      allocatedAt: Date.now(),
      lastHeartbeat: Date.now(),
      cookieValid: true
    };
    saveState(state);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return {
      profile: availableProfile,
      token: `${availableProfile}-${Date.now()}`,
      expiresAt: Date.now() + 300000 // 5 min default
    };
  },

  // ProfileGate: Release a profile
  async '/profile/release'(req, res, body) {
    const { profile, token } = body;
    
    if (!ALLOWED_PROFILES.includes(profile)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return { error: 'Invalid profile' };
    }
    
    state.profiles[profile] = {
      status: 'available',
      allocatedTo: null,
      allocatedAt: null,
      lastHeartbeat: null,
      cookieValid: null
    };
    saveState(state);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return { released: profile };
  },

  // ProfileGate: Heartbeat
  async '/profile/heartbeat'(req, res, body) {
    const { profile, token } = body;
    
    if (state.profiles[profile]?.status === 'allocated') {
      state.profiles[profile].lastHeartbeat = Date.now();
      saveState(state);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return { ok: true, profile };
    }
    
    res.writeHead(410, { 'Content-Type': 'application/json' });
    return { error: 'Profile not allocated or expired' };
  },

  // ProfileGate: List profiles
  async '/profile/list'(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return {
      allowed: ALLOWED_PROFILES,
      state: state.profiles
    };
  },

  // SearchGate: Check search permission
  async '/search/check'(req, res, body) {
    const { keyword, profile } = body;
    const windowKey = `${profile}:${keyword}`;
    const now = Date.now();
    const WINDOW_MS = 60000; // 60s
    const MAX_PER_WINDOW = 2;
    
    if (!state.searchGate[windowKey]) {
      state.searchGate[windowKey] = [];
    }
    
    // Clean old entries
    state.searchGate[windowKey] = state.searchGate[windowKey].filter(
      ts => now - ts < WINDOW_MS
    );
    
    if (state.searchGate[windowKey].length >= MAX_PER_WINDOW) {
      const retryAfter = Math.ceil((WINDOW_MS - (now - state.searchGate[windowKey][0])) / 1000);
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return { allowed: false, retryAfter, reason: 'rate_limited' };
    }
    
    state.searchGate[windowKey].push(now);
    saveState(state);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return { allowed: true, remaining: MAX_PER_WINDOW - state.searchGate[windowKey].length };
  },

  // Health check
  async '/health'(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return {
      status: 'healthy',
      profiles: {
        total: ALLOWED_PROFILES.length,
        available: ALLOWED_PROFILES.filter(id => state.profiles[id]?.status === 'available').length,
        allocated: ALLOWED_PROFILES.filter(id => state.profiles[id]?.status === 'allocated').length
      }
    };
  }
};

// Create server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const handler = handlers[url.pathname];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  
  try {
    let body = {};
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    }
    
    const result = await handler(req, res, body);
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`[UnifiedGate] Running on port ${PORT}`);
  console.log(`[UnifiedGate] Allowed profiles: ${ALLOWED_PROFILES.join(', ')}`);
});

// Auto-cleanup every 30s
setInterval(() => {
  const now = Date.now();
  let changed = false;
  
  ALLOWED_PROFILES.forEach(profileId => {
    const profile = state.profiles[profileId];
    if (profile?.status === 'allocated' && profile.lastHeartbeat) {
      // Timeout after 2 minutes without heartbeat
      if (now - profile.lastHeartbeat > 120000) {
        console.log(`[UnifiedGate] Auto-release expired profile: ${profileId}`);
        state.profiles[profileId] = {
          status: 'available',
          allocatedTo: null,
          allocatedAt: null,
          lastHeartbeat: null,
          cookieValid: null
        };
        changed = true;
      }
    }
  });
  
  if (changed) saveState(state);
}, 30000);

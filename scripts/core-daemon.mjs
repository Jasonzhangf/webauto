#!/usr/bin/env node
/**
 * Core Daemon - Unified service manager for WebAuto
 * 
 * Manages all core services (Unified API, Browser Service, SearchGate)
 * with unified lifecycle and health monitoring.
 * 
 * Usage:
 *   node scripts/core-daemon.mjs start   - Start all services
 *   node scripts/core-daemon.mjs stop    - Stop all services  
 *   node scripts/core-daemon.mjs status  - Check service status
 *   node scripts/core-daemon.mjs restart - Restart all services
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { createServer } from 'node:net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SERVICES = {
  'unified-api': {
    name: 'unified-api',
    port: 7701,
    healthPath: '/health',
    scriptPath: 'dist/services/unified-api/server.js',
    env: { PORT: '7701', NODE_ENV: 'production' }
  },
  'browser-service': {
    name: 'browser-service',
    port: 7704,
    healthPath: '/health',
    scriptPath: 'dist/services/browser-service/index.js',
    env: { PORT: '7704', WS_PORT: '8765', NODE_ENV: 'production', BROWSER_SERVICE_AUTO_EXIT: '1' }
  },
  'search-gate': {
    name: 'search-gate',
    port: parseInt(process.env.WEBAUTO_SEARCH_GATE_PORT || '7790'),
    healthPath: '/health',
    scriptPath: 'scripts/search-gate-server.mjs',
    env: { WEBAUTO_SEARCH_GATE_PORT: process.env.WEBAUTO_SEARCH_GATE_PORT || '7790' }
  }
};

const RUN_DIR = path.join(os.homedir(), '.webauto', 'run');
const LOG_DIR = path.join(os.homedir(), '.webauto', 'logs');
const DEFAULT_HEARTBEAT_FILE = path.join(os.homedir(), '.webauto', 'run', 'xhs-heartbeat.json');

// Ensure directories exist
fs.mkdirSync(RUN_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

function ensureHeartbeatEnv() {
  if (process.env.WEBAUTO_HEARTBEAT_FILE) return;
  process.env.WEBAUTO_HEARTBEAT_FILE = DEFAULT_HEARTBEAT_FILE;
}

ensureHeartbeatEnv();

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

async function checkServiceHealth(service) {
  try {
    const res = await fetch(`http://127.0.0.1:${service.port}${service.healthPath}`);
    return res.ok;
  } catch {
    return false;
  }
}

async function checkPortInUse(port) {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.once('error', (err) => {
      resolve(err.code === 'EADDRINUSE');
    });
    
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    
    server.listen(port);
  });
}

function getPidFile(serviceName) {
  return path.join(RUN_DIR, `${serviceName}.pid`);
}

function getLogFile(serviceName) {
  return path.join(LOG_DIR, `${serviceName}.log`);
}

async function stopService(service) {
  const pidFile = getPidFile(service.name);
  
  if (!fs.existsSync(pidFile)) {
    return { stopped: false, reason: 'no_pid_file' };
  }
  
  const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim());
  if (isNaN(pid)) {
    fs.unlinkSync(pidFile);
    return { stopped: false, reason: 'invalid_pid' };
  }
  
  log(`Stopping ${service.name} (PID: ${pid})...`);
  
  try {
    process.kill(pid, 'SIGTERM');
    
    // Wait for graceful shutdown
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        process.kill(pid, 0);
      } catch {
        log(`${service.name} stopped gracefully`);
        fs.unlinkSync(pidFile);
        return { stopped: true, method: 'graceful' };
      }
    }
    
    // Force kill
    try {
      process.kill(pid, 0);
      log(`Force killing ${service.name}...`);
      process.kill(pid, 'SIGKILL');
      await new Promise(r => setTimeout(r, 500));
    } catch {
      // Already stopped
    }
    
    fs.unlinkSync(pidFile);
    return { stopped: true, method: 'force' };
  } catch (err) {
    log(`Error stopping ${service.name}: ${err.message}`, 'ERROR');
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
    return { stopped: false, reason: err.message };
  }
}

async function startService(service) {
  // Check if already healthy
  const isHealthy = await checkServiceHealth(service);
  if (isHealthy) {
    log(`${service.name} is already running and healthy`);
    return { started: false, reason: 'already_healthy' };
  }
  
  // Check if port in use
  const portInUse = await checkPortInUse(service.port);
  if (portInUse) {
    log(`Port ${service.port} in use but not healthy, stopping...`);
    await stopService(service);
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Check if service script exists
  const scriptPath = path.join(repoRoot, service.scriptPath);
  if (!fs.existsSync(scriptPath)) {
    log(`ERROR: Service script not found: ${scriptPath}`, 'ERROR');
    if (service.scriptPath.startsWith('dist/')) {
      log('Please run: npm run build:services', 'ERROR');
    }
    return { started: false, reason: 'script_not_found' };
  }
  
  log(`Starting ${service.name}...`);
  
  const logFile = getLogFile(service.name);
  let logFd = null;
  try {
    logFd = fs.openSync(logFile, 'a');
  } catch (err) {
    log(`WARN: Failed to open log file for ${service.name}: ${err.message}`, 'WARN');
  }
  
  const child = spawn('node', [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...service.env
    },
    stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'],
    detached: true,
    windowsHide: true
  });

  if (typeof logFd === 'number') {
    try {
      fs.closeSync(logFd);
    } catch {
      // ignore
    }
  }
  
  child.unref();
  
  // Write PID file
  const pidFile = getPidFile(service.name);
  fs.writeFileSync(pidFile, String(child.pid));
  
  log(`${service.name} started (PID: ${child.pid}, Log: ${logFile})`);
  
  // Wait for health check
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const healthy = await checkServiceHealth(service);
    if (healthy) {
      log(`${service.name} is healthy`);
      return { started: true, healthy: true };
    }
  }
  
  log(`WARNING: ${service.name} started but health check failed`, 'WARN');
  return { started: true, healthy: false };
}

async function getServiceStatus(service) {
  const pidFile = getPidFile(service.name);
  const hasPidFile = fs.existsSync(pidFile);
  const pid = hasPidFile ? fs.readFileSync(pidFile, 'utf-8').trim() : null;
  
  // Always check health first - more reliable than port check
  const isHealthy = await checkServiceHealth(service);
  if (isHealthy) {
    return {
      name: service.name,
      port: service.port,
      status: 'healthy',
      pid,
      pidFile: hasPidFile,
      portInUse: true,
      healthy: true
    };
  }
  
  // Check if port is in use (unhealthy but running)
  const portInUse = await checkPortInUse(service.port);
  
  let status = 'down';
  if (portInUse) {
    status = 'unhealthy';
  } else if (hasPidFile) {
    status = 'stale';
  }
  
  return {
    name: service.name,
    port: service.port,
    status,
    pid,
    pidFile: hasPidFile,
    portInUse,
    healthy: false
  };
}

async function startAll() {
  log('Starting all services...');
  
  const results = {};
  
  for (const [key, service] of Object.entries(SERVICES)) {
    results[key] = await startService(service);
  }
  
  log('All services started');
  return results;
}

async function stopAll() {
  log('Stopping all services...');
  
  const results = {};
  
  // Stop in reverse order
  const services = Object.entries(SERVICES).reverse();
  for (const [key, service] of services) {
    results[key] = await stopService(service);
  }
  
  log('All services stopped');
  return results;
}

async function statusAll() {
  log('Checking service status...\n');
  
  const statuses = {};
  
  for (const [key, service] of Object.entries(SERVICES)) {
    statuses[key] = await getServiceStatus(service);
  }
  
  // Print table
  console.log('Service Status:');
  console.log('─'.repeat(80));
  console.log(
    'Service'.padEnd(20),
    'Port'.padEnd(8),
    'Status'.padEnd(12),
    'PID'.padEnd(10),
    'Health'
  );
  console.log('─'.repeat(80));
  
  for (const [key, status] of Object.entries(statuses)) {
    console.log(
      status.name.padEnd(20),
      status.port.toString().padEnd(8),
      status.status.padEnd(12),
      (status.pid || '-').padEnd(10),
      status.healthy ? '✓ OK' : '✗ FAILED'
    );
  }
  
  console.log('─'.repeat(80));
  
  const allHealthy = Object.values(statuses).every(s => s.healthy);
  if (allHealthy) {
    log('\n✓ All services are healthy\n', 'INFO');
  } else {
    log('\n✗ Some services are not healthy\n', 'WARN');
    log('Run: node scripts/core-daemon.mjs start', 'INFO');
  }
  
  return statuses;
}

async function restartAll() {
  await stopAll();
  await new Promise(r => setTimeout(r, 2000));
  await startAll();
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'status';

(async () => {
  switch (command) {
    case 'start':
      await startAll();
      await new Promise(r => setTimeout(r, 1000));
      await statusAll();
      break;
      
    case 'stop':
      await stopAll();
      break;
      
    case 'status':
      await statusAll();
      break;
      
    case 'restart':
      await restartAll();
      await new Promise(r => setTimeout(r, 1000));
      await statusAll();
      break;
      
    default:
      console.log('Usage: node scripts/core-daemon.mjs [start|stop|status|restart]');
      process.exit(1);
  }
})().catch(err => {
  log(`Fatal error: ${err.message}`, 'ERROR');
  console.error(err);
  process.exit(1);
});

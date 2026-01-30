#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Verbose test to check container appear events with full payloads
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const UNIFIED_WS = 'ws://127.0.0.1:7701/bus';
const PROFILE = 'weibo_fresh';

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${msg}`);
}

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function testContainerEvents() {
  log('TEST', 'Starting verbose container events test');
  
  const WebSocket = (await import('ws')).default;
  const events = [];
  
  const ws = new WebSocket(UNIFIED_WS);
  await new Promise((resolve) => {
    ws.on('open', resolve);
    ws.on('error', (err) => {
      log('ERROR', `WebSocket error: ${err.message}`);
      throw err;
    });
  });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'event' && msg.topic.startsWith('container:')) {
        events.push(msg);
        log('EVENT', `${msg.topic} - ${JSON.stringify(msg.payload)}`);
      }
    } catch {}
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  try {
    // Trigger container match
    log('STEP', 'Triggering container match...');
    await post('/v1/controller/action', {
      action: 'containers:match',
      payload: {
        profile: PROFILE,
        url: 'https://weibo.com/',
        maxDepth: 3,
        maxChildren: 10
      }
    });
    
    // Wait for events
    await new Promise(r => setTimeout(r, 5000));
    
    log('SUMMARY', `Total events: ${events.length}`);
    const uniqueContainers = new Set(events.map(e => e.payload.containerId));
    log('SUMMARY', `Unique containers: ${uniqueContainers.size}`);
    console.log('Unique container IDs:', Array.from(uniqueContainers));
    
  } catch (err) {
    log('ERROR', err.message);
    console.error(err);
  } finally {
    ws.close();
  }
}

testContainerEvents().catch(console.error);

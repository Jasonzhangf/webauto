#!/usr/bin/env node
/**
 * Test container event dispatch directly via controller
 * 
 * This test checks if container appear events are being dispatched
 * after container matching
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const UNIFIED_WS = 'ws://127.0.0.1:7701/bus';

const args = process.argv.slice(2);
const PROFILE = args[0] || process.env.WEBAUTO_PROFILE || null;
const TARGET_URL = args[1] || process.env.WEBAUTO_URL || null;

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
  if (!PROFILE) {
    log('ERROR', 'Usage: test-container-events-direct.mjs <profile> [url]');
    log('ERROR', '  - profile 必须显式传入或通过 WEBAUTO_PROFILE 提供');
    process.exit(1);
  }
  
  log('TEST', 'Starting container events test');
  
  // Connect to event bus
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
      if (msg.type === 'event') {
        events.push(msg);
        if (msg.topic.startsWith('container:')) {
          log('EVENT', `${msg.topic}`);
        }
      }
    } catch {}
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  try {
    // Step 1: Check session
    log('STEP1', 'Checking session...');
    const sessions = await post('/v1/controller/action', {
      action: 'session:list',
      payload: {}
    });
    
    const active = sessions.data?.data?.sessions?.find(s => s.profileId === PROFILE);
    if (!active) {
      throw new Error(`No active session for profile ${PROFILE}`);
    }
    log('STEP1', `Found session: ${active.sessionId}`);
    
    // Clear events buffer
    events.length = 0;
    
    // Step 2: Trigger container match
    log('STEP2', 'Triggering container match...');
    const matchResult = await post('/v1/controller/action', {
      action: 'containers:match',
      payload: {
        profile: PROFILE,
        ...(TARGET_URL ? { url: TARGET_URL } : {})
      }
    });
    
    log('STEP2', `Match result: ${JSON.stringify(matchResult.data?.matched)}`);
    
    // Wait for events
    await new Promise(r => setTimeout(r, 3000));
    
    // Step 3: Check events
    log('STEP3', 'Checking received events...');
    
    const containerEvents = events.filter(e => e.topic && e.topic.startsWith('container:'));
    log('STEP3', `Total container events: ${containerEvents.length}`);
    
    const appearEvents = events.filter(e => e.topic && e.topic.includes(':appear'));
    log('STEP3', `Appear events: ${appearEvents.length}`);
    
    if (appearEvents.length > 0) {
      log('SUCCESS', 'Container appear events are being dispatched!');
      appearEvents.forEach(e => {
        log('EVENT', `  ${e.topic}: ${JSON.stringify(e.payload).substring(0, 100)}`);
      });
    } else {
      log('FAIL', 'No container appear events received!');
      log('INFO', 'This means the event dispatcher is not integrated with container matching');
    }
    
    const matchedEvents = events.filter(e => e.topic === 'containers.matched');
    log('STEP3', `Matched events: ${matchedEvents.length}`);
    
    if (matchedEvents.length > 0) {
      log('INFO', 'containers.matched event is dispatched (expected)');
    } else {
      log('WARN', 'No containers.matched event received');
    }
    
  } catch (err) {
    log('ERROR', err.message);
    console.error(err);
  } finally {
    ws.close();
  }
}

testContainerEvents().catch(console.error);

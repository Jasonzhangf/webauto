#!/usr/bin/env node
/**
 * Weibo Feed Extraction E2E Test (Optimized Version)
 * Goal: Extract 50 feed posts and their links
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';

const UNIFIED_PORT = 7701;
const BROWSER_PORT = 7704;
const PROFILE_ID = 'weibo_fresh';
const TARGET_URL = 'https://weibo.com';
const MAX_POSTS = 50;
const MAX_SCROLLS = 30;

let serviceProcess = null;
let extractedLinks = [];
let extractedPosts = [];

function log(msg) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  console.log(`[${timestamp}] [weibo-e2e] ${msg}`);
}

async function startServices() {
  log('Starting services with headful launcher...');
  return new Promise((resolve, reject) => {
    const launcherPath = path.resolve('scripts/start-headful.mjs');
    serviceProcess = spawn('node', [launcherPath, '--profile', PROFILE_ID, '--url', TARGET_URL], {
      stdio: 'pipe',
      env: { ...process.env, WEBAUTO_HEADLESS: '0' }
    });

    let started = false;
    
    serviceProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('✅ 容器匹配成功')) {
        log('Services ready and container matched');
        started = true;
        resolve(true);
      }
    });

    serviceProcess.stderr.on('data', (data) => {
      // Ignore routine logs
    });

    setTimeout(() => {
      if (!started) reject(new Error('Startup timeout'));
    }, 60000);
  });
}

async function sendWsAction(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${UNIFIED_PORT}/ws`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'action', action, payload, requestId: Date.now() }));
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'response') {
        ws.close();
        resolve(msg);
      }
    });
    ws.on('error', (err) => { ws.close(); reject(err); });
  });
}

async function extractLinksFromPost(post) {
  const selector = post.match?.nodes?.[0]?.selector;
  if (!selector) return [];
  
  try {
    const script = `(() => {
      const post = document.querySelector('${selector}');
      if (!post) return { links: [] };
      return {
        links: Array.from(post.querySelectorAll('a[href]'))
          .map(a => ({ href: a.href, text: a.textContent.trim() }))
          .filter(l => l.href.startsWith('http') && !l.href.includes('javascript:'))
          .slice(0, 10)
      };
    })()`;
    
    const result = await sendWsAction('browser:execute', {
      profile: PROFILE_ID,
      script
    });
    
    return result.data?.links || [];
  } catch (err) {
    log(`Extract failed: ${err.message}`);
    return [];
  }
}

async function scrollPage() {
  await sendWsAction('browser:execute', {
    profile: PROFILE_ID,
    script: 'window.scrollBy({ top: 800, behavior: "smooth" })'
  });
  await new Promise(r => setTimeout(r, 2000));
}

async function main() {
  try {
    await startServices();
    
    let scrollCount = 0;
    
    while (extractedPosts.length < MAX_POSTS && scrollCount < MAX_SCROLLS) {
      log(`Scanning... (Found: ${extractedPosts.length}/${MAX_POSTS})`);
      
      const matchResult = await sendWsAction('containers:match', {
        profile: PROFILE_ID,
        url: TARGET_URL,
        maxDepth: 3,
        maxChildren: 100
      });
      
      const containers = matchResult.data?.snapshot?.container_tree?.containers || [];
      const posts = containers.filter(c => c.id.includes('feed_post'));
      
      // Process new posts
      for (const post of posts) {
        if (extractedPosts.some(p => p.id === post.id)) continue;
        
        const links = await extractLinksFromPost(post);
        if (links.length > 0) {
          extractedPosts.push({ id: post.id, links });
          extractedLinks.push(...links);
          log(`  + Processed post ${post.id} (${links.length} links)`);
        }
      }
      
      await scrollPage();
      scrollCount++;
    }
    
    log('=== Results ===');
    log(`Total Posts: ${extractedPosts.length}`);
    log(`Total Links: ${extractedLinks.length}`);
    
    const resultFile = `/tmp/weibo-results-${Date.now()}.json`;
    fs.writeFileSync(resultFile, JSON.stringify({ posts: extractedPosts }, null, 2));
    log(`Saved to ${resultFile}`);
    
    if (extractedPosts.length > 0) {
      log('✅ Test Passed');
    } else {
      log('❌ Test Failed: No posts extracted');
      process.exit(1);
    }

  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    if (serviceProcess) serviceProcess.kill();
    process.exit(0);
  }
}

main();

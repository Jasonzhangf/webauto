#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();


const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function testHighlight() {
  console.log('[Test] Testing highlight operation...\n');
  
  try {
    // 先执行一个简单的 highlight 操作，直接提供 selector
    console.log('[Step 1] Calling browser:execute to highlight .feeds-container...');
    
    const script = `
      (() => {
        const el = document.querySelector('.feeds-container');
        if (!el) return { success: false, error: 'Element not found' };
        el.style.outline = '5px solid red';
        setTimeout(() => { el.style.outline = ''; }, 2000);
        const rect = el.getBoundingClientRect();
        return { 
          success: true, 
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        };
      })()
    `;
    
    const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile: PROFILE,
          script
        }
      })
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`[Error] HTTP ${response.status}: ${text}`);
      process.exit(1);
    }
    
    const data = await response.json();
    console.log('[Step 2] Response:');
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error(`[Error] ${error.message}`);
    process.exit(1);
  }
}

testHighlight();

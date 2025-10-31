#!/usr/bin/env node
/**
 * Open Weibo (headful) with direct cookie injection and inject ONLY the 操作 tab (mock, no logic).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function arg(k, dflt){ const a=process.argv.indexOf(k); return (a>=0 && process.argv[a+1])? process.argv[a+1] : dflt; }

async function main(){
  const cookieFile = arg('--cookies', path.join(process.env.HOME||process.env.USERPROFILE||'.', '.webauto', 'cookies', 'weibo.com-latest.json'));
  console.log('[direct-ops] cookies:', cookieFile, fs.existsSync(cookieFile)?'(exists)':'(missing)');

  const browser = await chromium.launch({ headless:false });
  const context = await browser.newContext({ viewport:{ width:1440, height:900 } });
  try{
    if (fs.existsSync(cookieFile)){
      const raw = JSON.parse(fs.readFileSync(cookieFile,'utf8'));
      const arr = Array.isArray(raw)? raw : (Array.isArray(raw.cookies)? raw.cookies : []);
      if (arr.length) await context.addCookies(arr);
    }
  }catch(e){ console.warn('[direct-ops] cookie warn:', e.message); }

  const page = await context.newPage();
  await page.goto('https://weibo.com', { waitUntil:'domcontentloaded', timeout:60000 }).catch(()=>{});

  const css = `.wa-panel{position:fixed;right:16px;top:16px;width:560px;max-height:calc(100vh - 32px);overflow:auto;background:#121212;color:#eee;border:1px solid #2f2f2f;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.45);font:13px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial;z-index:2147483647}.wa-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #2b2b2b;background:#1a1a1a;border-radius:10px 10px 0 0}.wa-title{font-weight:600}.wa-close{background:#2a2a2a;border:1px solid #3a3a3a;color:#ddd;border-radius:6px;padding:4px 8px;cursor:pointer}.wa-body{padding:12px}.wa-row{display:flex;gap:10px;margin:8px 0;align-items:flex-start}.wa-col{flex:1}.wa-label{min-width:110px;color:#9aa0a6;padding-top:6px}.wa-input,.wa-select{width:100%;box-sizing:border-box;background:#1f1f1f;border:1px solid #363636;color:#eaeaea;border-radius:8px;padding:8px}.wa-chip{display:inline-block;padding:2px 8px;border-radius:12px;background:#2a2a2a;border:1px solid #3a3a3a;color:#ddd;margin-right:6px;margin-bottom:6px}.wa-section{border:1px solid #242424;border-radius:10px;padding:10px;margin-bottom:10px;background:#151515}.wa-section h4{margin:0 0 8px 0;font-size:13px;color:#e6e6e6}.wa-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.wa-btn{background:#2a2a2a;border:1px solid #3a3a3a;color:#ddd;border-radius:8px;padding:6px 10px;cursor:default;opacity:.8}.wa-queue-item{display:flex;justify-content:space-between;align-items:center;border:1px dashed #3a3a3a;border-radius:8px;padding:6px 8px;margin-bottom:6px;background:#191919}.wa-muted{color:#9aa0a6}`;
  const html = `<div id="wa-mock-panel" class="wa-panel"><div class="wa-header"><div class="wa-title">操作（样式预览）</div><button class="wa-close" onclick="document.getElementById('wa-mock-panel').remove()">关闭</button></div><div class="wa-body"><div class="wa-section"><h4>操作选择与参数</h4><div class="wa-grid"><div><div class="wa-muted">（自动加载操作库，按元素类型过滤）</div><select class="wa-select" style="margin-top:6px"><option>高亮(绿色)</option><option>点击(DOM)</option><option>滚动到可视</option><option>输入文本(替换)</option><option>输入+按键序列</option></select></div><div><div class="wa-muted">参数/输入值</div><input class="wa-input" placeholder="例如：文本 或 属性名 href"/></div></div></div><div class="wa-section"><h4>按键序列</h4><div><span class="wa-chip">Enter</span><span class="wa-chip">Backspace</span><span class="wa-chip">Tab</span><span class="wa-chip">Escape</span><span class="wa-chip">↑</span><span class="wa-chip">↓</span><span class="wa-chip">←</span><span class="wa-chip">→</span><span class="wa-chip">Ctrl+Enter</span></div></div><div class="wa-section"><h4>操作队列（顺序执行）</h4><div class="wa-queue-item"><div>1. 高亮(绿色)</div><div class="wa-muted">（上移/下移/删除）</div></div><div class="wa-queue-item"><div>2. 点击(DOM)</div><div class="wa-muted">（上移/下移/删除）</div></div><div class="wa-row"><div class="wa-label">执行</div><div class="wa-col"><button class="wa-btn">执行（预览样式，无功能）</button></div></div></div></div></div>`;

  const initJS = `(() => { try { function ensure(){ try { if(!document.getElementById('wa-mock-style')){ const s=document.createElement('style'); s.id='wa-mock-style'; s.textContent=${JSON.stringify(css)}; (document.head||document.documentElement).appendChild(s);} if(!document.getElementById('wa-mock-panel')){ const w=document.createElement('div'); w.innerHTML=${JSON.stringify(html)}; (document.documentElement).appendChild(w.firstChild);} } catch(e){ console.warn('[ops ensure]', e.message);} } if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', ensure, { once:true }); } else { ensure(); } try { let n=0; const it=setInterval(()=>{ n++; ensure(); if(n>150) clearInterval(it); }, 2000); } catch{} } catch(e){ console.warn('[ops init]', e.message);} })();`;

  await context.addInitScript(initJS).catch(()=>{});
  await page.evaluate(initJS => { try { (0,eval)(initJS); } catch(e){ console.warn('eval err', e.message);} }, initJS).catch(()=>{});

  console.log('Ops mock injected (direct). Browser will stay open.');
  await new Promise(resolve => browser.on('disconnected', resolve));
}

main().catch(e => { console.error(e); process.exit(1); });


#!/usr/bin/env node
/**
 * Open Weibo headful and inject a non-functional UI mock of the picker menu.
 * No logic, just styles and layout for review.
 */
const { requireCookieVerification } = require('./system/unified-cookie-manager.cjs');
const fs = require('fs');
const path = require('path');

function arg(k, dflt) {
  const a = process.argv.indexOf(k);
  if (a >= 0 && process.argv[a+1]) return process.argv[a+1];
  return dflt;
}

async function main() {
  // Use unified pre-login workflow (headful, may enter manual login if cookies invalid)
  const defaultCookiePath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.webauto', 'cookies', 'weibo.com-latest.json');
  const cookieFile = arg('--cookies', defaultCookiePath);
  console.log('[mock] using cookie file:', cookieFile, fs.existsSync(cookieFile)?'(exists)':'(missing)');
  const { browser, context, page, manager } = await requireCookieVerification({
    headless: false,
    verbose: true,
    forceLoginCheck: true,
    cookieFile,
    viewport: { width: 1440, height: 900 }
  });
  // Stay attached until browser closes; do not cleanup here (user controls lifetime)
  process.on('SIGINT', async () => { try { await manager?.cleanup(); } catch {} });
  process.on('SIGTERM', async () => { try { await manager?.cleanup(); } catch {} });

  const css = `
  .wa-panel{position:fixed;right:16px;top:16px;width:520px;max-height:calc(100vh - 32px);overflow:auto;background:#121212;color:#eee;border:1px solid #2f2f2f;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.45);font:13px/1.45 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial;z-index:2147483647}
  .wa-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #2b2b2b;background:#1a1a1a;border-radius:10px 10px 0 0}
  .wa-title{font-weight:600}
  .wa-close{background:#2a2a2a;border:1px solid #3a3a3a;color:#ddd;border-radius:6px;padding:4px 8px;cursor:pointer}
  .wa-tabs{display:flex;gap:8px;padding:8px 12px;border-bottom:1px solid #242424;background:#161616;position:sticky;top:0}
  .wa-tab{padding:4px 10px;border:1px solid #333;border-radius:6px;background:#202020;color:#bbb}
  .wa-tab.active{background:#2d2d2d;color:#fff;border-color:#444}
  .wa-body{padding:12px}
  .wa-row{display:flex;gap:10px;margin:8px 0;align-items:flex-start}
  .wa-col{flex:1}
  .wa-label{min-width:110px;color:#9aa0a6;padding-top:6px}
  .wa-input, .wa-select, .wa-text{width:100%;box-sizing:border-box;background:#1f1f1f;border:1px solid #363636;color:#eaeaea;border-radius:8px;padding:8px}
  .wa-badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#263238;color:#a7c0cd;border:1px solid #35525a;margin-right:6px}
  .wa-chip{display:inline-block;padding:2px 8px;border-radius:12px;background:#2a2a2a;border:1px solid #3a3a3a;color:#ddd;margin-right:6px;margin-bottom:6px}
  .wa-section{border:1px solid #242424;border-radius:10px;padding:10px;margin-bottom:10px;background:#151515}
  .wa-section h4{margin:0 0 8px 0;font-size:13px;color:#e6e6e6}
  .wa-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .wa-btn{background:#2a2a2a;border:1px solid #3a3a3a;color:#ddd;border-radius:8px;padding:6px 10px;cursor:default;opacity:.8}
  .wa-queue-item{display:flex;justify-content:space-between;align-items:center;border:1px dashed #3a3a3a;border-radius:8px;padding:6px 8px;margin-bottom:6px;background:#191919}
  .wa-muted{color:#9aa0a6}
  `;

  const html = `
  <div id="wa-mock-panel" class="wa-panel">
    <div class="wa-header">
      <div class="wa-title">操作菜单（样式预览）</div>
      <button class="wa-close" onclick="document.getElementById('wa-mock-panel').remove()">关闭</button>
    </div>
    <div class="wa-tabs">
      <div class="wa-tab active">常规</div>
      <div class="wa-tab">操作</div>
      <div class="wa-tab">容器库</div>
    </div>
    <div class="wa-body">
      <!-- 常规 TAB -->
      <div class="wa-section">
        <h4>当前元素</h4>
        <div class="wa-row"><div class="wa-label">识别类</div><div class="wa-col"><span class="wa-badge">div.card.item.main</span><span class="wa-badge">.feed_content</span></div></div>
        <div class="wa-row"><div class="wa-label">父容器</div><div class="wa-col"><span class="wa-badge">feed_item</span></div></div>
        <div class="wa-row"><div class="wa-label">根容器</div><div class="wa-col"><span class="wa-badge">feed_list</span></div></div>
      </div>

      <div class="wa-section">
        <h4>容器选择</h4>
        <div class="wa-row"><div class="wa-label">容器</div><div class="wa-col"><select class="wa-select"><option>匹配: container.card</option><option>父容器: container.feed</option></select></div></div>
        <div class="wa-row"><div class="wa-label">选中父容器</div><div class="wa-col"><span class="wa-chip">未启用</span></div></div>
        <div class="wa-row"><div class="wa-label">当前选择器</div><div class="wa-col"><input class="wa-input" value="div.card.item.main .content" /></div></div>
      </div>

      <!-- 操作 TAB -->
      <div class="wa-section">
        <h4>操作选择与参数</h4>
        <div class="wa-grid">
          <div>
            <div class="wa-muted">（自动加载操作库，按元素类型过滤）</div>
            <select class="wa-select" style="margin-top:6px">
              <option>高亮(绿色)</option>
              <option>点击(DOM)</option>
              <option>滚动到可视</option>
              <option>输入文本(替换)</option>
              <option>输入+按键序列</option>
            </select>
          </div>
          <div>
            <div class="wa-muted">参数/输入值</div>
            <input class="wa-input" placeholder="例如：文本 或 属性名 href" />
          </div>
        </div>
      </div>

      <div class="wa-section">
        <h4>按键序列</h4>
        <div>
          <span class="wa-chip">Enter</span>
          <span class="wa-chip">Backspace</span>
          <span class="wa-chip">Tab</span>
          <span class="wa-chip">Escape</span>
          <span class="wa-chip">↑</span>
          <span class="wa-chip">↓</span>
          <span class="wa-chip">←</span>
          <span class="wa-chip">→</span>
          <span class="wa-chip">Ctrl+Enter</span>
        </div>
      </div>

      <div class="wa-section">
        <h4>操作队列（顺序执行）</h4>
        <div class="wa-queue-item"><div>1. 高亮(绿色)</div><div class="wa-muted">（上移/下移/删除）</div></div>
        <div class="wa-queue-item"><div>2. 点击(DOM)</div><div class="wa-muted">（上移/下移/删除）</div></div>
        <div class="wa-row"><div class="wa-label">执行</div><div class="wa-col"><button class="wa-btn">执行（预览样式，无功能）</button></div></div>
      </div>

      <!-- 容器库 TAB -->
      <div class="wa-section">
        <h4>保存的容器</h4>
        <div class="wa-row">
          <div class="wa-col" style="max-width:45%">
            <div class="wa-queue-item"><div>2025-10-30 12:00</div><div class="wa-muted">feed.card</div></div>
            <div class="wa-queue-item"><div>2025-10-30 12:10</div><div class="wa-muted">comment.item</div></div>
            <div class="wa-queue-item"><div>2025-10-30 12:25</div><div class="wa-muted">user.avatar</div></div>
          </div>
          <div class="wa-col">
            <div class="wa-row"><div class="wa-label">类</div><div class="wa-col"><span class="wa-badge">.feed.card</span></div></div>
            <div class="wa-row"><div class="wa-label">容器树</div><div class="wa-col"><span class="wa-badge">feed_list</span><span class="wa-badge">feed_item</span><span class="wa-badge">feed_card</span></div></div>
            <div class="wa-row"><div class="wa-label">操作</div><div class="wa-col"><button class="wa-btn">加载</button> <button class="wa-btn">编辑</button> <button class="wa-btn">复制</button> <button class="wa-btn">删除</button></div></div>
          </div>
        </div>
      </div>

    </div>
  </div>`;

  // Build robust init script to survive refresh/SPA navigations
  const initJS = `(() => {
    try {
      const CSS = ${JSON.stringify(css)};
      const HTML = ${JSON.stringify(html)};
      function ensure() {
        try {
          if (!document.getElementById('wa-mock-style')) {
            const s = document.createElement('style'); s.id = 'wa-mock-style'; s.textContent = CSS; (document.head||document.documentElement).appendChild(s);
          }
          if (!document.getElementById('wa-mock-panel')) {
            const wrap = document.createElement('div'); wrap.innerHTML = HTML; (document.documentElement).appendChild(wrap.firstChild);
          }
        } catch (e) { try { console.warn('[wa-mock] ensure fail', e.message); } catch {} }
      }
      if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ensure, { once:true }); } else { ensure(); }
      // Mutation fallback for heavy SPA layouts
      try {
        const mo = new MutationObserver(() => { if (!document.getElementById('wa-mock-panel')) ensure(); });
        mo.observe(document.documentElement, { childList: true, subtree: true });
      } catch {}
      // Periodic ensure for 5 minutes
      try { let n=0; const it = setInterval(() => { n++; ensure(); if (n>150) clearInterval(it); }, 2000); } catch {}
    } catch (e) { try { console.warn('[wa-mock] init error', e.message); } catch {} }
  })();`;

  // Ensure future pages (refresh/new tabs) also get the mock UI
  try { await context.addInitScript(initJS); } catch {}
  // Inject into current page (CSP-safe via evaluate)
  try { await page.evaluate(initJS => { try { (0,eval)(initJS); } catch (e) { console.warn('[wa-mock] eval error', e?.message||String(e)); } }, initJS); } catch {}

  console.log('UI mock injected via pre-login flow. This process will stay until you close the browser.');
  await new Promise(resolve => browser.on('disconnected', resolve));
}

main().catch(e => { console.error(e); process.exit(1); });

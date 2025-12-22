// 捕获点击后弹窗中的动态 token（例如 1688 联系窗口）
// 原理：在指定容器内批量点击目标元素，监听 popup 与网络请求，提取目标主机的最终 URL 与查询参数。
import BaseNode from './BaseNode';

function parseTokens(url) {
  try {
    const u = new URL(url);
    const q = Object.fromEntries(u.searchParams.entries());
    // 解析 hash 中的查询（例如 #/path?param=... 或 #param=...）
    let hash = u.hash || '';
    let hq = {};
    if (hash) {
      const idx = hash.indexOf('?');
      const queryStr = idx >= 0 ? hash.slice(idx + 1) : (hash.startsWith('#') ? hash.slice(1) : hash);
      try { hq = Object.fromEntries(new URLSearchParams(queryStr).entries()); } catch {}
    }
    const merged = { ...hq, ...q };
    return {
      host: u.host,
      pathname: u.pathname,
      query: merged,
      uid: merged.uid || merged.userId || merged.memberId || merged.touid || null,
      offerId: merged.offerId || merged.offerid || merged.offerID || merged.offerIds || null,
      site: merged.site || null,
      from: merged.from || merged.fromid || null,
      scene: merged.scene || null,
      token: merged.token || merged.t || merged._t || merged.auth || merged.AUTH || null,
      juggler: merged.JUGGLER || merged.juggler || null,
      raw: url
    };
  } catch { return { raw: url }; }
}

export default class PopupTokenCaptureNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'PopupTokenCaptureNode';
    this.description = '批量点击并捕获弹窗/网络中的目标 URL 与动态 token';
  }

  async execute(context: any, params: any): Promise<any> {
    const { page, logger, config, engine, context: browserContext } = context;
    const containerSelector = config.containerSelector;
    const clickSelector = config.clickSelector;
    const clickSelectors = Array.isArray(config.clickSelectors) ? config.clickSelectors.filter(Boolean) : [];
    const hostFilter = config.hostFilter || 'air.1688.com';
    const maxItems = Number(config.maxItems || 10);
    const varStart = (context.variables && (context.variables.get('startIndex'))) ?? null;
    const startIndex = Math.max(0, Number(varStart != null ? varStart : (config.startIndex || 0)));
    const waitPopupMs = Number(config.waitPopupMs || 8000);
    const minClickDelay = config.minClickDelay != null ? Number(config.minClickDelay) : (config.clickDelay != null ? Number(config.clickDelay) : 200);
    const maxClickDelay = config.maxClickDelay != null ? Number(config.maxClickDelay) : (config.clickDelay != null ? Number(config.clickDelay) : 600);
    const afterPopupWaitMs = Number(config.afterPopupWaitMs || 800);
    const popupClickSelectors = Array.isArray(config.popupClickSelectors) && config.popupClickSelectors.length
      ? config.popupClickSelectors
      : ['body > div:nth-child(23)'];
    const dryMode = Boolean(config.dryMode);
    const enforceWebPref = config.enforceWebPreference !== false; // 默认开启
    const popupStepGate = Boolean(config.popupStepGate);
    const gateTitle = config.gateTitle || 'WebAuto 控制面板';
    const gateMessage = config.gateMessage || '点击“下一步”以继续执行本步骤';

    if (!containerSelector || (!clickSelector && (!clickSelectors || clickSelectors.length === 0))) {
      return { success: false, error: 'containerSelector and clickSelector(s) required' };
    }

    try {
      await page.waitForSelector(containerSelector, { timeout: 15000 });
    } catch (e) {
      return { success: false, error: `container not found: ${containerSelector}` };
    }

    // 收集候选元素（兼容多选择器，含默认）
    const collected = [];
    const defaultSelectors = [
      'a.ww-link.ww-inline',
      'span.J_WangWang a.ww-link',
      'a[href*="air.1688.com/app/"]'
    ];
    const selectorList = [];
    if (clickSelector) selectorList.push(clickSelector);
    if (clickSelectors.length) selectorList.push(...clickSelectors);
    selectorList.push(...defaultSelectors);

    for (const sel of selectorList) {
      try {
        const arr = await page.$$(containerSelector + ' ' + sel);
        for (const h of arr) { if (!collected.includes(h)) collected.push(h); }
      } catch {}
    }
    const targets = collected.slice(startIndex, startIndex + maxItems);
    logger.info(`🎯 待点击元素: ${targets.length}（来源选择器: ${selectorList.join(' | ')}）`);

    // 预取每个目标的元信息（data-nick/offerId/href/店铺名）
    const targetMeta = [];
    for (const el of targets) {
      try {
        const meta = await el.evaluate((e) => {
          function text(el){return (el && (el.innerText||el.textContent)||'').trim();}
          const anchor = e.closest('a') || e;
          let href = anchor && anchor.getAttribute('href');
          // 关联 wangwang 容器
          const span = e.closest('span.J_WangWang') || document.querySelector('span.J_WangWang');
          const dataNick = span?.getAttribute('data-nick') || null;
          const dataFrom = span?.getAttribute('data-from') || null;
          let dataExtra = null; try { dataExtra = span?.getAttribute('data-extra'); } catch {}
          let extra = null; try { extra = dataExtra ? JSON.parse(dataExtra) : null; } catch { extra = { raw: dataExtra }; }
          // 查找 offerId
          let offerId = null;
          try {
            // 从当前卡片容器内查找包含 offerId 的链接或属性
            const card = e.closest('a.search-offer-wrapper') || e.closest('[data-offerid]') || e.closest('[data-offer-id]');
            offerId = card?.getAttribute('data-offerid') || card?.getAttribute('data-offer-id') || null;
          } catch {}
          // 店铺名
          let shop = null;
          try {
            const shopEl = (e.closest('.offer-shop-row')||document).querySelector('.offer-shop-row .desc-text, .offer-hover-wrapper .desc-text');
            shop = text(shopEl);
          } catch {}
          return { href, dataNick, dataFrom, extra, offerId, shop };
        });
        targetMeta.push(meta);
      } catch { targetMeta.push(null); }
    }

    const results = [];

    // 网络监听（备用，主页面）
    const mainReqListener = req => {
      try {
        const url = req.url();
        if (url.includes(hostFilter)) {
          results.push({ type: 'request', scope: 'main', ...parseTokens(url) });
          engine?.recordBehavior?.('token_request_hit', { url, scope: 'main' });
        }
      } catch {}
    };
    const mainResListener = res => {
      try {
        const url = res.url();
        if (url.includes(hostFilter)) {
          results.push({ type: 'response', scope: 'main', ...parseTokens(url) });
          engine?.recordBehavior?.('token_response_hit', { url, scope: 'main' });
        }
      } catch {}
    };
    page.on('request', mainReqListener);
    page.on('response', mainResListener);

    // Dry-mode 注入：拦截 window.open 并阻止默认导航但保留业务逻辑执行
    if (dryMode) {
      try {
        await page.evaluate(() => {
          try {
            window.__capturedOpenUrls = [];
            const _open = window.open;
            window.open = function(url, name, specs) {
              try { window.__capturedOpenUrls.push(String(url||'')); } catch {}
              // 返回 null 阻止新窗口创建
              return null;
            };
            // 捕获阶段阻止默认导航，但不阻止事件传播
            if (!window.__dryClickGuardInstalled) {
              document.addEventListener('click', (e) => { try { e.preventDefault(); } catch {} }, true);
              window.__dryClickGuardInstalled = true;
            }
          } catch {}
        });
      } catch {}
    }

    // 监听上下文中新建的 tab（有些站 target=_blank 触发 context 'page' 事件而非 popup）
    const newPages = [];
    const contextListener = async (p) => {
      try {
        newPages.push(p);
        await attachNetListeners(p, 'context-page');
        await p.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(()=>{});
        // 同样处理 Web/客户端选择模态
        const webTexts = ['使用网页版','继续使用网页版','网页','使用网页','仍使用网页','留在网页'];
        const cancelTexts = ['取消','不打开','暂不'];
        const handledWeb = await clickTextIfPresent(p, webTexts);
        if (!handledWeb) { await clickTextIfPresent(p, cancelTexts); }
        await clickBySelectors(p, popupClickSelectors);
        await p.waitForTimeout(afterPopupWaitMs).catch(()=>{});
        const u = p.url();
        if (u && u.includes(hostFilter)) {
          results.push({ type: 'tab', ...parseTokens(u) });
          engine?.recordBehavior?.('token_tab_hit', { url: u });
        }
        if (config.closePopup !== false) { try { await p.close(); } catch {} }
      } catch {}
    };
    try { browserContext?.on?.('page', contextListener); } catch {}

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const randBetween = (a,b) => (a===b? a : (Math.floor(Math.random()*(b-a+1))+a));

    async function clickTextIfPresent(p, texts = []): Promise<any> {
      try {
        // 尝试基于文本点击常见按钮/链接
        const found = await p.evaluate((keys) => {
          function norm(s){return (s||'').trim();}
          const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], .btn, .button'));
          const lowerKeys = keys.map(k => k.toLowerCase());
          for (const el of candidates) {
            const txt = norm(el.innerText || el.textContent || '').toLowerCase();
            if (!txt) continue;
            if (lowerKeys.some(k => txt.includes(k))) {
              el.click();
              return true;
            }
          }
          return false;
        }, texts);
        return !!found;
      } catch { return false; }
    }

    async function attachNetListeners(p, scope='popup'): Promise<any> {
      try {
        p.on('request', req => {
          try{
            const url = req.url();
            if (url.includes(hostFilter)) {
              results.push({ type: 'request', scope, ...parseTokens(url) });
              engine?.recordBehavior?.('token_request_hit', { url, scope });
            }
          }catch{}
        });
        p.on('response', async res => {
          try{
            const url = res.url();
            if (url.includes(hostFilter)) {
              results.push({ type: 'response', scope, ...parseTokens(url) });
              engine?.recordBehavior?.('token_response_hit', { url, scope });
            }
            // 捕获 3xx 跳转的 Location 字段
            const st = res.status();
            if (st >= 300 && st < 400) {
              const h = await res.headers();
              const loc = h?.location;
              if (loc) {
                try {
                  const abs = new URL(loc, url).toString();
                  if (abs.includes(hostFilter)) {
                    results.push({ type: 'redirect', scope, ...parseTokens(abs) });
                    engine?.recordBehavior?.('token_redirect_hit', { url: abs, scope });
                  }
                } catch {}
              }
            }
          }catch{}
        });
        p.on('framenavigated', fr => {
          try{
            if (fr === p.mainFrame()) {
              const fu = fr.url();
              if (fu && fu.includes(hostFilter)) {
                results.push({ type: 'frame', scope, ...parseTokens(fu) });
                engine?.recordBehavior?.('token_frame_hit', { url: fu, scope });
              }
            }
          }catch{}
        });
      } catch {}
    }
    async function clickBySelectors(p, selectors = []): Promise<any> {
      for (const sel of selectors) {
        try {
          const els = await p.$$(sel);
          for (const el of els) {
            try {
              if (await el.isVisible()) {
                await el.click({ timeout: 500 }).catch(() => el.evaluate(n => n.click()));
                context.engine?.recordBehavior?.('token_popup_modal_click', { selector: sel });
              }
            } catch {}
          }
        } catch {}
      }
    }

    async function enforceWebPreferenceIfAny(p): Promise<any> {
      if (!enforceWebPref) return false;
      // 直接找文本按钮
      const ok = await clickTextIfPresent(p, ['优先使用网页版','继续使用网页版','使用网页版','网页','仍使用网页']);
      if (ok) return true;
      // 回退：常见容器下的按钮扫描（如 body > div:nth-child(23) ）
      try {
        const btns = await p.$$('body > div:nth-child(23) button');
        for (const b of btns) {
          try {
            const t = (await b.innerText()).trim();
            if (t.includes('优先使用网页版') || t.includes('使用网页版')) {
              await b.click({ timeout: 500 }).catch(() => b.evaluate(n => n.click()));
              context.engine?.recordBehavior?.('web_pref_click', { text: t });
              return true;
            }
          } catch {}
        }
      } catch {}
      return false;
    }

    async function injectStepGate(p, { title, message } = {}): Promise<any> {
      try {
        await p.addInitScript(() => {}); // 占位，确保已附着
      } catch {}
      await p.evaluate((opts) => {
        const id = '__webauto_gate_panel__';
        let box = document.getElementById(id);
        if (box) box.remove();
        box = document.createElement('div');
        box.id = id;
        box.style.cssText = [
          'position:fixed','top:12px','right:12px','z-index:999999','background:rgba(0,0,0,0.75)','color:#fff','padding:10px 12px','border-radius:8px','font-family:-apple-system,system-ui,Segoe UI,Roboto,Ubuntu','box-shadow:0 4px 12px rgba(0,0,0,0.3)'
        ].join(';');
        const title = document.createElement('div');
        title.textContent = (opts && opts.title) || 'WebAuto';
        title.style.cssText = 'font-weight:600;margin-bottom:6px;font-size:13px;';
        const msg = document.createElement('div');
        msg.textContent = (opts && opts.message) || '点击下一步继续';
        msg.style.cssText = 'opacity:0.85;margin-bottom:8px;font-size:12px;';
        const row = document.createElement('div');
        const next = document.createElement('button');
        next.textContent = '下一步';
        next.style.cssText = 'background:#3c98ff;border:none;color:#fff;border-radius:4px;padding:4px 10px;margin-right:8px;cursor:pointer;';
        const stop = document.createElement('button');
        stop.textContent = '停止';
        stop.style.cssText = 'background:#555;border:none;color:#fff;border-radius:4px;padding:4px 10px;cursor:pointer;';
        row.appendChild(next); row.appendChild(stop);
        box.appendChild(title); box.appendChild(msg); box.appendChild(row);
        document.body.appendChild(box);
        window.__webauto_gate_state = 'waiting';
        next.addEventListener('click', () => { window.__webauto_gate_state = 'next'; });
        stop.addEventListener('click', () => { window.__webauto_gate_state = 'stop'; });
      }, { title, message });
    }

    async function waitForGate(p, timeoutMs = 0): Promise<any> {
      const start = Date.now();
      while (true) {
        const state = await p.evaluate(() => window.__webauto_gate_state || '');
        if (state === 'next') return 'next';
        if (state === 'stop') return 'stop';
        if (timeoutMs && Date.now() - start > timeoutMs) return 'timeout';
        await sleep(300);
      }
    }

    // 预先尝试在主页面确认“优先使用网页版”
    try { await enforceWebPreferenceIfAny(page); } catch {}

    for (let i = 0; i < targets.length; i++) {
      const el = targets[i];
      try {
        engine?.recordBehavior?.('token_click_try', { index: i });
        const popupPromise = page.waitForEvent('popup', { timeout: waitPopupMs }).catch(() => null);
        try { await el.evaluate(e => e.scrollIntoView({behavior:'instant', block:'center'})); } catch {}
        await el.click({ timeout: 5000 }).catch(async () => {
          // 回退到原生事件
          await page.evaluate(e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })), el);
        });
        const popup = dryMode ? null : await popupPromise;
        if (popup) {
          await attachNetListeners(popup, 'popup');
          await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});

          if (popupStepGate) {
            try {
              await injectStepGate(popup, { title: gateTitle, message: gateMessage });
              engine?.recordBehavior?.('step_gate_wait', { scope: 'popup', index: i });
              const sig = await waitForGate(popup);
              engine?.recordBehavior?.('step_gate_result', { scope: 'popup', index: i, signal: sig });
              if (sig === 'stop') {
                return { success: false, error: 'stopped by user' };
              }
            } catch {}
          }

          // 处理“唤起客户端/使用网页版”模态，优先选择网页版
          const webTexts = ['优先使用网页版', '使用网页版', '继续使用网页版', '网页', '使用网页', '仍使用网页', '留在网页'];
          const cancelTexts = ['取消', '不打开', '暂不'];
          const handledWeb = await clickTextIfPresent(popup, webTexts);
          if (!handledWeb) {
            await clickTextIfPresent(popup, cancelTexts);
          }
          // 处理用户指定的容器/层（如 body > div:nth-child(23)）
          await clickBySelectors(popup, popupClickSelectors);
          await popup.waitForTimeout(afterPopupWaitMs).catch(()=>{});

          const url = popup.url();
          if (url && url.includes(hostFilter)) {
            results.push({ type: 'popup', source: targetMeta[i] || null, ...parseTokens(url) });
            engine?.recordBehavior?.('token_popup_hit', { index: i, url });
          } else {
            // 尝试主框架 URL
            try {
              const f = popup.mainFrame();
              const fUrl = f?.url();
              if (fUrl && fUrl.includes(hostFilter)) {
                results.push({ type: 'popup', source: targetMeta[i] || null, ...parseTokens(fUrl) });
                engine?.recordBehavior?.('token_popup_frame_hit', { index: i, url: fUrl });
              }
            } catch {}
          }
          // 不自动关闭，保留以便后续人工/检测（或根据配置控制）
          if (config.closePopup !== false) {
            try { await popup.close(); } catch {}
          }
        }
        // 再次在主页面尝试确认“优先使用网页版”（部分站点在点击后才出现）
        try { await enforceWebPreferenceIfAny(page); } catch {}
        if (dryMode) {
          // 读取捕获到的 window.open URL
          try {
            const urls = await page.evaluate(() => Array.isArray(window.__capturedOpenUrls) ? window.__capturedOpenUrls.splice(0) : []);
            for (const u of urls) {
              if (u && u.includes(hostFilter)) {
                results.push({ type: 'dry', ...parseTokens(u) });
                engine?.recordBehavior?.('token_dry_hit', { url: u });
              }
            }
          } catch {}
        }
        const jitter = randBetween(minClickDelay, maxClickDelay);
        await sleep(jitter);
      } catch (e) {
        logger.warn(`⚠️ 点击第 ${i} 个元素失败: ${e?.message || e}`);
      }
    }

    page.off('request', mainReqListener);
    page.off('response', mainResListener);
    try { browserContext?.off?.('page', contextListener); } catch {}

    // 去重（基于标准化 URL，包含 hash）
    const seen = new Set();
    const deduped = results.filter(r => {
      if (!r.raw) return false;
      let key = r.raw;
      try { key = new URL(r.raw).toString(); } catch {}
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    // 选取一个最佳 token 作为快速变量（优先同时具备 uid 与 offerId，且来自 popup/frame 范畴）
    const priority = { popup: 3, frame: 2, request: 1, response: 1, dry: 0, tab: 2 };
    const best = deduped
      .slice()
      .sort((a,b) => (priority[b.type]||0) - (priority[a.type]||0))
      .sort((a,b) => ((b.uid?1:0)+(b.offerId?1:0)) - ((a.uid?1:0)+(a.offerId?1:0)))[0] || null;
    const srcMeta = Array.isArray(targetMeta) && targetMeta.length ? targetMeta[0] : null;

    logger.info(`✅ 捕获到 ${deduped.length} 条 token URL`);
    return {
      success: true,
      results: { tokens: deduped, bestToken: best },
      variables: {
        tokenCaptureCount: deduped.length,
        tokenHost: hostFilter,
        bestToken: best,
        expectUid: best?.uid || srcMeta?.dataNick || null,
        expectOfferId: best?.offerId || srcMeta?.offerId || null,
        expectShop: srcMeta?.shop || null
      }
    };
  }
}

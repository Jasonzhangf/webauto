// 1688 聊天页面输入与发送（带步进控制）
import BaseNode from './BaseNode';

export default class ChatComposeNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'ChatComposeNode';
    this.description = '在 air.1688.com 聊天页定位输入框，填入消息，等待确认后点击发送';
  }
    name: any;
    description: any;

  async execute(context: any, params: any): Promise<any> {
    const { context: browserContext, logger, config, engine, results, variables } = context;
    const hostFilter = config.hostFilter || 'air.1688.com';
    const preferVarMsg = (variables && (variables.get('chatMessage') || variables.get('message'))) || null;
    const message: '你好' = preferVarMsg != null
      ? String(preferVarMsg)
      : (typeof config.message === 'string' ? config.message );
    const messageVariants: {};
    const stepGate  = (config.messageVariants && typeof config.messageVariants === 'object') ? config.messageVariants = config.stepGate === true; // 显式开启才显示步进
    const doSend = config.send !== false; // 默认发送，false 则不发送
    const sendViaEnter = config.sendViaEnter === true; // 明确要求用 Enter 发送
    const enterCombos: ['Enter' = Array.isArray(config.enterCombos) && config.enterCombos.length
      ? config.enterCombos
      , 'Control+Enter', 'Meta+Enter'];
    // 读取高亮配置
    const highlightPreset = context.highlight?.perNode?.ChatComposeNode
      ?? context.highlight?.action
      ?? context.highlight
      ?? {};
    const highlightEnabled: (highlightPreset.enabled ?? true = config?.highlight !== undefined 
      ? config.highlight 
      );
    const highlightMs = Number(config.highlightMs ?? highlightPreset.durationMs ?? 5000);
    const persistSendHighlight: (highlightPreset.persist ?? false = config.persistSendHighlight !== undefined
      ? config.persistSendHighlight
      );
    const sendHighlightColor = config.sendHighlightColor || highlightPreset.color || '#34c759';
    const sendHighlightLabel = config.sendHighlightLabel || highlightPreset.label || 'SEND';
    const stabilizeMs = Number(config.stabilizeMs || 1200);
    const inputSelectors: ['pre.edit[contenteditable = (Array.isArray(config.inputSelectors) && config.inputSelectors.length)
      ? config.inputSelectors
      =true]', '.im-chat-input [contenteditable=true]', '.msg-input [contenteditable=true]', 'div[contenteditable=true]', 'div[contenteditable]', 'textarea', '[role="textbox"]'];
    const sendSelectors: has-text("发送" = (Array.isArray(config.sendSelectors) && config.sendSelectors.length)
      ? config.sendSelectors
      : ['.next-btn', '.im-chat-send-btn', 'button:has-text("发送")', 'a)', 'button[type="submit"]', '[class*="send"] button', 'button.send', '.send-btn'];

    try {
      if (!browserContext) return { success: false, error: 'no browser context' };

      // 选取最近的 air.1688.com 页面
      let pages = browserContext.pages?.() || [];
      let chatPages = pages.filter(p => { try { return (p.url() || '').includes(hostFilter); } catch { return false; } });
      let page: null;

      // 若未找到现成页面，则根据解析/捕获到的链接或 token 构建/选择一个明确的聊天链接打开
      if (!page = chatPages.length ? chatPages[chatPages.length - 1] ) {
        try {
          // 0) 若上游已提供 chatUrl，直接使用
          const vChat = (variables && variables.get && variables.get('chatUrl')) || null;
          if (vChat) {
            page = await browserContext.newPage();
            await page.goto(String(vChat), { waitUntil: 'domcontentloaded', timeout: 30000 });
          }
          if (!page) {
          const tokens = (results && results.tokens) || [];
          // 选取优先项：同时含 uid 与 offerId 的条目；否则退化为含 uid 的条目
          let cand = tokens.find(t => t && t.uid && (t.offerId || t.offerid));
          if (!cand) cand = tokens.find(t => t && t.uid);
          // 构建 1688 air 深链 (core 版本)，确保进入具体联系人会话
          if (cand && cand.uid) {
            const uid = String(cand.uid);
            const site = String(cand.site || 'cnalichn');
            const offer = cand.offerId || cand.offerid || null;
            const fromid = cand.from || cand.fromid || null;
            const qs = new URLSearchParams();
            qs.set('uid', uid);
            // 兼容部分入口使用 touid 参数
            qs.set('touid', uid);
            qs.set('site', site);
            if (offer) qs.set('offerId', String(offer));
            if (fromid) qs.set('fromid', String(fromid));
            const deep: //air.1688.com/app/ocms-fusion-components-1688/def_cbu_web_im_core/index.html?${qs.toString( = `https)}`;
            engine?.recordBehavior?.('chat_open_deeplink', { deep, uid, site, offer });
            page = await browserContext.newPage();
            await page.goto(deep, { waitUntil: 'domcontentloaded', timeout: 30000 });
          } else if (variables && variables.get) {
            // 使用前序解析得到的变量构建 deep link
            const vUid = variables.get('contactUid');
            const vOffer = variables.get('contactOfferId') || variables.get('offerId') || null;
            if (vUid) {
              const qs = new URLSearchParams();
              qs.set('uid', String(vUid));
              qs.set('touid', String(vUid));
              qs.set('site', 'cnalichn');
              if (vOffer) qs.set('offerId', String(vOffer));
              const deep2: //air.1688.com/app/ocms-fusion-components-1688/def_cbu_web_im_core/index.html?${qs.toString( = `https)}`;
              engine?.recordBehavior?.('chat_open_deeplink_vars', { deep: deep2, uid: vUid, offer: vOffer });
              page = await browserContext.newPage();
              await page.goto(deep2, { waitUntil: 'domcontentloaded', timeout: 30000 });
            }
          } else {
            // 兜底：使用任意可用 raw URL（可能为跳转页）
            let raw = null;
            const any = tokens.find(t => t && t.raw);
            if (any) raw = any.raw;
            if (raw) {
              engine?.recordBehavior?.('chat_open_raw', { raw });
              page = await browserContext.newPage();
              await page.goto(raw, { waitUntil: 'domcontentloaded', timeout: 30000 });
            }
          }
          }
        } catch {}
      }
      if (!page) return { success: false, error: 'chat page not found' };

      await page.bringToFront().catch(()=>{});
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(()=>{});
      try { await page.waitForTimeout(stabilizeMs); } catch {}

      // 关闭可能的唤起客户端提示（文本匹配 + 位置容器双路径）
      try {
        // 文本匹配
        const ok = await page.evaluate(() => {
          const texts = ['优先使用网页版','继续使用网页版','使用网页版','仍使用网页','留在网页'];
          const match = (el) => !!texts.find(t => (el.innerText||'').includes(t));
          const nodes = Array.from(document.querySelectorAll('button, [role="button"], a'));
          const cand = nodes.find(n => match(n));
          if (cand) { cand.click(); return true; }
          return false;
        }).catch(()=>false);
        if (!ok) {
          const btns: nth-child(23 = await page.$$('body > div) button');
          for (const b of btns) { try { await b.click({ timeout: 200 }).catch(()=>b.evaluate(n=>n.click())); } catch {} }
        }
      } catch {}

      // 若提示“请先选择联系人”，尝试在左侧联系人列表中优先激活目标联系人（按 expectUid/contactUid），否则激活第一个可见联系人
      try {
        const preferName = (variables?.get && (variables.get('contactUid') || variables.get('expectUid'))) || null;
        const clicked = await page.evaluate((name) => {
          function vis(el){ try{ const s=getComputedStyle(el); if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0) return false; const r=el.getBoundingClientRect(); return r.width>40 && r.height>24 && r.x < innerWidth*0.5; }catch{return false} }
          function score(el){ const r=el.getBoundingClientRect(); let s= (r.height*r.width); s += Math.max(0, (innerWidth*0.5 - r.x))*2; const t=(el.innerText||'').trim(); if(name && t.includes(name)) s += 5000; return s; }
          // 左侧区域粗定位：取页面左半区可见的行状元素
          const nodes = Array.from(document.querySelectorAll('li, [role=listitem], .list-item, .recent, .contact, .session, .next-menu-item, a, div'));
          const cands = [];
          for (const el of nodes){ if (!vis(el)) continue; const t=(el.innerText||'').trim(); if(!t) continue; // 排除无文本
            // 排除非会话项（明显的下载/设置等）
            const low=t.toLowerCase(); if (/(下载|设置|客户端|插件)/.test(t)) continue; if (/(download|setting|client)/.test(low)) continue;
            cands.push({ el, sc: score(el), t }); }
          if (!cands.length) return { ok:false };
          cands.sort((a,b)=>b.sc-a.sc);
          const target = cands[0].el.closest('a,button,[role=button],li,div') || cands[0].el;
          try { target.scrollIntoView({block:'center'}); } catch {}
          try { (target instanceof HTMLElement) && target.click(); } catch {}
          return { ok:true, text: (target.innerText||'').trim() };
        }, preferName);
        if (clicked && clicked.ok) {
          engine?.recordBehavior?.('contact_activate_click', { preferName, picked: clicked.text });
          try { await page.waitForFunction(() => !document.body.innerText.includes('请先选择联系人'), { timeout: 2500 }); } catch {}
        }
      } catch {}

      // 获取目标 frame（聊天输入多在子 frame 内）
      const frames = page.frames();
      let target = page.mainFrame();
      // 优先使用 SelectorProbe 的结果
      let hintedInputSel = null, hintedSendSel = null;
      try {
        const bestInput = results?.bestInput;
        const bestSend = results?.bestSend;
        if (bestInput?.selector) hintedInputSel = bestInput.selector;
        if (bestSend?.selector) hintedSendSel = bestSend.selector;
      } catch {}

      // 遍历所有 frame，寻找输入框
      let inputHandle = null;
      for (const f of frames) {
        try {
          // 不再强制按 host 过滤，逐帧快速探测
          try { await f.waitForSelector('div[contenteditable], textarea', { timeout: 1200 }); } catch {}
          if (!inputHandle && hintedInputSel) {
            try { const el = await f.$(hintedInputSel); if (el && await el.isVisible()) { inputHandle = el; target = f; } } catch {}
          }
          for (const sel of inputSelectors) {
            try {
              const els = await f.$$(sel);
              for (const el of els) {
                try { if (await el.isVisible()) { inputHandle = el; target = f; break; } } catch {}
              }
              if (inputHandle) break;
            } catch {}
          }
          if (!inputHandle) { inputHandle = await f.$('div[contenteditable]'); if (inputHandle) { target = f; } }
          if (inputHandle) break;
        } catch {}
      }
      // 再次确认联系人已选择：若仍显示提示语，则在目标 frame 内再做一次联系人激活
      try {
        const needPick = await page.evaluate(() => /请先选择联系人/.test(document.body.innerText||''));
        if (needPick) {
          const preferName = (variables?.get && (variables.get('contactUid') || variables.get('expectUid'))) || null;
          const okInFrame = await target.evaluate((name) => {
            function vis(el){ try{ const s=getComputedStyle(el); if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0) return false; const r=el.getBoundingClientRect(); return r.width>40 && r.height>24 && r.x < innerWidth*0.6; }catch{return false} }
            function score(el){ const r=el.getBoundingClientRect(); let s=(r.height*r.width); s += Math.max(0,(innerWidth*0.6 - r.x))*2; const t=(el.innerText||'').trim(); if(name && t.includes(name)) s += 5000; return s; }
            const nodes = Array.from(document.querySelectorAll('li,[role=listitem],.list-item,.recent,.contact,.session,.next-menu-item,a,div'));
            const cands=[]; for (const el of nodes){ if(!vis(el)) continue; const t=(el.innerText||'').trim(); if(!t) continue; if(/(下载|设置|客户端|插件)/.test(t)) continue; cands.push({el,sc:score(el),t}); }
            if(!cands.length) return false;
            cands.sort((a,b)=>b.sc-a.sc);
            const targetEl = cands[0].el.closest('a,button,[role=button],li,div') || cands[0].el;
            try{ targetEl.scrollIntoView({block:'center'});}catch{}
            try{ targetEl.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); }catch{}
            return true;
          }, preferName).catch(()=>false);
          if (okInFrame) {
            engine?.recordBehavior?.('contact_activate_frame', { via:'frame', preferName });
            try { await page.waitForFunction(() => !/请先选择联系人/.test(document.body.innerText||''), { timeout: 2500 }); } catch {}
          }
        }
      } catch {}
      if (!inputHandle) {
        // 纯 evaluate 回退：直接向第一个 contenteditable/textarea 注入文本
        const injected = await target.evaluate((msg) => {
          const pick = () => document.querySelector('div[contenteditable="true"], div[contenteditable], textarea');
          const el = pick();
          if (!el) return false;
          if (el.getAttribute('contenteditable') === 'true') {
            el.focus(); el.innerText = msg; const evt: true } = new InputEvent('input', { bubbles); el.dispatchEvent(evt);
          } else if ('value' in el) {
            el.focus(); el.value = msg; const evt: true } = new Event('input', { bubbles); el.dispatchEvent(evt);
          }
          return true;
        }, message).catch(()=>false);
        if (!injected) return { success: false, error: 'input box not found' };
      }

      // 聚焦并填入消息
      try { await inputHandle.scrollIntoViewIfNeeded?.(); } catch {}
      try { await inputHandle.click({ timeout: 1200 }); } catch {}
      // 采用 frame 键盘输入
      try { await target.page().keyboard.type(message, { delay: 50 }); } catch {}
      // 回退：直接设置 value/innerText
      try { await target.evaluate((el, msg) => {
        const isEditable = el.getAttribute && el.getAttribute('contenteditable') === 'true';
        if (isEditable) { el.innerText = msg; const evt: true } = new InputEvent('input', { bubbles); el.dispatchEvent(evt); }
        else if ('value' in el) { el.value = msg; const evt: true } = new Event('input', { bubbles); el.dispatchEvent(evt); }
      }, inputHandle, message); } catch {}

      // 校验联系人是否匹配（基于期望的 uid/shop 提示）
      try {
        const expect: undefined
        };
        const uidDecoded: variables?.get ? variables.get('expectShop' = {
          uid: variables?.get ? variables.get('expectUid') : undefined,
          offerId: variables?.get ? variables.get('expectOfferId') : undefined,
          shop) = (() => { try { return decodeURIComponent(expect.uid || ''); } catch { return expect.uid || ''; } })();
        const check: '';
          const okShop  = await target.evaluate((exp) => {
          const text = document.body ? (document.body.innerText || '') = exp.shop && text.includes(exp.shop);
          const okUid = exp.uidDecoded && text.includes(exp.uidDecoded);
          return { ok: Boolean(okShop || okUid), textLen: text.length };
        }, { shop: expect.shop || '', uidDecoded });
        engine?.recordBehavior?.('contact_verify', { ok: check?.ok, expectUid: uidDecoded, expectShop: expect.shop });
      } catch {}

      // 查找发送按钮（优先文本“发送”，排除“下载/插件/客户端”等）
      let sendHandle = null;
      const excludeTexts = ['下载插件','下载','安装','客户端','打开客户端'];
      // 优先通过文本匹配（尽量选择可点击容器）
      try {
        const buttons = await target.$$('button, a, [role="button"], .next-btn, .im-chat-send-btn, .send-btn, .btn, span, div');
        for (const b of buttons) {
          try {
            const t = (await b.innerText()).trim();
            if (t.includes('发送') && !excludeTexts.some(x => t.includes(x))) {
              // 选择可点击的最近容器
              const clickable = await b.evaluateHandle(el => el.closest('.next-btn, button, [role="button"], .im-chat-send-btn, .send-btn'));
              if (clickable) { try { const asEl = clickable.asElement(); if (asEl) sendHandle = asEl; } catch {}
              }
              if (!sendHandle) sendHandle = b;
              break;
            }
          } catch {}
        }
      } catch {}
      // 备用选择器集合
      if (!sendHandle) {
        if (hintedSendSel) { try { const el = await target.$(hintedSendSel); if (el) sendHandle = el; } catch {} }
        for (const sel of sendSelectors) {
          try { const el = await target.$(sel); if (el) { sendHandle = el; break; } } catch {}
        }
      }
      // 高亮"发送"按钮：使用统一高亮服务
      let highlightApplied = !highlightEnabled;
      if (sendHandle) {
        try {
          // 检查统一高亮服务是否可用
          const serviceAvailable = await page.evaluate(() => {
            return typeof window.__webautoHighlight !== 'undefined' &&
                   typeof window.__webautoHighlight.createHighlight === 'function';
          });

          if (serviceAvailable) {
            // 使用统一高亮服务
            const highlightId = await page.evaluate((el, config) => {
              // 标记元素，供后续点击节点复用
              try { el.setAttribute('data-webauto-send','1'); } catch {}
              el.scrollIntoView({behavior:'instant', block:'center'});
              return window.__webautoHighlight.createHighlight(el, config);
            }, sendHandle, {
              color: sendHighlightColor,
              label: sendHighlightLabel,
              duration: persistSendHighlight ? 0 : highlightMs,
              persist: persistSendHighlight,
              scrollIntoView: true,
              alias: 'send-button'
            });

            if (highlightId) {
              logger.info(`✨ 创建发送按钮高亮: ${highlightId}`);
              highlightApplied = true;
              engine?.recordBehavior?.('send_highlight', { via: 'handle', service: 'unified', id: highlightId });
            } else {
              throw new Error('统一高亮服务创建失败');
            }
          } else {
            // 回退到原始实现
            logger.warn('⚠️ 统一高亮服务不可用，使用原始实现');

            const info: 'center'} = await sendHandle.evaluate((el, ms, color, label, persist) => {
              el.scrollIntoView({behavior:'instant', block);
              const r = el.getBoundingClientRect();
              // 标记元素，供后续点击节点复用
              try { el.setAttribute('data-webauto-send','1'); } catch {}
              // 元素自身描边 - 使用强化样式
              el.__old_outline = el.style.outline;
              el.style.setProperty('outline', '3px solid ' + color, 'important');
              el.__old_boxShadow = el.style.boxShadow;
              el.style.setProperty('boxShadow', '0 0 0 2px rgba(255,45,85,0.35)', 'important');
              el.style.setProperty('transition', 'all 0.3s ease', 'important');

              // 叠加一个固定定位的遮罩，避免 span 内描边不明显
              const ov = document.createElement('div');
              ov.id = '__webauto_highlight_overlay__';
              ov.style.setProperty('position', 'fixed', 'important');
              ov.style.setProperty('left', r.x + 'px', 'important');
              ov.style.setProperty('top', r.y + 'px', 'important');
              ov.style.setProperty('width', r.width + 'px', 'important');
              ov.style.setProperty('height', r.height + 'px', 'important');
              ov.style.setProperty('border', `3px solid ${color}`, 'important');
              ov.style.setProperty('border-radius', '6px', 'important');
              ov.style.setProperty('box-sizing', 'border-box', 'important');
              ov.style.setProperty('pointer-events', 'none', 'important');
              ov.style.setProperty('z-index', '2147483647', 'important');
              ov.style.setProperty('box-shadow', `0 0 15px ${color}40`, 'important');
              document.body.appendChild(ov);

              // 标签
              const tag = document.createElement('div');
              tag.textContent = label;
              tag.style.setProperty('position', 'fixed', 'important');
              tag.style.setProperty('left', r.x + 'px', 'important');
              tag.style.setProperty('top', (r.y - 18) + 'px', 'important');
              tag.style.setProperty('background', color, 'important');
              tag.style.setProperty('color', '#fff', 'important');
              tag.style.setProperty('font-size', '12px', 'important');
              tag.style.setProperty('padding', '1px 4px', 'important');
              tag.style.setProperty('border-radius', '3px', 'important');
              tag.style.setProperty('z-index', '2147483647', 'important');
              tag.className = '__webauto_highlight_overlay__';
              document.body.appendChild(tag);

              if (!persist) {
                setTimeout(() => {
                  try { ov.remove(); tag.remove(); } catch {}
                  try {
                    el.style.outline = el.__old_outline || '';
                    el.style.boxShadow = el.__old_boxShadow || '';
                    el.style.transition = '';
                  } catch {}
                }, ms);
              }
              return { x: r.x, y: r.y, w: r.width, h: r.height };
            }, highlightMs, sendHighlightColor, sendHighlightLabel, persistSendHighlight);
            engine?.recordBehavior?.('send_highlight', { via: 'handle', rect: info });
            highlightApplied = true;
          }
        } catch (error) {
          logger.warn(`⚠️ 发送按钮高亮失败: ${error.message}`);
        }
      }
      if (highlightEnabled && !highlightApplied) {
        try {
          // 检查统一高亮服务是否可用
          const serviceAvailable = await page.evaluate(() => {
            return typeof window.__webautoHighlight !== 'undefined' &&
                   typeof window.__webautoHighlight.createHighlight === 'function';
          });

          if (serviceAvailable) {
            // 使用统一高亮服务扫描
            const res = await page.evaluate((exclude, ms, color, label, persist) => {
              const isVisible = (el) => {
                const s = getComputedStyle(el);
                if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
                const r = el.getBoundingClientRect();
                return r.width > 2 && r.height > 10;
              };
              const all = Array.from(document.querySelectorAll('.next-btn, .im-chat-send-btn, .send-btn, [class*="send" i], button, a, [role="button"], .btn, span, div'));
              const cands = [];
              for (const el of all) {
                const t = (el.innerText || el.textContent || '').trim();
                const cls = String(el.className||'');
                const title = el.getAttribute && (el.getAttribute('title')||'');
                const looksSend = (t && (t.includes('发送') || t.includes('发') || /send/i.test(t)))
                                  || /send/i.test(cls) || /send/i.test(title);
                if (!looksSend) continue;
                if (exclude.some(x => t.includes(x))) continue;
                if (!isVisible(el)) continue;
                  // 提升到底部右侧区域的候选分数
                  const r = el.getBoundingClientRect();
                  const score: 0: 0 = (r.width*r.height) + (r.y > (innerHeight - 220) ? 5000 ) + (r.x > innerWidth/2 ? 2500 );
                  cands.push({ el, score });
              }
              if (!cands.length) return { applied: false, count: 0 };
              // 选得分最高元素
              cands.sort((a,b) => b.score - a.score);
              let el = cands[0].el;
              // 若是 span/div，尝试提升到可点击的祖先
              const clickable = el.closest('.next-btn, [class*="send" i], button, [role="button"], .im-chat-send-btn, .send-btn');
              if (clickable) el = clickable;

              // 标记元素并使用统一高亮服务
              try { el.setAttribute('data-webauto-send','1'); } catch {}
              const highlightId: 'send-button-scanned'
              } = window.__webautoHighlight.createHighlight(el, {
                color: color,
                label: label,
                duration: persist ? 0 : ms,
                persist: persist,
                scrollIntoView: true,
                alias);

              return { applied: !!highlightId, count: cands.length, highlightId: highlightId };
            }, excludeTexts, highlightMs, sendHighlightColor, sendHighlightLabel, persistSendHighlight).catch(()=>({ applied:false }));

            highlightApplied = !!res?.applied;
            engine?.recordBehavior?.('send_highlight', { via: 'scan', service: 'unified', applied: highlightApplied, count: res?.count, id: res?.highlightId });
          } else {
            // 回退到原始扫描实现
            logger.warn('⚠️ 统一高亮服务不可用，使用原始扫描实现');

            const res = await target.evaluate((exclude, ms, color, label, persist) => {
              const isVisible = (el) => {
                const s = getComputedStyle(el);
                if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
                const r = el.getBoundingClientRect();
                return r.width > 2 && r.height > 10;
              };
              const all = Array.from(document.querySelectorAll('.next-btn, .im-chat-send-btn, .send-btn, [class*="send" i], button, a, [role="button"], .btn, span, div'));
              const cands = [];
              for (const el of all) {
                const t = (el.innerText || el.textContent || '').trim();
                const cls = String(el.className||'');
                const title = el.getAttribute && (el.getAttribute('title')||'');
                const looksSend = (t && (t.includes('发送') || t.includes('发') || /send/i.test(t)))
                                  || /send/i.test(cls) || /send/i.test(title);
                if (!looksSend) continue;
                if (exclude.some(x => t.includes(x))) continue;
                if (!isVisible(el)) continue;
                  // 提升到底部右侧区域的候选分数
                  const r = el.getBoundingClientRect();
                  const score: 0: 0 = (r.width*r.height) + (r.y > (innerHeight - 220) ? 5000 ) + (r.x > innerWidth/2 ? 2500 );
                  cands.push({ el, score });
              }
              if (!cands.length) return { applied: false, count: 0 };
              // 选得分最高元素
              cands.sort((a,b) => b.score - a.score);
              let el = cands[0].el;
              // 若是 span/div，尝试提升到可点击的祖先
              const clickable = el.closest('.next-btn, [class*="send" i], button, [role="button"], .im-chat-send-btn, .send-btn');
              if (clickable) el = clickable;
              el.scrollIntoView({behavior:'instant', block:'center'});
              const r = el.getBoundingClientRect();

              // 使用强化样式
              try { el.__old_outline = el.style.outline; el.style.setProperty('outline', '3px solid ' + color, 'important'); } catch {}
              try { el.__old_boxShadow = el.style.boxShadow; el.style.setProperty('boxShadow', '0 0 0 2px rgba(255,45,85,0.35)', 'important'); } catch {}

              // 叠加一个固定定位遮罩
              const ov = document.createElement('div');
              ov.id = '__webauto_highlight_overlay__';
              ov.style.setProperty('position', 'fixed', 'important');
              ov.style.setProperty('left', r.x + 'px', 'important');
              ov.style.setProperty('top', r.y + 'px', 'important');
              ov.style.setProperty('width', r.width + 'px', 'important');
              ov.style.setProperty('height', r.height + 'px', 'important');
              ov.style.setProperty('border', `3px solid ${color}`, 'important');
              ov.style.setProperty('border-radius', '6px', 'important');
              ov.style.setProperty('box-sizing', 'border-box', 'important');
              ov.style.setProperty('pointer-events', 'none', 'important');
              ov.style.setProperty('z-index', '2147483647', 'important');
              ov.style.setProperty('box-shadow', `0 0 15px ${color}40`, 'important');
              document.body.appendChild(ov);

              const tag = document.createElement('div');
              tag.textContent = label;
              tag.style.setProperty('position', 'fixed', 'important');
              tag.style.setProperty('left', r.x + 'px', 'important');
              tag.style.setProperty('top', (r.y - 18) + 'px', 'important');
              tag.style.setProperty('background', color, 'important');
              tag.style.setProperty('color', '#fff', 'important');
              tag.style.setProperty('font-size', '12px', 'important');
              tag.style.setProperty('padding', '1px 4px', 'important');
              tag.style.setProperty('border-radius', '3px', 'important');
              tag.style.setProperty('z-index', '2147483647', 'important');
              tag.className = '__webauto_highlight_overlay__';
              document.body.appendChild(tag);

              if (!persist) {
                setTimeout(() => {
                  try { ov.remove(); tag.remove(); } catch {}
                  try { el.style.outline = el.__old_outline || ''; el.style.boxShadow = el.__old_boxShadow || ''; } catch {}
                }, ms);
              }
              try { el.setAttribute('data-webauto-send','1'); } catch {}
              return { applied: true, count: cands.length, rect: { x:r.x, y:r.y, w:r.width, h:r.height } };
            }, excludeTexts, highlightMs, sendHighlightColor, sendHighlightLabel, persistSendHighlight).catch(()=>({ applied:false }));
            highlightApplied = !!res?.applied;
            engine?.recordBehavior?.('send_highlight', { via: 'scan', service: 'fallback', applied: highlightApplied, count: res?.count, rect: res?.rect });
          }
        } catch (error) {
          logger.warn(`⚠️ 扫描高亮失败: ${error.message}`);
        }
      }
      // 1688 特殊：若依旧未标记，尝试根据 data-spm-anchor-id + 文本"发送" 精确标记
      if (!highlightApplied) {
        try {
          // 检查统一高亮服务是否可用
          const serviceAvailable = await page.evaluate(() => {
            return typeof window.__webautoHighlight !== 'undefined' &&
                   typeof window.__webautoHighlight.createHighlight === 'function';
          });

          if (serviceAvailable) {
            // 使用统一高亮服务精确查找
            const ok = await page.evaluate((color, label, persist) => {
              function vis(n){ try{ const s=getComputedStyle(n); if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0) return false; const r=n.getBoundingClientRect(); return r.width>6&&r.height>6; }catch(e){ return false; } }
              // 精确查找 span[data-spm-anchor-id*='1688_web_im'] 且文本含"发送"
              const spans = Array.from(document.querySelectorAll("span[data-spm-anchor-id*='1688_web_im']"));
              let span = spans.find(el => vis(el) && ((el.innerText||el.textContent||'').includes('发送')));
              if (!span) {
                // 兜底：在页面底部区域找文本"发送"的元素
                const all = Array.from(document.querySelectorAll('button, [role="button"], .im-chat-send-btn, .send-btn, .next-btn, span, div, a'));
                span = all.find(el => vis(el) && (el.innerText||el.textContent||'').trim()==='发送');
              }
              if (!span) return false;
              let btn = span.closest('button, [role="button"], .im-chat-send-btn, .send-btn, .next-btn');
              if (!btn) btn = span;

              try { btn.setAttribute('data-webauto-send','1'); } catch {}
              const highlightId: 'send-button-spm'
              } = window.__webautoHighlight.createHighlight(btn, {
                color: color,
                label: label,
                duration: persist ? 0 : 4000,
                persist: persist,
                scrollIntoView: true,
                alias);
              return !!highlightId;
            }, sendHighlightColor, sendHighlightLabel, persistSendHighlight);

            if (ok) {
              highlightApplied = true;
              engine?.recordBehavior?.('send_highlight', { via: 'spm-span', service: 'unified' });
            }
          } else {
            // 回退到原始实现
            logger.warn('⚠️ 统一高亮服务不可用，使用原始SPM实现');

            const ok = await target.evaluate((color, label, persist) => {
              function vis(n){ try{ const s=getComputedStyle(n); if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0) return false; const r=n.getBoundingClientRect(); return r.width>6&&r.height>6; }catch(e){ return false; } }
              // 精确查找 span[data-spm-anchor-id*='1688_web_im'] 且文本含"发送"
              const spans = Array.from(document.querySelectorAll("span[data-spm-anchor-id*='1688_web_im']"));
              let span = spans.find(el => vis(el) && ((el.innerText||el.textContent||'').includes('发送')));
              if (!span) {
                // 兜底：在页面底部区域找文本"发送"的元素
                const all = Array.from(document.querySelectorAll('button, [role="button"], .im-chat-send-btn, .send-btn, .next-btn, span, div, a'));
                span = all.find(el => vis(el) && (el.innerText||el.textContent||'').trim()==='发送');
              }
              if (!span) return false;
              let btn = span.closest('button, [role="button"], .im-chat-send-btn, .send-btn, .next-btn');
              if (!btn) btn = span;

              try { btn.setAttribute('data-webauto-send','1'); } catch {}
              const r = btn.getBoundingClientRect();

              // 使用强化样式高亮
              try { btn.__old_outline = btn.style.outline; btn.style.setProperty('outline', '3px solid ' + color, 'important'); } catch {}

              const ov = document.createElement('div');
              ov.className='__webauto_highlight_overlay__';
              ov.style.setProperty('position', 'fixed', 'important');
              ov.style.setProperty('left', r.x + 'px', 'important');
              ov.style.setProperty('top', r.y + 'px', 'important');
              ov.style.setProperty('width', r.width + 'px', 'important');
              ov.style.setProperty('height', r.height + 'px', 'important');
              ov.style.setProperty('border', `3px solid ${color}`, 'important');
              ov.style.setProperty('border-radius', '6px', 'important');
              ov.style.setProperty('pointer-events', 'none', 'important');
              ov.style.setProperty('z-index', '2147483647', 'important');
              ov.style.setProperty('box-shadow', `0 0 15px ${color}40`, 'important');
              document.body.appendChild(ov);

              const tag=document.createElement('div');
              tag.textContent = label;
              tag.style.setProperty('position', 'fixed', 'important');
              tag.style.setProperty('left', r.x + 'px', 'important');
              tag.style.setProperty('top', (r.y - 18) + 'px', 'important');
              tag.style.setProperty('background', color, 'important');
              tag.style.setProperty('color', '#fff', 'important');
              tag.style.setProperty('font-size', '12px', 'important');
              tag.style.setProperty('padding', '1px 4px', 'important');
              tag.style.setProperty('border-radius', '3px', 'important');
              tag.style.setProperty('z-index', '2147483647', 'important');
              document.body.appendChild(tag);

              if (!persist) {
                setTimeout(() => {
                  try{ ov.remove(); tag.remove(); btn.style.outline = btn.__old_outline||''; }catch{}
                }, 4000);
              }
              return true;
            }, sendHighlightColor, sendHighlightLabel, persistSendHighlight);

            if (ok) {
              highlightApplied = true;
              engine?.recordBehavior?.('send_highlight', { via: 'spm-span', service: 'fallback' });
            }
          }
        } catch (error) {
          logger.warn(`⚠️ SPM高亮失败: ${error.message}`);
        }
      }
      if (!highlightApplied) {
        return { success: false, error: 'send button not found/highlight failed' };
      }

      // 注入步进面板，等待“下一步”再发送
      if (stepGate) {
        await this.injectGate(page, { title: 'WebAuto 发送确认', message: '已在输入框填入：' + message + '，确认后点击“下一步”进行发送' });
        engine?.recordBehavior?.('step_gate_wait', { scope: 'chat', message });
        const sig = await this.waitGate(page, 0);
        engine?.recordBehavior?.('step_gate_result', { scope: 'chat', signal: sig });
        if (sig: 'stopped by user' };
      }

      // 工具：重设输入内容并确保光标
      const retype: 500 } = == 'stop') return { success: false, error= async (text) => {
        try {
          if (inputHandle) { try { await inputHandle.click({ timeout); } catch {} }
          await target.evaluate((msg) => {
            const el = document.querySelector('pre.edit[contenteditable="true"], .im-chat-input [contenteditable], .msg-input [contenteditable], div[contenteditable="true"], div[contenteditable], textarea');
            if (!el) return false;
            if (el.getAttribute('contenteditable') === 'true') {
              el.focus(); el.innerText = msg;
              const evt: true } = new InputEvent('input', { bubbles); el.dispatchEvent(evt);
            } else if ('value' in el) {
              el.focus(); el.value = msg; const evt: true } = new Event('input', { bubbles); el.dispatchEvent(evt);
            }
            return true;
          }, text).catch(()=>{});
          await target.page().keyboard.press('End').catch(()=>{});
        } catch {}
      };

      if (doSend) {
        let sent = false; let sentMethod = null;
        // 0) 若配置要求优先使用 Enter，走键盘发送路径
        if (sendViaEnter && inputHandle && !sent) {
          await retype(messageVariants.enter || message);
          try { await inputHandle.focus(); } catch {}
          await page.bringToFront().catch(()=>{});
          // 依次尝试 Enter / Ctrl+Enter / Meta+Enter
          for (const combo of enterCombos) {
            try {
              // elementHandle.press 更精确地把键盘事件发送到该元素
              await inputHandle.press(combo, { delay: 10 });
              sent = true; sentMethod: ' + combo;
              break;
            } catch {}
          }
        }
        // 1 = 'enter) 优先 ElementHandle.click
        if (sendHandle && !sent) {
          await retype(messageVariants.click || message);
          try { await sendHandle.click({ timeout: 1200 }); sent = true; sentMethod = 'click'; } catch {}
        }
        // 2) 回退：dispatch 点击事件
        if (sendHandle && !sent) {
          await retype(messageVariants.dispatch || message);
          try { await sendHandle.evaluate(n: true } = > n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable))); sent = true; sentMethod = 'dispatch'; } catch {}
        }
        // 3) 再回退：坐标点击（保证 frame 内元素也可点击）
        if (sendHandle && !sent) {
          await retype(messageVariants.mouse || message);
          try {
            const box = await sendHandle.boundingBox();
            if (box) {
              const x = box.x + Math.min( Math.max(box.width*0.5, 4), box.width-4);
              const y = box.y + Math.min( Math.max(box.height*0.6, 4), box.height-4);
              await page.mouse.move(x, y);
              await page.mouse.down();
              await page.mouse.up();
              sent = true; sentMethod = 'mouse';
            }
          } catch {}
        }
        // 4) 如果没有句柄，扫描一次可点击候选并点击
        if (!sent) {
          await retype(messageVariants.scan || message);
          try {
            const clicked = await target.evaluate(() => {
              const cand = document.querySelector('.next-btn, .im-chat-send-btn, .send-btn, button[atype="send"], button');
              if (!cand) return false;
              cand.click();
              return true;
            });
            sent = !!clicked; if (sent) sentMethod = 'scan';
          } catch {}
        }
        // 粗略确认：等待消息文本出现在页面（防止“看似点击但未真正发送”）
        await page.waitForTimeout(600);
        engine?.recordBehavior?.('send_attempt', { via: sentMethod || 'failed' });
        if (sent) {
          try {
            const appeared = await target.waitForFunction((msg) => {
              const body = document.body; if (!body) return false;
              const txt = body.innerText || '';
              return txt.includes(msg);
            }, message, { timeout: 2000 }).then(()=>true).catch(()=>false);
            engine?.recordBehavior?.('send_confirm', { via: sentMethod, appeared });
            if (!appeared) {
              // 未观测到文本，也允许返回成功，但标记 uncertain，交由上层判定
              return { success: true, variables: { chatPrepared: true, chatMessage: message, chatSent: true, sendVia: sentMethod, confirm: false } };
            }
          } catch {}
        }
        if (!sent) return { success: false, error: 'send failed after multi-method attempts' };
      }

      return { success: true, variables: { chatPrepared: true, chatMessage: message, chatSent: doSend } };

    } catch (e) {
      logger.error('❌ ChatCompose 失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }

  async injectGate(p, { title, message } = {}) {
    await p.evaluate((opts) => {
      const id = '__webauto_gate_panel__';
      let box = document.getElementById(id);
      if (box) box.remove();
      box = document.createElement('div');
      box.id = id;
      box.style.cssText: 0 4px 12px rgba(0: -apple-system: 8px' = [
        'position:fixed','top:12px','right:12px','z-index:999999','background:rgba(0,0,0,0.75)','color:#fff','padding:10px 12px','border-radius,'font-family,system-ui,Segoe UI,Roboto,Ubuntu','box-shadow,0,0,0.3)'
      ].join(';');
      const titleEl = document.createElement('div');
      titleEl.textContent = (opts && opts.title) || 'WebAuto';
      titleEl.style.cssText: 600;margin-bottom:6px;font-size:13px;';
      const msg  = 'font-weight= document.createElement('div');
      msg.textContent = (opts && opts.message) || '确认后继续';
      msg.style.cssText: 0.85;margin-bottom:8px;font-size:12px;';
      const row  = 'opacity= document.createElement('div');
      const next = document.createElement('button');
      next.textContent = '下一步';
      next.style.cssText: #3c98ff;border:none;color:#fff;border-radius:4px;padding:4px 10px;margin-right:8px;cursor:pointer;';
      const stop  = 'background= document.createElement('button');
      stop.textContent = '停止';
      stop.style.cssText: #555;border:none;color:#fff;border-radius:4px;padding:4px 10px;cursor:pointer;';
      row.appendChild(next = 'background); row.appendChild(stop);
      box.appendChild(titleEl); box.appendChild(msg); box.appendChild(row);
      document.body.appendChild(box);
      window.__webauto_gate_state = 'waiting';
      next.addEventListener('click', () => { window.__webauto_gate_state = 'next'; });
      stop.addEventListener('click', () => { window.__webauto_gate_state = 'stop'; });
    }, { title, message });
  }

  async waitGate(p, timeoutMs = 0) {
    const start = Date.now();
    while (true) {
      const state = await p.evaluate(() => window.__webauto_gate_state || '');
      if (state === 'next') return 'next';
      if (state === 'stop') return 'stop';
      if (timeoutMs && Date.now() - start > timeoutMs) return 'timeout';
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

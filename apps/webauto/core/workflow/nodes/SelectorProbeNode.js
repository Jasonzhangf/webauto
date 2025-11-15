// 非侵入式选择器探测：在现有 air.1688.com 页面及其 frames 中扫描输入框/发送按钮
import BaseNode from './BaseNode.js';

function isVisible(el) {
  const style = el && el.ownerDocument && el.ownerDocument.defaultView ? el.ownerDocument.defaultView.getComputedStyle(el) : null;
  if (!style) return false;
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  return rect && rect.width > 0 && rect.height > 0;
}

function buildXPath(el) {
  if (!el || !el.parentElement) return '';
  const idx = (sib, name) => 1 + Array.from(sib.parentNode ? sib.parentNode.children : []).filter(n => n.nodeName === name).indexOf(sib);
  const segments = [];
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const name = node.nodeName.toLowerCase();
    const position = idx(node, node.nodeName);
    segments.unshift(`${name}[${position}]`);
  }
  return '//' + segments.join('/');
}

export default class SelectorProbeNode extends BaseNode {
  constructor() {
    super();
    this.name = 'SelectorProbeNode';
    this.description = '扫描页面元素并返回可见的输入框/发送按钮候选（不点击、不输入、不新开页）';
  }

  async execute(context) {
    const { context: browserContext, logger, config, engine } = context;
    const hostFilter = config.hostFilter || 'air.1688.com';
    const inputCandidates = Array.isArray(config.inputCandidates) && config.inputCandidates.length
      ? config.inputCandidates
      : ['div[contenteditable=true]', 'div[contenteditable]', 'textarea'];
    const sendCandidates = Array.isArray(config.sendCandidates) && config.sendCandidates.length
      ? config.sendCandidates
      : ['.im-chat-send-btn', '.send-btn', 'button', 'a', '[role="button"]'];
    const sendText = Array.isArray(config.sendText) && config.sendText.length ? config.sendText : ['发送', 'Send'];

    try {
      if (!browserContext) return { success: false, error: 'no browser context' };
      const pages = browserContext.pages?.() || [];
      const targets = pages.filter(p => { try { return (p.url() || '').includes(hostFilter); } catch { return false; } });
      if (!targets.length) return { success: false, error: 'no target page' };

      const allMatches = [];
      for (const p of targets) {
        try {
          const frames = p.frames();
          for (const f of frames) {
            try {
              const url = f.url() || '';
              if (!url.includes(hostFilter)) continue;
              const result = await f.evaluate((cfg) => {
                const out = { frameUrl: location.href, inputs: [], sends: [] };
                const vis = (el) => {
                  const style = getComputedStyle(el);
                  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                  const r = el.getBoundingClientRect();
                  return r && r.width > 0 && r.height > 0;
                };
                const xPath = (el) => {
                  if (!el || !el.parentElement) return '';
                  const idx = (sib, name) => 1 + Array.from(sib.parentNode ? sib.parentNode.children : []).filter(n => n.nodeName === name).indexOf(sib);
                  const segments = [];
                  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
                    const name = node.nodeName.toLowerCase();
                    const position = idx(node, node.nodeName);
                    segments.unshift(`${name}[${position}]`);
                  }
                  return '//' + segments.join('/');
                };
                // 输入候选
                for (const sel of cfg.inputCandidates) {
                  try {
                    const els = Array.from(document.querySelectorAll(sel));
                    for (const el of els) {
                      const ok = vis(el);
                      out.inputs.push({ selector: sel, visible: ok, xpath: xPath(el) });
                    }
                  } catch {}
                }
                // 发送按钮候选
                const textTargets = Array.from(document.querySelectorAll(["button","a","[role='button']",".im-chat-send-btn",".send-btn"].join(',')));
                for (const el of textTargets) {
                  try {
                    const t = (el.innerText || el.textContent || '').trim();
                    if (!t) continue;
                    const hit = (cfg.sendText || []).some(k => t.includes(k));
                    if (hit) {
                      out.sends.push({ selector: 'text:'+t, visible: vis(el), xpath: xPath(el), text: t });
                    }
                  } catch {}
                }
                for (const sel of cfg.sendCandidates) {
                  try {
                    const els = Array.from(document.querySelectorAll(sel));
                    for (const el of els) {
                      const t = (el.innerText || el.textContent || '').trim();
                      out.sends.push({ selector: sel, visible: vis(el), xpath: xPath(el), text: t });
                    }
                  } catch {}
                }
                return out;
              }, { inputCandidates, sendCandidates, sendText });
              allMatches.push(result);
            } catch {}
          }
        } catch {}
      }

      // 选择最佳：第一个可见的输入、发送（排除“下载插件/下载/安装/客户端”等误选）
      const excludeTexts = ['下载插件','下载','安装','客户端','打开客户端'];
      let bestInput = null, bestSend = null;
      for (const r of allMatches) {
        if (!bestInput) bestInput = (r.inputs || []).find(i => i.visible);
        if (!bestSend) {
          bestSend = (r.sends || []).find(s => s.visible && (s.text || '').includes('发送'));
          if (!bestSend) {
            bestSend = (r.sends || []).find(s => s.visible && !excludeTexts.some(x => (s.text||'').includes(x)));
          }
        }
      }

      engine?.recordBehavior?.('selector_probe', { bestInput, bestSend });
      return { success: true, results: { probe: allMatches, bestInput, bestSend } };
    } catch (e) {
      logger.error('❌ SelectorProbe 失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }
}

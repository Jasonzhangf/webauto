// 在目标页面注入“下一步/停止”控制面板，并可阻塞等待信号
import BaseNode from './BaseNode.js';

export default class GateOverlayNode extends BaseNode {
  constructor() {
    super();
    this.name = 'GateOverlayNode';
    this.description = '向页面注入控制面板（下一步/停止），可选阻塞等待用户点击';
  }

  async execute(context) {
    const { context: browserContext, logger, config, engine } = context;
    const hostFilter = config.hostFilter || '';
    const title = config.title || 'WebAuto 控制面板';
    const message = config.message || '点击“下一步”继续';
    const block = config.block !== false; // 默认阻塞等待
    const timeoutMs = Number(config.timeoutMs || 0); // 默认不超时

    try {
      if (!browserContext) return { success: false, error: 'no browser context' };
      const pages = browserContext.pages?.() || [];
      let page = null;
      if (hostFilter) {
        const matches = pages.filter(p => { try { return (p.url() || '').includes(hostFilter); } catch { return false; } });
        page = matches.length ? matches[matches.length - 1] : null;
      }
      if (!page) page = pages[pages.length - 1] || null;
      if (!page) return { success: false, error: 'no page for overlay' };

      await page.bringToFront().catch(()=>{});

      await page.evaluate((opts) => {
        const id = '__webauto_gate_panel__';
        let box = document.getElementById(id);
        if (box) box.remove();
        box = document.createElement('div');
        box.id = id;
        box.style.cssText = [
          'position:fixed','top:12px','right:12px','z-index:999999','background:rgba(0,0,0,0.78)','color:#fff','padding:10px 12px','border-radius:8px','font-family:-apple-system,system-ui,Segoe UI,Roboto,Ubuntu','box-shadow:0 4px 12px rgba(0,0,0,0.3)'
        ].join(';');
        const t = document.createElement('div'); t.textContent = opts.title; t.style.cssText='font-weight:600;margin-bottom:6px;font-size:13px;';
        const m = document.createElement('div'); m.textContent = opts.message; m.style.cssText='opacity:0.85;margin-bottom:8px;font-size:12px;';
        const row = document.createElement('div');
        const next = document.createElement('button'); next.textContent = '下一步'; next.style.cssText='background:#3c98ff;border:none;color:#fff;border-radius:4px;padding:4px 10px;margin-right:8px;cursor:pointer;';
        const stop = document.createElement('button'); stop.textContent = '停止'; stop.style.cssText='background:#555;border:none;color:#fff;border-radius:4px;padding:4px 10px;cursor:pointer;';
        row.appendChild(next); row.appendChild(stop);
        box.appendChild(t); box.appendChild(m); box.appendChild(row);
        document.body.appendChild(box);
        window.__webauto_gate_state = 'waiting';
        next.addEventListener('click', () => { window.__webauto_gate_state = 'next'; });
        stop.addEventListener('click', () => { window.__webauto_gate_state = 'stop'; });
      }, { title, message });

      engine?.recordBehavior?.('gate_overlay_show', { title, message });

      if (!block) return { success: true, variables: { gateSignal: 'shown' } };

      const start = Date.now();
      while (true) {
        const state = await page.evaluate(() => window.__webauto_gate_state || '');
        if (state === 'next' || state === 'stop') {
          engine?.recordBehavior?.('gate_overlay_signal', { signal: state });
          return { success: state === 'next', variables: { gateSignal: state }, error: state === 'stop' ? 'stopped by user' : undefined };
        }
        if (timeoutMs && Date.now() - start > timeoutMs) {
          engine?.recordBehavior?.('gate_overlay_timeout', {});
          return { success: false, error: 'gate timeout', variables: { gateSignal: 'timeout' } };
        }
        await new Promise(r => setTimeout(r, 300));
      }

    } catch (e) {
      logger.error('❌ GateOverlay 注入失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }
}


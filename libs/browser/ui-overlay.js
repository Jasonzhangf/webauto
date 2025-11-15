/**
 * 浏览器 UI Overlay 注入模块
 * - 提供一个右上角悬浮菜单（显示 sessionId / profileId 等）
 * - 使用 Shadow DOM 与页面内容隔离
 */

/**
 * 构造注入悬浮菜单的脚本
 * @param {{ sessionId: string, profileId?: string }} param0
 * @returns {string}
 */
export function buildOverlayScript({ sessionId, profileId = 'default' }) {
  const sid = JSON.stringify(sessionId);
  const pid = JSON.stringify(profileId);
  return `(() => {
    try {
      const ROOT_ID = '__webauto_overlay_root__';
      if (document.getElementById(ROOT_ID)) return;

      const root = document.createElement('div');
      root.id = ROOT_ID;
      root.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;pointer-events:none;';

      const host = document.createElement('div');
      root.appendChild(host);

      const shadow = host.attachShadow({ mode: 'open' });
      const panel = document.createElement('div');
      panel.style.cssText = 'pointer-events:auto;background:rgba(0,0,0,0.7);color:#fff;padding:6px 10px;border-radius:8px;font:12px -apple-system,system-ui;display:flex;align-items:center;gap:6px;box-shadow:0 0 8px rgba(0,0,0,0.5);';

      const sidLabel = document.createElement('span');
      sidLabel.style.opacity = '0.8';
      sidLabel.textContent = 'SID:';
      const sidVal = document.createElement('span');
      sidVal.id = '__waOverlay_sid';
      sidVal.textContent = ${sid};

      const pidLabel = document.createElement('span');
      pidLabel.style.opacity = '0.8';
      pidLabel.textContent = 'Profile:';
      const pidVal = document.createElement('span');
      pidVal.id = '__waOverlay_pid';
      pidVal.textContent = ${pid};

      panel.appendChild(sidLabel);
      panel.appendChild(sidVal);
      panel.appendChild(pidLabel);
      panel.appendChild(pidVal);

      shadow.appendChild(panel);
      document.documentElement.appendChild(root);

      window.__webautoOverlay = {
        update(info){
          try {
            if (!info) return;
            if (info.sessionId) {
              const el = shadow.getElementById('__waOverlay_sid');
              if (el) el.textContent = String(info.sessionId);
            }
            if (info.profileId) {
              const el = shadow.getElementById('__waOverlay_pid');
              if (el) el.textContent = String(info.profileId);
            }
          } catch {}
        }
      };
    } catch {}
  })();`;
}

/**
 * 在 Playwright BrowserContext 上安装 overlay init 脚本
 * @param context
 * @param {{ sessionId: string, profileId?: string }} param1
 */
export async function installOverlay(context, { sessionId, profileId = 'default' }) {
  try {
    const script = buildOverlayScript({ sessionId, profileId });
    await context.addInitScript(script);
  } catch {
    // overlay 注入失败不影响主流程
  }
}


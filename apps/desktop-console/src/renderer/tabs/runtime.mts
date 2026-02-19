import { createEl, section } from '../ui-components.mts';

type SessionState = {
  profileId: string;
  sessionId?: string;
  currentUrl?: string;
  lastPhase?: string;
  lastActiveAt?: string;
  createdAt?: string;
  status?: string;
};

function toMap(obj: any): Record<string, string> {
  return obj && typeof obj === 'object' ? (obj as any) : {};
}

function formatAge(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const ms = Date.now() - t;
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h`;
}

function titleFor(profileId: string, alias: string, color: string) {
  // Window title is the only cross-browser surface we can touch without injecting UI overlays.
  return `${color} ${alias || profileId} | ${profileId}`;
}

function headerLabelFor(profileId: string, alias: string) {
  return alias ? `${alias} (${profileId})` : profileId;
}

export function renderRuntime(root: HTMLElement, ctx: any) {
  const status = createEl('div', { className: 'muted' }, ['']);
  const list = createEl('div', { className: 'runtime-list' });
  const refreshBtn = createEl('button', { className: 'secondary' }, ['刷新 runtime']) as HTMLButtonElement;

  let sessions: SessionState[] = [];

  async function refresh() {
    status.textContent = 'loading...';
    const res = await window.api.runtimeListSessions().catch(() => []);
    sessions = Array.isArray(res) ? res : [];
    status.textContent = `running=${sessions.length}`;
    renderList();
  }

  function renderList() {
    list.textContent = '';
    const aliases = toMap(ctx.settings?.profileAliases);
    const colors = toMap(ctx.settings?.profileColors);

    if (sessions.length === 0) {
      list.appendChild(createEl('div', { className: 'muted' }, ['暂无运行中的 session（或 Unified API 尚未同步 session 状态）']));
      return;
    }

    for (const s of sessions) {
      const profileId = String(s?.profileId || '');
      const alias = String(aliases[profileId] || '');
      const color = String(colors[profileId] || '#cccccc');
      const showName = alias ? `${alias}` : profileId;

      const row = createEl('div', { className: 'runtime-item' });
      const head = createEl('div', { className: 'runtime-head' });
      const badge = createEl('div', { className: 'runtime-badge', style: `background:${color}` }, ['']);
      const name = createEl('div', { className: 'runtime-name' }, [showName]);
      const meta = createEl('div', { className: 'runtime-meta muted' }, [
        profileId !== showName ? `(${profileId})` : '',
        s?.currentUrl ? `  url=${String(s.currentUrl)}` : '',
      ]);
      const phase = createEl('div', { className: 'runtime-phase muted' }, [s?.lastPhase ? `phase=${String(s.lastPhase)}` : '']);
      const age = createEl('div', { className: 'runtime-age muted' }, [s?.lastActiveAt ? `active ${formatAge(s.lastActiveAt)}` : '']);

      head.appendChild(badge);
      head.appendChild(createEl('div', { style: 'display:flex; flex-direction:column; gap:2px; min-width:0;' }, [name, meta, phase, age]));

      const controls = createEl('div', { className: 'runtime-controls' });
      const colorInput = createEl('input', { type: 'color', value: color }) as HTMLInputElement;
      colorInput.onchange = async () => {
        const next = { ...toMap(ctx.settings?.profileColors) };
        next[profileId] = String(colorInput.value || '#cccccc');
        const updated = await window.api.settingsSet({ profileColors: next }).catch(() => null);
        if (updated) ctx.settings = updated;
        const alias2 = String(toMap(ctx.settings?.profileAliases)[profileId] || '');
        const nextColor = String(colorInput.value || '#cccccc');
        const title = titleFor(profileId, alias2, nextColor);
        await window.api.runtimeSetBrowserTitle({ profileId, title }).catch(() => null);
        await window.api.runtimeSetHeaderBar({ profileId, label: headerLabelFor(profileId, alias2), color: nextColor }).catch(() => null);
        void refresh();
      };

      const btnFocus = createEl('button', { className: 'secondary' }, ['focus']) as HTMLButtonElement;
      btnFocus.onclick = async () => {
        await window.api.runtimeFocus({ profileId }).catch(() => null);
      };

      const btnMark = createEl('button', { className: 'secondary' }, ['mark']) as HTMLButtonElement;
      btnMark.onclick = async () => {
        const alias2 = String(toMap(ctx.settings?.profileAliases)[profileId] || '');
        await window.api.runtimeSetHeaderBar({ profileId, label: headerLabelFor(profileId, alias2), color }).catch(() => null);
      };

      const btnRestart = createEl('button', { className: 'secondary' }, ['phase1']) as HTMLButtonElement;
      btnRestart.onclick = async () => {
        await window.api.runtimeRestartPhase1({ profileId }).catch(() => null);
      };

      const btnKill = createEl('button', { className: 'danger' }, ['kill']) as HTMLButtonElement;
      btnKill.onclick = async () => {
        if (!confirm(`关闭 session: ${profileId}?`)) return;
        await window.api.runtimeKill({ profileId }).catch(() => null);
        await refresh();
      };

      controls.appendChild(colorInput);
      controls.appendChild(btnFocus);
      controls.appendChild(btnMark);
      controls.appendChild(btnRestart);
      controls.appendChild(btnKill);

      row.appendChild(head);
      row.appendChild(controls);
      list.appendChild(row);
    }
  }

  // Auto refresh on settings change (aliases/colors updated in Preflight)
  window.api.onSettingsChanged((next: any) => {
    ctx.settings = next;
    renderList();
  });

  refreshBtn.onclick = () => void refresh();

  root.appendChild(section('Runtime Dashboard', [
    createEl('div', { style: 'display:flex; gap:8px; align-items:center;' }, [refreshBtn, status]),
    list,
    createEl('div', { className: 'muted' }, [
      '提示：颜色与 alias 会持久化到 settings；颜色也会 best-effort 写入浏览器页面 title（用于在浏览器窗口标题/Tab 上区分）。',
    ]),
  ]));

  void refresh();
}

import { createEl, labeledInput, section } from '../ui-components.mts';
import { resolveWebautoRoot } from '../path-helpers.mts';

function buildArgs(parts: string[]) {
  return parts.filter((x) => x != null && String(x).trim() !== '');
}

export function renderPreflight(root: HTMLElement, ctx: any) {
  const filterInput = createEl('input', { value: '', placeholder: '过滤：profileId / alias / platform' }) as HTMLInputElement;
  const selectAllBox = createEl('input', { type: 'checkbox' }) as HTMLInputElement;
  const selectionHint = createEl('div', { className: 'muted' }, ['selected=0']);
  const onlyMissingFp = createEl('input', { type: 'checkbox' }) as HTMLInputElement;
  const regenPlatform = createEl('select') as HTMLSelectElement;
  [
    { value: 'random', label: 'random(win/mac)' },
    { value: 'windows', label: 'windows' },
    { value: 'macos', label: 'macos' },
  ].forEach((x) => regenPlatform.appendChild(createEl('option', { value: x.value }, [x.label])));
  regenPlatform.value = 'random';

  const statusBox = createEl('div', { className: 'muted' }, ['']);
  const listBox = createEl('div', { className: 'list' });
  const batchDeleteBtn = createEl('button', { className: 'danger' }, ['批量删除选中 profile']) as HTMLButtonElement;
  const batchDeleteFp = createEl('input', { type: 'checkbox' }) as HTMLInputElement;

  let cachedScan: any = null;
  const webautoRoot = resolveWebautoRoot(ctx.settings?.downloadRoot || '', window.api);

  function getAliasMap(): Record<string, string> {
    const m = ctx.settings?.profileAliases;
    return m && typeof m === 'object' ? m : {};
  }

  async function saveAlias(profileId: string, alias: string) {
    const nextAliases = { ...getAliasMap() };
    const key = String(profileId || '').trim();
    const val = String(alias || '').trim();
    if (!key) return;
    if (!val) delete nextAliases[key];
    else nextAliases[key] = val;
    const next = await window.api.settingsSet({ profileAliases: nextAliases });
    ctx.settings = next;
    // main process broadcasts settings:changed; other tabs will refresh automatically.
  }

  function toLower(x: any) {
    return String(x || '').toLowerCase();
  }

  function renderList() {
    listBox.textContent = '';
    const entries: any[] = cachedScan?.entries || [];
    const q = toLower(filterInput.value.trim());
    const aliases = getAliasMap();

    const filtered = entries.filter((e) => {
      if (onlyMissingFp.checked && e.fingerprint) return false;
      if (!q) return true;
      const hay = [
        e.profileId,
        aliases[e.profileId] || '',
        e.fingerprint?.platform || '',
        e.fingerprint?.originalPlatform || '',
        e.fingerprint?.osVersion || '',
        e.fingerprint?.userAgent || '',
      ]
        .map(toLower)
        .join(' ');
      return hay.includes(q);
    });

    const header = createEl('div', {
      className: 'item',
      // One-row-per-profile, keep actions on a single line; avoid horizontal scroll.
      style: 'display:grid; grid-template-columns: 32px 180px 180px 120px minmax(0,1fr) 360px; gap:8px; font-weight:700; align-items:center; min-width:0;',
    });
    header.appendChild(createEl('div', {}, ['sel']));
    header.appendChild(createEl('div', {}, ['profileId']));
    header.appendChild(createEl('div', {}, ['alias']));
    header.appendChild(createEl('div', {}, ['fingerprint']));
    header.appendChild(createEl('div', {}, ['userAgent']));
    header.appendChild(createEl('div', {}, ['actions']));
    listBox.appendChild(header);

    for (const e of filtered) {
      const fp = e.fingerprint;
      const fpLabel = fp
        ? `${fp.originalPlatform || fp.platform || 'unknown'}${fp.osVersion ? ` ${fp.osVersion}` : ''}`
        : '(missing)';

      const aliasInput = createEl('input', {
        value: String(aliases[e.profileId] || ''),
        placeholder: 'alias (可选)',
      }) as HTMLInputElement;

      const row = createEl('div', {
        className: 'item',
        style: 'display:grid; grid-template-columns: 32px 180px 180px 120px minmax(0,1fr) 360px; gap:8px; align-items:center; min-width:0;',
      });
      const rowSelect = createEl('input', { type: 'checkbox' }) as HTMLInputElement;
      rowSelect.dataset.profileId = String(e.profileId || '');
      rowSelect.onchange = () => updateSelectionHint();
      row.appendChild(rowSelect);
      row.appendChild(createEl('div', {}, [String(e.profileId)]));
      row.appendChild(createEl('div', { style: 'min-width:0;' }, [aliasInput]));
      row.appendChild(createEl('div', { className: 'muted' }, [fpLabel]));
      row.appendChild(
        createEl(
          'div',
          { className: 'muted', style: 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;', title: String(fp?.userAgent || '') },
          [String(fp?.userAgent || '')],
        ),
      );

      const actions = createEl('div', { style: 'display:flex; gap:6px; flex-wrap:nowrap; align-items:center; overflow:hidden; justify-content:flex-end;' });
      const btnOpenProfile = createEl('button', { className: 'secondary' }, ['打开']);
      const btnOpenFp = createEl('button', { className: 'secondary' }, ['指纹']);
      const btnSaveAlias = createEl('button', { className: 'secondary' }, ['保存']);
      // Reduce width for the frequently-used action.
      const btnRegenFp = createEl('button', {}, ['重生']);
      const btnDelFp = createEl('button', { className: 'secondary' }, ['删指']);
      const btnDelProfile = createEl('button', { className: 'danger' }, ['删档']);

      btnOpenProfile.onclick = () => void window.api.osOpenPath(e.profileDir);
      btnOpenFp.onclick = () => void window.api.osOpenPath(e.fingerprintPath);
      btnSaveAlias.onclick = () => void saveAlias(e.profileId, aliasInput.value);
      aliasInput.onkeydown = (ev) => {
        if (ev.key === 'Enter') void saveAlias(e.profileId, aliasInput.value);
      };
      btnRegenFp.onclick = async () => {
        ctx.clearLog();
        const platform = String(regenPlatform.value || 'random');
        const out = await window.api.fingerprintRegenerate({ profileId: e.profileId, platform });
        ctx.appendLog(JSON.stringify(out, null, 2));
        await refreshScan();
      };
      btnDelFp.onclick = async () => {
        if (!confirm(`删除 fingerprint: ${e.profileId}?`)) return;
        ctx.clearLog();
        const out = await window.api.fingerprintDelete({ profileId: e.profileId });
        ctx.appendLog(JSON.stringify(out, null, 2));
        await refreshScan();
      };
      btnDelProfile.onclick = async () => {
        if (!confirm(`删除 profile 目录: ${e.profileId}?\n(可选：同时删除指纹文件)`)) return;
        const alsoFp = confirm(`同时删除 ${e.profileId} 的 fingerprint 文件？`);
        ctx.clearLog();
        const out = await window.api.profileDelete({ profileId: e.profileId, deleteFingerprint: alsoFp });
        ctx.appendLog(JSON.stringify(out, null, 2));
        await refreshScan();
      };

      actions.appendChild(btnOpenProfile);
      actions.appendChild(btnOpenFp);
      actions.appendChild(btnSaveAlias);
      actions.appendChild(btnRegenFp);
      actions.appendChild(btnDelFp);
      actions.appendChild(btnDelProfile);
      row.appendChild(actions);

      listBox.appendChild(row);
    }
    updateSelectionHint();
  }

  function updateSelectionHint() {
    const selected = listBox.querySelectorAll('input[type="checkbox"][data-profile-id]:checked').length;
    selectionHint.textContent = `selected=${selected}`;
  }

  async function batchDeleteSelectedProfiles() {
    const selected: string[] = [];
    listBox.querySelectorAll('input[type="checkbox"][data-profile-id]').forEach((el) => {
      const cb = el as HTMLInputElement;
      if (!cb.checked) return;
      const id = String(cb.dataset.profileId || '').trim();
      if (id) selected.push(id);
    });
    if (selected.length === 0) return;

    if (!confirm(`批量删除 ${selected.length} 个 profile？`)) return;
    const deleteFp = batchDeleteFp.checked && confirm(`同时删除这 ${selected.length} 个 profile 的 fingerprint 文件？`);

    ctx.clearLog();
    for (const profileId of selected) {
      try {
        const out = await window.api.profileDelete({ profileId, deleteFingerprint: deleteFp });
        ctx.appendLog(JSON.stringify(out, null, 2));
      } catch (err: any) {
        ctx.appendLog(`[batch-delete] ${profileId} failed: ${err?.message || String(err)}`);
      }
    }
    await refreshScan();
  }

  async function refreshScan() {
    const out = await window.api.profilesScan();
    cachedScan = out;
    statusBox.textContent = `profiles=${out?.entries?.length || 0} profilesRoot=${out?.profilesRoot || ''} fingerprintsRoot=${out?.fingerprintsRoot || ''}`;
    renderList();
  }

  const toolbar = createEl('div', { className: 'row' }, [
    labeledInput('filter', filterInput),
    createEl('div', { style: 'display:flex; flex-direction:column; gap:6px;' }, [
      createEl('label', {}, ['select all']),
      selectAllBox,
    ]),
    createEl('div', { style: 'display:flex; flex-direction:column; gap:6px;' }, [
      createEl('label', {}, ['del fingerprint']),
      batchDeleteFp,
    ]),
    createEl('div', { style: 'display:flex; flex-direction:column; gap:6px;' }, [
      createEl('label', {}, ['only missing fingerprint']),
      onlyMissingFp,
    ]),
    labeledInput('regen platform', regenPlatform),
    createEl('button', { className: 'secondary' }, ['刷新列表']),
    createEl('button', {}, ['批量补齐缺失指纹（脚本）']),
    batchDeleteBtn,
  ]);
  (toolbar.children[3] as HTMLButtonElement).onclick = () => void refreshScan();
  (toolbar.children[4] as HTMLButtonElement).onclick = async () => {
    ctx.clearLog();
    const args = buildArgs([window.api.pathJoin('scripts', 'migrate-fingerprints.mjs')]);
    await window.api.cmdSpawn({ title: 'migrate fingerprints', cwd: '', args, groupKey: 'profilepool' });
    setTimeout(() => void refreshScan(), 1000);
  };
  batchDeleteBtn.onclick = () => void batchDeleteSelectedProfiles();

  filterInput.oninput = () => renderList();
  onlyMissingFp.onchange = () => renderList();
  selectAllBox.onchange = () => {
    const checked = selectAllBox.checked;
    listBox.querySelectorAll('input[type="checkbox"][data-profile-id]').forEach((el) => {
      (el as HTMLInputElement).checked = checked;
    });
    updateSelectionHint();
  };

  root.appendChild(
    section('Profiles + Fingerprints (CRUD)', [
      toolbar,
      statusBox,
      selectionHint,
      listBox,
      createEl('div', { className: 'muted' }, [`提示：profile 与 fingerprint 的真实路径均在 ${webautoRoot} 下；alias 只影响 UI 显示，不影响 profileId。`]),
    ]),
  );

  // keep: ProfilePool helper (create profiles + bulk login)
  const keywordInput = createEl('input', { value: ctx.settings?.defaultKeyword || '', placeholder: '例如：工作服' }) as HTMLInputElement;
  const ensureCountInput = createEl('input', { value: '0', type: 'number', min: '0' }) as HTMLInputElement;
  const timeoutInput = createEl('input', { value: String(ctx.settings?.timeouts?.loginTimeoutSec || 900), type: 'number', min: '30' }) as HTMLInputElement;
  const keepSession = createEl('input', { type: 'checkbox' }) as HTMLInputElement;
  const poolListBox = createEl('div', { className: 'list' });
  const poolStatus = createEl('div', { className: 'muted' }, ['']);

  async function poolList() {
    ctx.clearLog();
    const kw = keywordInput.value.trim();
    if (!kw) return;
    const out = await window.api.cmdRunJson({
      title: 'profilepool list',
      cwd: '',
      args: buildArgs([window.api.pathJoin('scripts', 'profilepool.mjs'), 'list', kw, '--json']),
    });
    poolListBox.textContent = '';
    if (!out?.ok || !out?.json) {
      poolListBox.appendChild(createEl('div', { className: 'item' }, ['(failed)']));
      return;
    }
    const profiles = out.json.profiles || [];
    profiles.forEach((p: string) => poolListBox.appendChild(createEl('div', { className: 'item' }, [p])));
    poolStatus.textContent = `count=${profiles.length} root=${out.json.root}`;
    await refreshScan();
  }

  async function poolAdd() {
    ctx.clearLog();
    const kw = keywordInput.value.trim();
    if (!kw) return;
    const out = await window.api.cmdRunJson({
      title: 'profilepool add',
      cwd: '',
      args: buildArgs([window.api.pathJoin('scripts', 'profilepool.mjs'), 'add', kw, '--json']),
    });
    ctx.appendLog(JSON.stringify(out?.json || out, null, 2));
    await poolList();
  }

  async function poolLogin() {
    ctx.clearLog();
    const kw = keywordInput.value.trim();
    if (!kw) return;
    const ensureCount = Math.max(0, Math.floor(Number(ensureCountInput.value || '0')));
    const timeoutSec = Math.max(30, Math.floor(Number(timeoutInput.value || '900')));
    const args = buildArgs([
      window.api.pathJoin('scripts', 'profilepool.mjs'),
      'login',
      kw,
      ...(ctx.settings?.unifiedApiUrl ? ['--unified-api', String(ctx.settings.unifiedApiUrl)] : []),
      ...(ctx.settings?.browserServiceUrl ? ['--browser-service', String(ctx.settings.browserServiceUrl)] : []),
      '--timeout-sec',
      String(timeoutSec),
      ...(ensureCount > 0 ? ['--ensure-count', String(ensureCount)] : []),
      ...(keepSession.checked ? ['--keep-session'] : []),
    ]);
    await window.api.cmdSpawn({ title: `profilepool login ${kw}`, cwd: '', args, groupKey: 'profilepool' });
  }

  const poolActions = createEl('div', { className: 'row' }, [
    createEl('button', { className: 'secondary' }, ['扫描池']),
    createEl('button', { className: 'secondary' }, ['新增一个']),
    createEl('button', {}, ['批量登录/补登录']),
  ]);
  (poolActions.children[0] as HTMLButtonElement).onclick = () => void poolList();
  (poolActions.children[1] as HTMLButtonElement).onclick = () => void poolAdd();
  (poolActions.children[2] as HTMLButtonElement).onclick = () => void poolLogin();

  root.appendChild(
    section('ProfilePool', [
      createEl('div', { className: 'row' }, [
        labeledInput('keyword', keywordInput),
        labeledInput('ensure-count (可选)', ensureCountInput),
        labeledInput('login timeout (sec)', timeoutInput),
        createEl('div', { style: 'display:flex; flex-direction:column; gap:6px;' }, [
          createEl('label', {}, ['keep-session']),
          keepSession,
        ]),
      ]),
      poolActions,
      poolStatus,
      poolListBox,
    ]),
  );

  void refreshScan();
}

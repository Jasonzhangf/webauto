import { createEl, labeledInput, section } from '../ui-components.mts';

function buildArgs(parts: string[]) {
  return parts.filter((x) => x != null && String(x).trim() !== '');
}

export function renderPreflight(root: HTMLElement, ctx: any) {
  const filterInput = createEl('input', { value: '', placeholder: '过滤：profileId / alias / platform' }) as HTMLInputElement;
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

  let cachedScan: any = null;

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
      style: 'display:grid; grid-template-columns: 220px 220px 120px 1fr 420px; gap:10px; font-weight:700;',
    });
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
        style: 'display:grid; grid-template-columns: 220px 220px 120px 1fr 420px; gap:10px; align-items:center;',
      });

      row.appendChild(createEl('div', {}, [String(e.profileId)]));
      row.appendChild(aliasInput);
      row.appendChild(createEl('div', { className: 'muted' }, [fpLabel]));
      row.appendChild(createEl('div', { className: 'muted', title: String(fp?.userAgent || '') }, [String(fp?.userAgent || '')]));

      const actions = createEl('div', { style: 'display:flex; gap:8px; flex-wrap:wrap; align-items:center;' });
      const btnOpenProfile = createEl('button', { className: 'secondary' }, ['打开 profile']);
      const btnOpenFp = createEl('button', { className: 'secondary' }, ['打开指纹']);
      const btnSaveAlias = createEl('button', { className: 'secondary' }, ['保存 alias']);
      const btnRegenFp = createEl('button', {}, ['重生成指纹']);
      const btnDelFp = createEl('button', { className: 'secondary' }, ['删除指纹']);
      const btnDelProfile = createEl('button', { className: 'danger' }, ['删除 profile']);

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
      createEl('label', {}, ['only missing fingerprint']),
      onlyMissingFp,
    ]),
    labeledInput('regen platform', regenPlatform),
    createEl('button', { className: 'secondary' }, ['刷新列表']),
    createEl('button', {}, ['批量补齐缺失指纹（脚本）']),
  ]);
  (toolbar.children[3] as HTMLButtonElement).onclick = () => void refreshScan();
  (toolbar.children[4] as HTMLButtonElement).onclick = async () => {
    ctx.clearLog();
    const args = buildArgs([window.api.pathJoin('scripts', 'migrate-fingerprints.mjs')]);
    await window.api.cmdSpawn({ title: 'migrate fingerprints', cwd: '', args, groupKey: 'profilepool' });
    setTimeout(() => void refreshScan(), 1000);
  };

  filterInput.oninput = () => renderList();
  onlyMissingFp.onchange = () => renderList();

  root.appendChild(
    section('Profiles + Fingerprints (CRUD)', [
      toolbar,
      statusBox,
      listBox,
      createEl('div', { className: 'muted' }, ['提示：profile 与 fingerprint 的真实路径均在 ~/.webauto 下；alias 只影响 UI 显示，不影响 profileId。']),
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

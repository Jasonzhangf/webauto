import { createEl, labeledInput, section } from '../ui-components.mts';
import { resolveWebautoRoot } from '../path-helpers.mts';

function buildArgs(parts: string[]) {
  return parts.filter((x) => x != null && String(x).trim() !== '');
}

const XHS_NAV_TARGET_KEY = 'webauto.xhs.navTarget.v1';

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

  const onboardingSummary = createEl('div', { className: 'muted' }, ['正在加载 profile 信息...']) as HTMLDivElement;
  const onboardingTips = createEl('div', { className: 'muted', style: 'font-size:12px; margin-top:6px;' }, [
    '首次使用建议：Profile 使用中性命名 profile-0/1/2；登录后可设置 alias（账号名）用于区分，默认会自动获取用户名。',
  ]) as HTMLDivElement;
  const gotoXhsBtn = createEl('button', { className: 'secondary', type: 'button' }, ['去小红书首页']) as HTMLButtonElement;
  const browserStatus = createEl('div', { className: 'muted' }, ['浏览器状态：未检查']) as HTMLDivElement;
  const browserCheckBtn = createEl('button', { className: 'secondary', type: 'button' }, ['检查浏览器/依赖']) as HTMLButtonElement;
  const browserDownloadBtn = createEl('button', { type: 'button' }, ['下载 Camoufox']) as HTMLButtonElement;

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
        placeholder: '账号名（alias，用于区分账号，默认登录后获取用户名）',
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
      let lastSavedAlias = String(aliases[e.profileId] || '').trim();
      const commitAlias = async () => {
        const nextAlias = String(aliasInput.value || '').trim();
        if (nextAlias === lastSavedAlias) return;
        await saveAlias(e.profileId, nextAlias);
        lastSavedAlias = nextAlias;
        aliasInput.style.borderColor = '';
      };
      aliasInput.oninput = () => {
        const dirty = String(aliasInput.value || '').trim() !== lastSavedAlias;
        aliasInput.style.borderColor = dirty ? '#2b67ff' : '';
      };
      btnSaveAlias.onclick = () => void commitAlias();
      aliasInput.onkeydown = (ev) => {
        if (ev.key === 'Enter') void commitAlias();
      };
      aliasInput.onblur = () => void commitAlias();
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

    const entries: any[] = out?.entries || [];
    const aliases = getAliasMap();
    const aliasedCount = entries.filter((e) => String(aliases[String(e?.profileId || '')] || '').trim()).length;
    onboardingSummary.textContent = `profile=${entries.length}，已设置账号名=${aliasedCount}`;
    if (entries.length === 0) {
      onboardingTips.textContent = '当前没有可用 profile：请先在下方“批量账号池”里新增账号。';
    } else if (aliasedCount < entries.length) {
      onboardingTips.textContent = `仍有 ${entries.length - aliasedCount} 个 profile 未设置账号名（alias）。alias 用于区分账号，默认登录后会自动获取用户名。`;
    } else {
      onboardingTips.textContent = '很好：所有 profile 都有账号名（alias），在小红书首页会按“账号名 (profileId)”显示。';
    }

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
  (toolbar.children[5] as HTMLButtonElement).onclick = () => void refreshScan();
  (toolbar.children[6] as HTMLButtonElement).onclick = async () => {
    ctx.clearLog();
    const args = buildArgs([window.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'), 'migrate-fingerprints']);
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

  const runBrowserCheck = async (opts: { download?: boolean; source?: 'auto' | 'manual' } = {}) => {
    const download = opts.download === true;
    const source = opts.source || 'manual';
    const script = window.api.pathJoin('apps', 'webauto', 'entry', 'xhs-install.mjs');
    const args = buildArgs([script, '--check-browser-only', ...(download ? ['--download-browser'] : [])]);

    browserStatus.textContent = download ? '浏览器状态：下载+检查中...' : '浏览器状态：检查中...';
    browserStatus.style.color = '#8b93a6';

    if (typeof window.api?.cmdRunJson === 'function') {
      const out = await window.api.cmdRunJson({
        title: download ? 'xhs install download' : 'xhs install check',
        cwd: '',
        args,
        timeoutMs: download ? 240000 : 120000,
      }).catch((err: any) => ({ ok: false, error: err?.message || String(err) }));

      const mergedOutput = String(out?.stdout || out?.stderr || out?.error || '').replace(/\x1b\[[0-9;]*m/g, '');
      if (out?.ok) {
        browserStatus.textContent = download ? '浏览器状态：下载并检查通过' : '浏览器状态：检查通过';
        browserStatus.style.color = '#22c55e';
      } else if (/Camoufox 未安装/i.test(mergedOutput)) {
        browserStatus.textContent = '浏览器状态：未安装 Camoufox（可点“下载 Camoufox”）';
        browserStatus.style.color = '#f59e0b';
      } else {
        browserStatus.textContent = `浏览器状态：检查失败（code=${out?.code ?? 'n/a'}）`;
        browserStatus.style.color = '#ef4444';
      }
      if (source === 'manual' && mergedOutput) {
        ctx.appendLog(`[preflight] install output\n${mergedOutput}`);
      }
      return;
    }

    if (typeof window.api?.cmdSpawn === 'function') {
      await window.api.cmdSpawn({ title: download ? 'xhs install download' : 'xhs install check', cwd: '', args, groupKey: 'install' });
      browserStatus.textContent = '浏览器状态：已触发检查（查看日志）';
      browserStatus.style.color = '#22c55e';
      return;
    }

    browserStatus.textContent = '浏览器状态：检查能力不可用';
    browserStatus.style.color = '#ef4444';
  };

  gotoXhsBtn.onclick = () => {
    try {
      window.localStorage.setItem(XHS_NAV_TARGET_KEY, 'account');
    } catch {
      // ignore storage failures
    }
    if (typeof ctx?.setActiveTab === 'function') ctx.setActiveTab('xiaohongshu');
  };

  browserCheckBtn.onclick = async () => {
    ctx.clearLog();
    await runBrowserCheck({ source: 'manual' });
  };

  browserDownloadBtn.onclick = async () => {
    ctx.clearLog();
    await runBrowserCheck({ download: true, source: 'manual' });
  };

  root.appendChild(
    section('首次引导（账号视角）', [
      onboardingSummary,
      onboardingTips,
      createEl('div', { className: 'row' }, [gotoXhsBtn]),
    ]),
  );

  root.appendChild(
    section('浏览器检查与下载', [
      browserStatus,
      createEl('div', { className: 'row' }, [browserCheckBtn, browserDownloadBtn]),
      createEl('div', { className: 'muted', style: 'font-size:12px;' }, ['说明：检查/下载的详细输出请查看日志页。']),
    ]),
  );

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
  const keywordInput = createEl('input', { value: 'profile', placeholder: 'Profile 前缀（可选），默认 profile，生成如 profile-0/profile-1' }) as HTMLInputElement;
  const ensureCountInput = createEl('input', { value: '0', type: 'number', min: '0' }) as HTMLInputElement;
  const timeoutInput = createEl('input', { value: String(ctx.settings?.timeouts?.loginTimeoutSec || 900), type: 'number', min: '30' }) as HTMLInputElement;
  const keepSession = createEl('input', { type: 'checkbox' }) as HTMLInputElement;
  const poolListBox = createEl('div', { className: 'list' });
  const poolStatus = createEl('div', { className: 'muted' }, ['']);


  function resolveBatchPrefix() {
    const base = String(keywordInput.value || '').trim() || 'xiaohongshu';
    return `${base}-batch`;
  }

  async function poolList() {
    ctx.clearLog();
    const kw = resolveBatchPrefix();
    const out = await window.api.cmdRunJson({
      title: 'profilepool list',
      cwd: '',
      args: buildArgs([window.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'), 'list', kw, '--json']),
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
    const kw = resolveBatchPrefix();
    const out = await window.api.cmdRunJson({
      title: 'profilepool add',
      cwd: '',
      args: buildArgs([window.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'), 'add', kw, '--json']),
    });
    ctx.appendLog(JSON.stringify(out?.json || out, null, 2));
    const createdProfileId = String(out?.json?.profileId || '').trim();
    await poolList();

    if (!createdProfileId) return;
    if (typeof window.api?.cmdSpawn !== 'function') return;

    const timeoutSec = Math.max(30, Math.floor(Number(timeoutInput.value || '900')));
    const loginArgs = buildArgs([
      window.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'),
      'login-profile',
      createdProfileId,
      '--timeout-sec',
      String(timeoutSec),
      '--check-interval-sec',
      '2',
      '--keep-session',
    ]);
    await window.api.cmdSpawn({
      title: `profilepool login-profile ${createdProfileId}`,
      cwd: '',
      args: loginArgs,
      groupKey: 'profilepool',
      env: { WEBAUTO_DAEMON: '1' },
    });
    ctx.appendLog(`[preflight] 已创建并启动登录: ${createdProfileId}`);
  }

  async function poolLogin() {
    ctx.clearLog();
    const kw = resolveBatchPrefix();
    const ensureCount = Math.max(0, Math.floor(Number(ensureCountInput.value || '0')));
    const timeoutSec = Math.max(30, Math.floor(Number(timeoutInput.value || '900')));
    const args = buildArgs([
      window.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'),
      'login',
      kw,
      '--timeout-sec',
      String(timeoutSec),
      ...(ensureCount > 0 ? ['--ensure-count', String(ensureCount)] : []),
      ...(keepSession.checked ? ['--keep-session'] : []),
    ]);
    await window.api.cmdSpawn({ title: `profilepool login ${kw}`, cwd: '', args, groupKey: 'profilepool' });
  }

  const poolActions = createEl('div', { className: 'row' }, [
    createEl('button', { className: 'secondary' }, ['扫描池']),
    createEl('button', { className: 'secondary' }, ['新增一个并登录']),
    createEl('button', {}, ['批量登录/补登录']),
  ]);
  (poolActions.children[0] as HTMLButtonElement).onclick = () => void poolList();
  (poolActions.children[1] as HTMLButtonElement).onclick = () => void poolAdd();
  (poolActions.children[2] as HTMLButtonElement).onclick = () => void poolLogin();

  root.appendChild(
    section('批量账号池（自动序号）', [
      createEl('div', { className: 'row' }, [
        labeledInput('账号名（默认 xiaohongshu）', keywordInput),
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
  void runBrowserCheck({ source: 'auto' });
}

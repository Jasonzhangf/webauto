import { createEl } from '../../ui-components.mjs';
import {
  XHS_DEFAULT_BATCH_KEY,
  readBatchKey,
  sanitizeBatchKey,
  writeBatchKey,
} from './helpers.mjs';
export function extractBatchBase(_profileId: string): string {
  return XHS_DEFAULT_BATCH_KEY;
}
export function inferDefaultBatchBase(_currentProfileId: string, _latestProfiles: string[]): string {
  return XHS_DEFAULT_BATCH_KEY;
}
type AccountFlowOptions = {
  api: any;
  profilePickSel: HTMLSelectElement;
  accountModeSelect: HTMLSelectElement;
  singleProfileHint: HTMLDivElement;
  shardProfilesBox: HTMLDivElement;
  shardProfilesHint: HTMLDivElement;
  shardResolvedHint: HTMLDivElement;
  accountAuditSummary: HTMLDivElement;
  accountAuditList: HTMLDivElement;
  accountRefreshBtn: HTMLButtonElement;
  accountLiveProbeBtn: HTMLButtonElement;
  addAccountCountInput: HTMLInputElement;
  addBatchNameInput: HTMLInputElement;
  accountAddBtn: HTMLButtonElement;
  batchKeyValue: HTMLDivElement;
  batchNextBtn: HTMLButtonElement;
  onboardingSummary: HTMLDivElement;
  onboardingCard: HTMLDivElement;
  onboardingTips: HTMLDivElement;
  persistedSingleProfile: string;
  persistedShardProfiles: Set<string>;
  setActiveTile: (tileId: string) => void;
  saveGuideState: (state: any) => void;
  applyGuideLock: () => void;
  getGuideState: () => any;
  setNavHint: (text: string) => void;
  runBrowserStatusCheck: (profileId: string, reason?: string) => Promise<boolean>;
};
type AccountFlowController = {
  refreshProfileChoices: (preferredProfileId?: string) => Promise<void>;
  startAccountAutoRefresh: (reason: string) => void;
  stopAccountAutoRefresh: () => void;
  getSelectedShardProfiles: () => string[];
  renderSingleProfileHint: () => void;
  renderShardHints: () => void;
  resolveAddBatchPrefix: () => string;
  syncAddBatchPlaceholder: () => void;
};
export function createAccountFlowController(opts: AccountFlowOptions): AccountFlowController {
  const {
    api,
    profilePickSel,
    accountModeSelect,
    singleProfileHint,
    shardProfilesBox,
    shardProfilesHint,
    shardResolvedHint,
    accountAuditSummary,
    accountAuditList,
    accountRefreshBtn,
    accountLiveProbeBtn,
    addAccountCountInput,
    addBatchNameInput,
    accountAddBtn,
    batchKeyValue,
    batchNextBtn,
    onboardingSummary,
    onboardingCard,
    onboardingTips,
    persistedSingleProfile,
    persistedShardProfiles,
    setActiveTile,
    saveGuideState,
    applyGuideLock,
    getGuideState,
    setNavHint,
    runBrowserStatusCheck,
  } = opts;
  let latestProfiles: string[] = [];
  let accountAutoRefreshTimer: ReturnType<typeof setInterval> | null = null;
  let accountAutoRefreshUntil = 0;
  let refreshSeq = 0;
  let batchKey = readBatchKey();
  if (!batchKey || /^batch-\d{8}-\d{4}$/.test(batchKey)) {
    batchKey = XHS_DEFAULT_BATCH_KEY;
  }
  const updateBatchKey = (next?: string) => {
    const candidate = sanitizeBatchKey(String(next || '').trim());
    batchKey = candidate === XHS_DEFAULT_BATCH_KEY ? candidate : XHS_DEFAULT_BATCH_KEY;
    writeBatchKey(batchKey);
    batchKeyValue.textContent = batchKey;
    addBatchNameInput.value = batchKey;
  };
  const openPreflightAccountTab = () => { if (typeof api?.setActiveTab === 'function') api.setActiveTab('preflight'); };
  const aliasesMap = () => {
    const aliases = api?.settings?.profileAliases;
    return aliases && typeof aliases === 'object' ? aliases : {};
  };
  const getSelectedShardProfiles = () => {
    const selected: string[] = [];
    shardProfilesBox.querySelectorAll('input[type="checkbox"][data-profile-id]').forEach((node) => {
      const cb = node as HTMLInputElement;
      if (!cb.checked) return;
      const id = String(cb.dataset.profileId || '').trim();
      if (id) selected.push(id);
    });
    return selected;
  };
  const uniqueProfileIds = (items: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of items) {
      const id = String(raw || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };
  const isNewFormatProfileId = (id: string) => /.+-batch-\d+$/.test(String(id || '').trim());
  const renderSingleProfileHint = () => {
    const current = String(profilePickSel.value || '').trim();
    if (!current) {
      singleProfileHint.textContent = '当前实际使用：(未选择账号)';
      return;
    }
    const label = String(profilePickSel.selectedOptions?.[0]?.textContent || current).trim();
    singleProfileHint.textContent = `当前实际使用：${label}`;
  };
  const renderShardHints = () => {
    const selected = getSelectedShardProfiles();
    shardProfilesHint.textContent = `selected=${selected.length}`;
    shardResolvedHint.textContent = selected.length > 0 ? `resolved: --profiles ${selected.join(',')}` : '';
  };
  const resolveAddBatchPrefix = (): string => {
    return XHS_DEFAULT_BATCH_KEY;
  };
  const syncAddBatchPlaceholder = () => {
    addBatchNameInput.placeholder = `Account prefix (fixed ${XHS_DEFAULT_BATCH_KEY})`;
  };
  const deriveCookieCandidates = (profileDir: string, profileId: string) => {
    const candidates = new Set<string>();
    const normalized = String(profileDir || '').replace(/\\/g, '/');
    const marker = '/profiles/';
    const at = normalized.lastIndexOf(marker);
    if (at > 0) {
      const rootDir = normalized.slice(0, at);
      candidates.add(rootDir + '/cookies/' + profileId + '.json');
    }
    if (typeof window.api?.osHomedir === 'function') {
      const homeDir = String(window.api.osHomedir() || '').trim();
      if (homeDir) {
        candidates.add(window.api.pathJoin(homeDir, '.webauto', 'cookies', `${profileId}.json`));
      }
    }
    return Array.from(candidates).map((p) => (window.api?.pathNormalize ? window.api.pathNormalize(p) : p));
  };
  let startAddAccountFlow: (() => Promise<void>) | null = null;
  const refreshAccountAudit = async (
    profiles: string[],
    aliases: Record<string, string>,
    profileDirs: Map<string, string>,
    seq: number,
  ) => {
    const appendAction = (label: string, onClick: () => void) => {
      const row = createEl('div', { className: 'xhs-account-row' });
      const btn = createEl('button', { type: 'button', className: 'secondary', style: 'padding:2px 8px; font-size:11px;' }, [label]) as HTMLButtonElement;
      btn.onclick = (evt) => {
        evt.preventDefault();
        onClick();
      };
      row.appendChild(createEl('div', { className: 'muted', style: 'font-size:12px;' }, ['需要补充账号操作']));
      row.appendChild(btn);
      accountAuditList.appendChild(row);
    };
    const sessions = await window.api.runtimeListSessions().catch(() => []);
    const activeProfiles = new Set(
      Array.isArray(sessions)
        ? sessions.map((s: any) => String(s?.profileId || '').trim()).filter(Boolean)
        : [],
    );
    const uniqueProfiles = uniqueProfileIds(profiles);
    const rows = await Promise.all(
      uniqueProfiles.map(async (profileId) => {
        const profileDir = String(profileDirs.get(profileId) || '').trim();
        const cookieCandidates = deriveCookieCandidates(profileDir, profileId);
        let cookieReady = false;
        for (const cookiePath of cookieCandidates) {
          const cookieRet = await window.api.fsReadTextPreview({ path: cookiePath, maxBytes: 160, maxLines: 2 }).catch(() => null);
          if (cookieRet?.ok && String(cookieRet?.text || '').trim()) {
            cookieReady = true;
            break;
          }
        }
        const active = activeProfiles.has(profileId);
        return {
          profileId,
          alias: String((aliases as any)[profileId] || '').trim(),
          cookieReady,
          active,
        };
      }),
    );
    if (seq !== refreshSeq) return;
    accountAuditList.innerHTML = '';
    if (rows.length === 0) {
      accountAuditList.appendChild(createEl('div', { className: 'xhs-account-row muted' }, ['暂无账号，请先新增账号。']));
      accountAuditSummary.textContent = '账号检查：0 个账号';
      const state = getGuideState();
      state.accountReady = false;
      saveGuideState(state);
      applyGuideLock();
      appendAction('去新增账号', () => {
        openPreflightAccountTab();
        if (startAddAccountFlow) void startAddAccountFlow();
      });
      return;
    }
    const cookieReadyCount = rows.filter((x) => x.cookieReady).length;
    const activeCount = rows.filter((x) => x.active).length;
    accountAuditSummary.textContent = `账号检查：总数=${rows.length}，cookie就绪=${cookieReadyCount}，当前在线=${activeCount}`;
    const state = getGuideState();
    state.accountReady = cookieReadyCount > 0 || activeCount > 0;
    saveGuideState(state);
    applyGuideLock();
    if (cookieReadyCount === 0 && activeCount === 0) {
      appendAction('去登录账号', () => {
        openPreflightAccountTab();
        if (startAddAccountFlow) void startAddAccountFlow();
      });
    }
    rows.forEach((entry) => {
      const label = entry.alias ? `${entry.alias} (${entry.profileId})` : entry.profileId;
      const status = entry.active ? '在线' : entry.cookieReady ? 'cookie就绪' : '待登录';
      const statusColor = entry.active ? '#22c55e' : entry.cookieReady ? '#f59e0b' : '#ef4444';
      const row = createEl('div', { className: 'xhs-account-row' });
      row.appendChild(createEl('div', { className: 'muted', style: 'font-size:12px;' }, [label]));
      row.appendChild(createEl('div', { style: `font-size:12px; color:${statusColor};` }, [status]));
      const aliasBtn = createEl('button', { type: 'button', className: 'secondary', style: 'padding:2px 6px; font-size:11px;' }, ['设置别名']) as HTMLButtonElement;
      aliasBtn.onclick = async () => {
        const currentAlias = String(entry.alias || '').trim();
        const nextAlias = window.prompt('账号别名（仅用于区分账号显示名）', currentAlias || '');
        if (nextAlias == null) return;
        const aliasesNext: Record<string, string> = { ...aliases };
        const cleaned = String(nextAlias || '').trim();
        if (cleaned) aliasesNext[entry.profileId] = cleaned;
        else delete aliasesNext[entry.profileId];
        try {
          const updated = await window.api.settingsSet({ profileAliases: aliasesNext });
          api.settings = updated;
          void refreshProfileChoices();
        } catch {
          alert('别名保存失败，请稍后再试');
        }
      };
      row.appendChild(aliasBtn);
      accountAuditList.appendChild(row);
    });
  };
  const refreshProfileChoices = async (preferredProfileId = '') => {
    const seq = ++refreshSeq;
    accountAuditSummary.textContent = '账号检查：刷新中...';
    const selectedNow = getSelectedShardProfiles();
    const prevSingle = String(profilePickSel.value || persistedSingleProfile || '').trim();
    const preferredSingle = String(preferredProfileId || '').trim();
    const prevSelected = selectedNow.length > 0 ? new Set(selectedNow) : new Set(persistedShardProfiles);
    const scan = await window.api.profilesScan().catch(() => null);
    const entries: any[] = Array.isArray(scan?.entries) ? scan.entries : [];
    const profiles: string[] = uniqueProfileIds(entries.map((e: any) => String(e?.profileId || '').trim())).filter(isNewFormatProfileId);
    const profileDirs = new Map<string, string>();
    entries.forEach((e: any) => {
      const pid = String(e?.profileId || '').trim();
      if (!pid || !isNewFormatProfileId(pid)) return;
      if (!profileDirs.has(pid)) profileDirs.set(pid, String(e?.profileDir || '').trim());
    });
    if (seq !== refreshSeq) return;
    latestProfiles = profiles.slice();
    syncAddBatchPlaceholder();
    const aliases = aliasesMap();
    const aliasedProfiles = profiles.filter((profileId) => String((aliases as any)[profileId] || '').trim()).length;
    onboardingSummary.textContent = `profile=${profiles.length}，已设置账号名=${aliasedProfiles}`;
    if (profiles.length === 0) {
      onboardingCard.style.display = '';
      onboardingTips.textContent = '当前没有可用 profile：请前往预处理页创建/登录 profile，再返回此页。';
    } else {
      onboardingCard.style.display = 'none';
    }
    profilePickSel.textContent = '';
    profilePickSel.appendChild(createEl('option', { value: '' }, ['(请选择账号：alias / profile)']));
    for (const profileId of profiles) {
      const alias = String((aliases as any)[profileId] || '').trim();
      const label = alias ? `${alias} (${profileId})` : profileId;
      profilePickSel.appendChild(createEl('option', { value: profileId }, [label]));
    }
    if (preferredSingle && profiles.includes(preferredSingle)) {
      profilePickSel.value = preferredSingle;
    } else if (prevSingle && profiles.includes(prevSingle)) {
      profilePickSel.value = prevSingle;
    } else if (profiles.length > 0) {
      profilePickSel.value = profiles[0];
    }
    renderSingleProfileHint();
    shardProfilesBox.innerHTML = '';
    for (const profileId of profiles) {
      const alias = String((aliases as any)[profileId] || '').trim();
      const label = alias ? `${alias} (${profileId})` : profileId;
      const id = `xh-profile-${profileId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      const cb = createEl('input', { type: 'checkbox', id }) as HTMLInputElement;
      cb.dataset.profileId = profileId;
      cb.checked = prevSelected.has(profileId) || (profiles.length === 1 && prevSelected.size === 0);
      cb.onchange = () => {
        persistedShardProfiles.clear();
        getSelectedShardProfiles().forEach((pid) => persistedShardProfiles.add(pid));
        renderShardHints();
      };
      const row = createEl('div', { className: 'row', style: 'align-items:center; gap:8px; margin-bottom:4px;' }, [
        cb,
        createEl('label', { for: id, style: 'cursor:pointer;' }, [label]),
      ]);
      shardProfilesBox.appendChild(row);
    }
    if (shardProfilesBox.childElementCount === 0) {
      shardProfilesBox.appendChild(createEl('div', { className: 'muted' }, ['暂无可用账号，请先在预处理页新增账号']));
    }
    persistedShardProfiles.clear();
    getSelectedShardProfiles().forEach((pid) => persistedShardProfiles.add(pid));
    renderShardHints();
    await refreshAccountAudit(profiles, aliases as Record<string, string>, profileDirs, seq);
  };
  const stopAccountAutoRefresh = () => {
    if (accountAutoRefreshTimer) {
      clearInterval(accountAutoRefreshTimer);
      accountAutoRefreshTimer = null;
    }
  };
  const startAccountAutoRefresh = (reason: string) => {
    stopAccountAutoRefresh();
    accountAutoRefreshUntil = Date.now() + 10 * 60 * 1000;
    api?.appendLog?.(`[ui] account auto refresh start (${reason})`);
    const tick = async () => {
      if (Date.now() > accountAutoRefreshUntil) {
        stopAccountAutoRefresh();
        return;
      }
      await refreshProfileChoices().catch(() => null);
      if (getGuideState().accountReady) {
        api?.appendLog?.('[ui] account auto refresh done (account ready)');
        stopAccountAutoRefresh();
      }
    };
    void tick();
    accountAutoRefreshTimer = setInterval(() => {
      void tick();
    }, 15000);
  };
  startAddAccountFlow = async () => {
    if (typeof window.api?.cmdSpawn !== 'function' || typeof window.api?.cmdRunJson !== 'function') {
      api?.appendLog?.('[error] cmdSpawn/cmdRunJson API unavailable in renderer');
      alert('启动失败：cmdSpawn/cmdRunJson API 不可用');
      return;
    }
    const kw = resolveAddBatchPrefix();
    if (!kw) {
      api?.appendLog?.('[ui] add-account blocked: empty batch');
      alert('批次名称不能为空，请先填写批次名称或使用默认 xiaohongshu');
      return;
    }
    const addCount = Math.max(1, Math.floor(Number(addAccountCountInput.value || '1')));
    const timeoutSec = Math.max(30, Math.floor(Number(api?.settings?.timeouts?.loginTimeoutSec || 900)));
    const createdProfiles: string[] = [];
    api?.appendLog?.(`[ui] add-account start batch=${kw} count=${addCount}`);
    setNavHint(`正在创建新账号（批次=${kw}, count=${addCount}）...`);
    for (let i = 0; i < addCount; i += 1) {
      const out = await window.api.cmdRunJson({
        title: `profilepool add ${kw}`,
        cwd: '',
        args: [window.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'), 'add', kw, '--json'],
      }).catch((err: any) => ({ ok: false, error: err?.message || String(err) }));
      if (!out?.ok || !out?.json?.profileId) {
        const reason = String(out?.error || out?.stderr || out?.stdout || 'unknown_error');
        api?.appendLog?.(`[ui] profilepool add failed: ${reason}`);
        alert(`新增账号失败（创建 profile 失败）：${reason}`);
        return;
      }
      const createdProfileId = String(out.json.profileId || '').trim();
      if (!createdProfileId) {
        alert('新增账号失败：未返回 profileId');
        return;
      }
      createdProfiles.push(createdProfileId);
      api?.appendLog?.(`[ui] profile created: ${createdProfileId}`);
    }
    const targetProfile = createdProfiles[0] || '';
    if (!targetProfile) {
      alert('新增账号失败：未创建任何 profile');
      return;
    }
    const loginArgs = [
      window.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'),
      'login-profile',
      targetProfile,
      '--timeout-sec',
      String(timeoutSec),
      '--keep-session',
      ...(api?.settings?.unifiedApiUrl ? ['--unified-api', String(api.settings.unifiedApiUrl)] : []),
      ...(api?.settings?.browserServiceUrl ? ['--browser-service', String(api.settings.browserServiceUrl)] : []),
    ];
    api?.appendLog?.(`[ui] spawn profilepool login-profile profile=${targetProfile} timeout=${timeoutSec}s`);
    try {
      const ret = await window.api.cmdSpawn({
        title: `profilepool login-profile ${targetProfile} (headful)`,
        cwd: '',
        args: loginArgs,
        groupKey: 'profilepool',
        env: { WEBAUTO_DAEMON: '1' },
      });
      if (!ret || !ret.runId) {
        api?.appendLog?.('[ui] spawn returned empty runId');
        alert('新增账号启动失败：未获取 runId，请查看日志');
        return;
      }
      api?.appendLog?.(`[ui] spawn ok runId=${ret.runId}`);
      setNavHint(`已创建账号：${createdProfiles.join(', ')}；已打开登录窗口：${targetProfile}，请完成登录后点“检查账号状态”。`);
      await refreshProfileChoices(targetProfile);
      startAccountAutoRefresh('add-account');
    } catch (err: any) {
      api?.appendLog?.(`[ui] spawn exception: ${err?.message || String(err)}`);
      alert(`新增账号启动失败：${err?.message || String(err)}`);
    }
  };
  accountRefreshBtn.onclick = async () => {
    const profileId = String(profilePickSel.value || '').trim();
    if (!profileId) {
      setActiveTile('account');
      setNavHint('请先新增账号，然后再做账号检查。');
      alert('请先新增账号，然后再做账号检查。');
      return;
    }
    await runBrowserStatusCheck(profileId, 'refresh');
    void refreshProfileChoices(profileId);
  };
  accountLiveProbeBtn.onclick = async () => {
    const accountMode = String(accountModeSelect.value || 'single').trim();
    const shardSelected = accountMode === 'shards' ? getSelectedShardProfiles() : [];
    const profileId = String((shardSelected[0] || profilePickSel.value || '')).trim();
    if (!profileId) {
      alert('请先选择一个账号后再执行实时探测');
      return;
    }
    await runBrowserStatusCheck(profileId, 'live-probe');
    setTimeout(() => {
      void refreshProfileChoices();
    }, 1500);
  };
  batchNextBtn.onclick = () => {
    updateBatchKey(XHS_DEFAULT_BATCH_KEY);
    setNavHint(`Naming reset: ${XHS_DEFAULT_BATCH_KEY}`);
  };
  addBatchNameInput.addEventListener('change', () => {
    updateBatchKey(XHS_DEFAULT_BATCH_KEY);
    setNavHint(`Account IDs use fixed pattern: ${XHS_DEFAULT_BATCH_KEY}-N`);
  });
  accountAddBtn.addEventListener('pointerdown', (evt) => {
    evt.stopPropagation();
  });
  accountAddBtn.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (startAddAccountFlow) void startAddAccountFlow();
  });
  updateBatchKey(batchKey || XHS_DEFAULT_BATCH_KEY);
  return {
    refreshProfileChoices,
    startAccountAutoRefresh,
    stopAccountAutoRefresh,
    getSelectedShardProfiles,
    renderSingleProfileHint,
    renderShardHints,
    resolveAddBatchPrefix,
    syncAddBatchPlaceholder,
  };
}

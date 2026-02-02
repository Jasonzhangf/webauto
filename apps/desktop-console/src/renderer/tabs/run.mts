import { createEl, labeledInput, section } from '../ui-components.mts';

function buildArgs(parts: string[]) {
  return parts.filter((x) => x != null && String(x).trim() !== '');
}

type TemplateId = 'phase1' | 'phase2' | 'phase3' | 'phase4' | 'smartReply' | 'virtualLike';

export function renderRun(root: HTMLElement, ctx: any) {
  const templateSel = createEl('select') as HTMLSelectElement;
  const templates: Array<{ id: TemplateId; label: string }> = [
    { id: 'phase1', label: 'Phase1 boot' },
    { id: 'phase2', label: 'Phase2 collect links' },
    { id: 'phase3', label: 'Phase3 interact' },
    { id: 'phase4', label: 'Phase4 harvest' },
    { id: 'smartReply', label: 'Smart Reply DEV E2E' },
    { id: 'virtualLike', label: 'Virtual Like E2E' },
  ];
  templates.forEach((t) => templateSel.appendChild(createEl('option', { value: t.id }, [t.label])));

  const keywordInput = createEl('input', { value: ctx.settings?.defaultKeyword || '', placeholder: 'keyword' }) as HTMLInputElement;
  const envSel = createEl('select') as HTMLSelectElement;
  ['debug', 'prod'].forEach((x) => envSel.appendChild(createEl('option', { value: x }, [x])));
  envSel.value = ctx.settings?.defaultEnv || 'debug';

  const dryRun = createEl('input', { type: 'checkbox' }) as HTMLInputElement;

  const profileModeSel = createEl('select') as HTMLSelectElement;

  const profilePickSel = createEl('select') as HTMLSelectElement;
  const runtimePickSel = createEl('select') as HTMLSelectElement;
  const profileRefreshBtn = createEl('button', { className: 'secondary' }, ['刷新 profiles']) as HTMLButtonElement;

  const poolPickSel = createEl('select') as HTMLSelectElement;
  const profilesBox = createEl('div', { className: 'list' });
  const profilesHint = createEl('div', { className: 'muted' }, ['']);
  const resolvedHint = createEl('div', { className: 'muted' }, ['']);

  const extraInput = createEl('input', { placeholder: 'extra args (raw)' }) as HTMLInputElement;

  function maybeFlag(flag: string, value: string) {
    const v = String(value || '').trim();
    if (!v) return [];
    return [flag, v];
  }

  function setProfileModes(templateId: TemplateId) {
    const supportsMultiProfile = templateId === 'phase1' || templateId === 'phase3' || templateId === 'phase4';
    profileModeSel.textContent = '';
    const modes = supportsMultiProfile
      ? [
          { v: 'profile', l: 'profile（单个）' },
          { v: 'profilepool', l: 'profilepool（按 keyword 前缀扫描 + 自动分片）' },
          { v: 'profiles', l: 'profiles（手动列表 + 自动分片）' },
        ]
      : [{ v: 'profile', l: 'profile（单个）' }];
    modes.forEach((m) => profileModeSel.appendChild(createEl('option', { value: m.v }, [m.l])));
    profileModeSel.value = 'profile';
  }

  function derivePoolKeys(profiles: string[]) {
    const keys = new Set<string>();
    for (const p of profiles) {
      const m = /^(.+)-\d+$/.exec(p);
      if (m && m[1]) keys.add(m[1]);
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }

  async function refreshProfiles() {
    profilePickSel.textContent = '';
    profilePickSel.appendChild(createEl('option', { value: '' }, ['(选择已有 profile，填充到输入框)']));
    const profilesRes = await window.api.profilesList().catch(() => null);
    const profiles: string[] = profilesRes?.profiles || [];
    const aliases = (ctx.settings?.profileAliases && typeof ctx.settings.profileAliases === 'object') ? ctx.settings.profileAliases : {};
    profiles.forEach((p) => {
      const alias = String((aliases as any)[p] || '').trim();
      const label = alias ? `${alias} (${p})` : p;
      profilePickSel.appendChild(createEl('option', { value: p }, [label]));
    });

    poolPickSel.textContent = '';
    poolPickSel.appendChild(createEl('option', { value: '' }, ['(选择 pool keyword)']));
    const poolKeys = derivePoolKeys(profiles);
    poolKeys.forEach((k) => poolPickSel.appendChild(createEl('option', { value: k }, [String(k)])));
    
    // Auto-select first pool if available and pool mode is active
    if (poolKeys.length > 0 && profileModeSel.value === 'profilepool' && !poolPickSel.value) {
      poolPickSel.value = poolKeys[0];
      syncProfileValueFromUI();
    }

    profilesBox.textContent = '';
    profilesHint.textContent = '';
    const selected = new Set<string>();
    const preferSingle = profiles[0] || '';
    if (preferSingle) {
      profilePickSel.value = preferSingle;
      selected.add(preferSingle);
    }
    profiles.forEach((p) => {
      const id = `p_${p}`;
      const cb = createEl('input', { type: 'checkbox', id }) as HTMLInputElement;
      cb.dataset.profile = p;
      cb.checked = selected.has(p);
      cb.onchange = () => syncProfileValueFromUI();
      const alias = String((aliases as any)[p] || '').trim();
      const labelText = alias ? `${alias} (${p})` : p;
      const label = createEl('label', { for: id, style: 'cursor:pointer;' }, [labelText]);
      const row = createEl('div', { className: 'row', style: 'align-items:center;' }, [cb, label]);
      profilesBox.appendChild(row);
    });

    syncProfileValueFromUI();
  }

  async function refreshRuntimes() {
    runtimePickSel.textContent = '';
    runtimePickSel.appendChild(createEl('option', { value: '' }, ['(选择运行中的 runtime)']));
    const sessions = await window.api.runtimeListSessions().catch(() => []);
    const aliases = (ctx.settings?.profileAliases && typeof ctx.settings.profileAliases === 'object') ? ctx.settings.profileAliases : {};
    (Array.isArray(sessions) ? sessions : []).forEach((s: any) => {
      const profileId = String(s?.profileId || s?.sessionId || '').trim();
      if (!profileId) return;
      const alias = String((aliases as any)[profileId] || '').trim();
      const label = alias ? `${alias} (${profileId})` : profileId;
      runtimePickSel.appendChild(createEl('option', { value: profileId }, [label]));
    });
  }

  // When Preflight updates aliases or profile lists, re-render.
  window.api.onSettingsChanged((next: any) => {
    ctx.settings = next;
    void refreshProfiles();
    void refreshRuntimes();
  });

  function getSelectedProfiles(): string[] {
    const selected: string[] = [];
    profilesBox.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      const cb = el as HTMLInputElement;
      if (!cb.checked) return;
      const id = String(cb.dataset.profile || '').trim();
      if (id) selected.push(id);
    });
    return selected;
  }

  function syncProfileValueFromUI() {
    const mode = profileModeSel.value;
    const useRuntimeForSingle = templateSel.value !== 'phase1';
    profilePickSel.style.display = mode === 'profile' && !useRuntimeForSingle ? '' : 'none';
    runtimePickSel.style.display = mode === 'profile' && useRuntimeForSingle ? '' : 'none';
    poolPickSel.style.display = mode === 'profilepool' ? '' : 'none';
    profilesBox.style.display = (mode === 'profiles' || mode === 'profilepool') ? '' : 'none';

    if (mode === 'profile') {
      const v = String(useRuntimeForSingle ? runtimePickSel.value : profilePickSel.value || '').trim();
      profilesHint.textContent = v ? '' : '请选择一个 runtime/profile';
      resolvedHint.textContent = v ? `resolved: --profile ${v}` : '';
      return;
    }
    if (mode === 'profilepool') {
      const v = String(poolPickSel.value || '').trim();
      profilesHint.textContent = v ? '' : '请选择一个 pool keyword';
      resolvedHint.textContent = v ? `resolved: --profilepool ${v}` : '';
      if (v) {
        // Auto-select all profiles belonging to the pool
        profilesBox.querySelectorAll('input[type="checkbox"]').forEach((el) => {
          const cb = el as HTMLInputElement;
          const pid = String(cb.dataset.profile || '');
          cb.checked = pid.startsWith(v);
        });
      }
      return;
    }
    if (mode === 'profiles') {
      const list = getSelectedProfiles();
      profilesHint.textContent = `selected=${list.length}`;
      resolvedHint.textContent = list.length ? `resolved: --profiles ${list.join(',')}` : '';
      return;
    }
  }

  function resolveProfileArgsForRun(t: TemplateId) {
    const supportsMultiProfile = t === 'phase1' || t === 'phase3' || t === 'phase4';
    const mode = profileModeSel.value;
    const useRuntimeForSingle = t !== 'phase1';

    if (!supportsMultiProfile) {
      const v = String(useRuntimeForSingle ? runtimePickSel.value : profilePickSel.value || '').trim();
      if (!v) return { ok: false as const, error: '请选择一个 profile', args: [] as string[] };
      return { ok: true as const, args: ['--profile', v], mode: 'profile', value: v };
    }

    if (mode === 'profile') {
      const v = String(useRuntimeForSingle ? runtimePickSel.value : profilePickSel.value || '').trim();
      if (!v) return { ok: false as const, error: '请选择一个 profile', args: [] as string[] };
      return { ok: true as const, args: ['--profile', v], mode: 'profile', value: v };
    }
    if (mode === 'profilepool') {
      const v = String(poolPickSel.value || '').trim();
      if (!v) return { ok: false as const, error: '请选择一个 pool keyword', args: [] as string[] };
      return { ok: true as const, args: ['--profilepool', v], mode: 'profilepool', value: v };
    }
    const list = getSelectedProfiles();
    if (list.length === 0) return { ok: false as const, error: '请勾选至少一个 profile', args: [] as string[] };
    return { ok: true as const, args: ['--profiles', list.join(',')], mode: 'profiles', value: list.join(',') };
  }

  async function run() {
    ctx.clearLog();
    const t = templateSel.value as TemplateId;
    const keyword = keywordInput.value.trim();
    const env = envSel.value.trim();
    const extra = extraInput.value.trim();

    const common = buildArgs([
      ...(keyword ? ['--keyword', keyword] : []),
      ...(env ? ['--env', env] : []),
      ...(dryRun.checked ? ['--dry-run'] : []),
    ]);

    const resolved = resolveProfileArgsForRun(t);
    if (!resolved.ok) {
      profilesHint.textContent = resolved.error;
      return;
    }
    const profileArgs = resolved.args;

    const extraArgs = extra ? extra.split(' ').filter(Boolean) : [];

    let script = '';
    let args: string[] = [];

  if (t === 'phase1') {
      script = window.api.pathJoin('scripts', 'xiaohongshu', 'phase1-boot.mjs');
      args = buildArgs([script, ...profileArgs]);
      // Special case: Phase1 + profilepool → use profilepool.mjs login
      if (resolved.mode === 'profilepool' && resolved.value) {
        script = window.api.pathJoin('scripts', 'profilepool.mjs');
        args = buildArgs([
          script,
          'login',
          resolved.value,
          '--keep-session',
          '--timeout-sec',
          String(ctx.settings?.timeouts?.loginTimeoutSec || 900),
          ...(ctx.settings?.unifiedApiUrl ? ['--unified-api', String(ctx.settings.unifiedApiUrl)] : []),
          ...(ctx.settings?.browserServiceUrl ? ['--browser-service', String(ctx.settings.browserServiceUrl)] : []),
        ]);
      }
    } else if (t === 'phase2') {
      script = window.api.pathJoin('scripts', 'xiaohongshu', 'phase2-collect.mjs');
      args = buildArgs([script, ...profileArgs, ...common, ...extraArgs]);
    } else if (t === 'phase3') {
      script = window.api.pathJoin('scripts', 'xiaohongshu', 'phase3-interact.mjs');
      args = buildArgs([script, ...profileArgs, ...common, ...extraArgs]);
    } else if (t === 'phase4') {
      script = window.api.pathJoin('scripts', 'xiaohongshu', 'phase4-harvest.mjs');
      args = buildArgs([script, ...profileArgs, ...common, ...extraArgs]);
    } else if (t === 'smartReply') {
      script = window.api.pathJoin('scripts', 'xiaohongshu', 'tests', 'smart-reply-e2e.mjs');
      args = buildArgs([script, ...profileArgs, ...common, '--dev', ...extraArgs]);
    } else if (t === 'virtualLike') {
      script = window.api.pathJoin('scripts', 'xiaohongshu', 'tests', 'virtual-like-e2e.mjs');
      args = buildArgs([script, ...profileArgs, ...common, ...extraArgs]);
    }

    await window.api.cmdSpawn({
      title: `${t} ${keyword}`,
      cwd: '',
      args,
      groupKey: 'xiaohongshu',
    });
  }

  async function stop() {
    if (!ctx.activeRunId) return;
    await window.api.cmdKill(ctx.activeRunId);
  }

  const actions = createEl('div', { className: 'row' }, [
    createEl('button', {}, ['运行']),
    createEl('button', { className: 'danger' }, ['停止']),
  ]);
  (actions.children[0] as HTMLButtonElement).onclick = () => void run();
  (actions.children[1] as HTMLButtonElement).onclick = () => void stop();

  root.appendChild(
    section('调用', [
      createEl('div', { className: 'row' }, [
        labeledInput('template', templateSel),
        labeledInput('keyword', keywordInput),
        labeledInput('env', envSel),
        createEl('div', { style: 'display:flex; flex-direction:column; gap:6px;' }, [
          createEl('label', {}, ['dry-run']),
          dryRun,
        ]),
      ]),
      createEl('div', { className: 'row' }, [
        labeledInput('profile mode', profileModeSel),
        createEl('div', { style: 'display:flex; gap:8px; align-items:center;' }, [profilePickSel, runtimePickSel, poolPickSel, profileRefreshBtn]),
        labeledInput('extra', extraInput),
      ]),
      profilesHint,
      resolvedHint,
      profilesBox,
      actions,
      createEl('div', { className: 'muted' }, [
        'profile：单 profile；profilepool：keyword 前缀扫描 pool（会包含同名 base profile，例如 xiaohongshu_fresh）并自动分片；profiles：手动 a,b,c 并自动分片。',
      ]),
    ]),
  );

  templateSel.onchange = () => {
    setProfileModes(templateSel.value as TemplateId);
    syncProfileValueFromUI();
    void refreshRuntimes();
  };
  profileModeSel.onchange = async () => {
    syncProfileValueFromUI();
    if (profileModeSel.value === 'profilepool') {
      const res = await window.api.profilesList().catch(() => null);
      const profiles = res?.profiles || [];
      const poolKeys = derivePoolKeys(profiles);
      if (poolKeys.length > 0 && !poolPickSel.value) {
        poolPickSel.value = poolKeys[0];
        syncProfileValueFromUI();
      }
    }
  };
  profilePickSel.onchange = () => {
    syncProfileValueFromUI();
  };
  runtimePickSel.onchange = () => {
    syncProfileValueFromUI();
  };
  poolPickSel.onchange = () => syncProfileValueFromUI();
  profileRefreshBtn.onclick = () => void refreshProfiles();

  setProfileModes(templateSel.value as TemplateId);
  void refreshProfiles();
  void refreshRuntimes();
}

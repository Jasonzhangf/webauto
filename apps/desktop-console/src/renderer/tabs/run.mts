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
  const profileValue = createEl('input', { placeholder: 'auto-selected', readOnly: 'true' }) as HTMLInputElement;

  const profilePickSel = createEl('select') as HTMLSelectElement;
  const profileRefreshBtn = createEl('button', { className: 'secondary' }, ['刷新 profiles']) as HTMLButtonElement;

  const poolPickSel = createEl('select') as HTMLSelectElement;
  const profilesBox = createEl('div', { className: 'list' });
  const profilesHint = createEl('div', { className: 'muted' }, ['']);

  const extraInput = createEl('input', { placeholder: 'extra args (raw)' }) as HTMLInputElement;

  function maybeFlag(flag: string, value: string) {
    const v = String(value || '').trim();
    if (!v) return [];
    return [flag, v];
  }

  function setProfileModes(templateId: TemplateId) {
    const supportsMultiProfile = templateId === 'phase3' || templateId === 'phase4';
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
    const res = await window.api.profilesList().catch(() => null);
    const profiles: string[] = res?.profiles || [];
    profiles.forEach((p) => profilePickSel.appendChild(createEl('option', { value: p }, [p])));

    poolPickSel.textContent = '';
    poolPickSel.appendChild(createEl('option', { value: '' }, ['(选择 pool keyword)']));
    derivePoolKeys(profiles).forEach((k) => poolPickSel.appendChild(createEl('option', { value: k }, [k])));

    profilesBox.textContent = '';
    profilesHint.textContent = '';
    const selected = new Set<string>();
    const preferSingle = profiles.includes('xiaohongshu_fresh') ? 'xiaohongshu_fresh' : profiles[0] || '';
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
      const label = createEl('label', { for: id, style: 'cursor:pointer;' }, [p]);
      const row = createEl('div', { className: 'row', style: 'align-items:center;' }, [cb, label]);
      profilesBox.appendChild(row);
    });

    syncProfileValueFromUI();
  }

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
    profilePickSel.style.display = mode === 'profile' ? '' : 'none';
    poolPickSel.style.display = mode === 'profilepool' ? '' : 'none';
    profilesBox.style.display = mode === 'profiles' ? '' : 'none';

    if (mode === 'profile') {
      const v = String(profilePickSel.value || '').trim();
      profileValue.value = v;
      profilesHint.textContent = v ? '' : '请选择一个 profile';
      return;
    }
    if (mode === 'profilepool') {
      const v = String(poolPickSel.value || '').trim();
      profileValue.value = v;
      profilesHint.textContent = v ? '' : '请选择一个 pool keyword';
      return;
    }
    if (mode === 'profiles') {
      const list = getSelectedProfiles();
      profileValue.value = list.join(',');
      profilesHint.textContent = `selected=${list.length}`;
      return;
    }
  }

  async function run() {
    ctx.clearLog();
    const t = templateSel.value as TemplateId;
    const keyword = keywordInput.value.trim();
    const env = envSel.value.trim();
    const mode = profileModeSel.value;
    const profileVal = profileValue.value.trim();
    const extra = extraInput.value.trim();

    const common = buildArgs([
      ...(keyword ? ['--keyword', keyword] : []),
      ...(env ? ['--env', env] : []),
      ...(dryRun.checked ? ['--dry-run'] : []),
    ]);

    const supportsMultiProfile = t === 'phase3' || t === 'phase4';
    const profileArgs = supportsMultiProfile
      ? mode === 'profile'
        ? maybeFlag('--profile', profileVal)
        : mode === 'profilepool'
          ? maybeFlag('--profilepool', profileVal)
          : maybeFlag('--profiles', profileVal)
      : maybeFlag('--profile', profileVal);

    const extraArgs = extra ? extra.split(' ').filter(Boolean) : [];

    let script = '';
    let args: string[] = [];

    if (t === 'phase1') {
      script = window.api.pathJoin('scripts', 'xiaohongshu', 'phase1-boot.mjs');
      args = buildArgs([script, ...profileArgs]);
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
        labeledInput('selected', profileValue),
        createEl('div', { style: 'display:flex; gap:8px; align-items:center;' }, [profilePickSel, poolPickSel, profileRefreshBtn]),
        labeledInput('extra', extraInput),
      ]),
      profilesHint,
      profilesBox,
      actions,
      createEl('div', { className: 'muted' }, [
        'profile：单 profile；profilepool：keyword 前缀扫描 pool（会包含同名 base profile，例如 xiaohongshu_fresh）并自动分片；profiles：手动 a,b,c 并自动分片。',
      ]),
    ]),
  );

  templateSel.onchange = () => setProfileModes(templateSel.value as TemplateId);
  profileModeSel.onchange = () => syncProfileValueFromUI();
  profilePickSel.onchange = () => {
    const v = profilePickSel.value;
    if (v) profileValue.value = v;
    syncProfileValueFromUI();
  };
  poolPickSel.onchange = () => syncProfileValueFromUI();
  profileRefreshBtn.onclick = () => void refreshProfiles();

  setProfileModes(templateSel.value as TemplateId);
  void refreshProfiles();
}

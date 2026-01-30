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
  const profileInput = createEl('input', { placeholder: 'profileId / poolKeyword / a,b,c' }) as HTMLInputElement;
  const profilePickSel = createEl('select') as HTMLSelectElement;
  const profileRefreshBtn = createEl('button', { className: 'secondary' }, ['刷新 profiles']) as HTMLButtonElement;

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

  async function refreshProfiles() {
    profilePickSel.textContent = '';
    profilePickSel.appendChild(createEl('option', { value: '' }, ['(选择已有 profile，填充到输入框)']));
    const res = await window.api.profilesList().catch(() => null);
    const profiles: string[] = res?.profiles || [];
    profiles.forEach((p) => profilePickSel.appendChild(createEl('option', { value: p }, [p])));
    if (!profileInput.value.trim()) {
      const prefer = profiles.includes('xiaohongshu_fresh') ? 'xiaohongshu_fresh' : profiles[0] || '';
      if (prefer) profileInput.value = prefer;
    }
  }

  async function run() {
    ctx.clearLog();
    const t = templateSel.value as TemplateId;
    const keyword = keywordInput.value.trim();
    const env = envSel.value.trim();
    const mode = profileModeSel.value;
    const profileVal = profileInput.value.trim();
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
        labeledInput('profile/pool/profiles', profileInput),
        createEl('div', { style: 'display:flex; gap:8px; align-items:center;' }, [profilePickSel, profileRefreshBtn]),
        labeledInput('extra', extraInput),
      ]),
      actions,
      createEl('div', { className: 'muted' }, [
        'profile：单 profile；profilepool：keyword 前缀扫描 pool（会包含同名 base profile，例如 xiaohongshu_fresh）并自动分片；profiles：手动 a,b,c 并自动分片。',
      ]),
    ]),
  );

  templateSel.onchange = () => setProfileModes(templateSel.value as TemplateId);
  profilePickSel.onchange = () => {
    const v = profilePickSel.value;
    if (v) profileInput.value = v;
  };
  profileRefreshBtn.onclick = () => void refreshProfiles();

  setProfileModes(templateSel.value as TemplateId);
  void refreshProfiles();
}

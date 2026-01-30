import { createEl, labeledInput, section } from '../ui-components.mts';

function buildArgs(parts: string[]) {
  return parts.filter((x) => x != null && String(x).trim() !== '');
}

export function renderPreflight(root: HTMLElement, ctx: any) {
  const keywordInput = createEl('input', { value: ctx.settings?.defaultKeyword || '', placeholder: '例如：工作服' }) as HTMLInputElement;
  const ensureCountInput = createEl('input', { value: '0', type: 'number', min: '0' }) as HTMLInputElement;
  const timeoutInput = createEl('input', { value: String(ctx.settings?.timeouts?.loginTimeoutSec || 900), type: 'number', min: '30' }) as HTMLInputElement;
  const keepSession = createEl('input', { type: 'checkbox' }) as HTMLInputElement;

  const listBox = createEl('div', { className: 'list' });
  const statusBox = createEl('div', { className: 'muted' }, ['']);

  async function doList() {
    ctx.clearLog();
    const kw = keywordInput.value.trim();
    if (!kw) return;
    const out = await window.api.cmdRunJson({
      title: 'profilepool list',
      cwd: '',
      args: buildArgs([window.api.pathJoin('scripts', 'profilepool.mjs'), 'list', kw, '--json']),
    });
    listBox.textContent = '';
    if (!out?.ok || !out?.json) {
      listBox.appendChild(createEl('div', { className: 'item' }, ['(failed)']));
      return;
    }
    const profiles = out.json.profiles || [];
    profiles.forEach((p: string) => listBox.appendChild(createEl('div', { className: 'item' }, [p])));
    statusBox.textContent = `count=${profiles.length} root=${out.json.root}`;
  }

  async function doAdd() {
    ctx.clearLog();
    const kw = keywordInput.value.trim();
    if (!kw) return;
    const out = await window.api.cmdRunJson({
      title: 'profilepool add',
      cwd: '',
      args: buildArgs([window.api.pathJoin('scripts', 'profilepool.mjs'), 'add', kw, '--json']),
    });
    ctx.appendLog(JSON.stringify(out?.json || out, null, 2));
    await doList();
  }

  async function doLogin() {
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

  const actions = createEl('div', { className: 'row' }, [
    createEl('button', { className: 'secondary' }, ['扫描池']),
    createEl('button', { className: 'secondary' }, ['新增一个']),
    createEl('button', {}, ['批量登录/补登录']),
  ]);
  (actions.children[0] as HTMLButtonElement).onclick = () => void doList();
  (actions.children[1] as HTMLButtonElement).onclick = () => void doAdd();
  (actions.children[2] as HTMLButtonElement).onclick = () => void doLogin();

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
      actions,
      statusBox,
      listBox,
    ]),
  );
}

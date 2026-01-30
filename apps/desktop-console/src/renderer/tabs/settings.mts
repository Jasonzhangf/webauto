import { createEl, labeledInput, section } from '../ui-components.mts';

export function renderSettings(root: HTMLElement, ctx: any) {
  const unified = createEl('input', { value: ctx.settings?.unifiedApiUrl || 'http://127.0.0.1:7701' }) as HTMLInputElement;
  const browser = createEl('input', { value: ctx.settings?.browserServiceUrl || 'http://127.0.0.1:7704' }) as HTMLInputElement;
  const download = createEl('input', { value: ctx.settings?.downloadRoot || '' }) as HTMLInputElement;
  const env = createEl('select') as HTMLSelectElement;
  ['debug', 'prod'].forEach((x) => env.appendChild(createEl('option', { value: x }, [x])));
  env.value = ctx.settings?.defaultEnv || 'debug';
  const keyword = createEl('input', { value: ctx.settings?.defaultKeyword || '' }) as HTMLInputElement;

  async function save() {
    const next = await window.api.settingsSet({
      unifiedApiUrl: unified.value.trim(),
      browserServiceUrl: browser.value.trim(),
      downloadRoot: download.value.trim(),
      defaultEnv: env.value,
      defaultKeyword: keyword.value,
    });
    ctx.settings = next;
    ctx.appendLog('[settings] saved');
  }

  root.appendChild(
    section('设置', [
      createEl('div', { className: 'row' }, [
        labeledInput('Unified API', unified),
        labeledInput('Browser Service', browser),
      ]),
      createEl('div', { className: 'row' }, [
        labeledInput('downloadRoot', download),
        labeledInput('defaultEnv', env),
        labeledInput('defaultKeyword', keyword),
      ]),
      createEl('div', { className: 'row' }, [
        createEl('button', {}, ['保存']),
      ]),
      createEl('div', { className: 'muted' }, ['保存到 ~/.webauto/ui-settings.console.json']),
    ]),
  );
  (root.querySelector('button') as HTMLButtonElement).onclick = () => void save();
}


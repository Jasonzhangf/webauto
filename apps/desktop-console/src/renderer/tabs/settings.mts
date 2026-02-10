import { createEl, labeledInput, section } from '../ui-components.mts';
import { resolveConfigPath } from '../path-helpers.mts';

export function renderSettings(root: HTMLElement, ctx: any) {
  const unified = createEl('input', { value: ctx.settings?.unifiedApiUrl || 'http://127.0.0.1:7701' }) as HTMLInputElement;
  const browser = createEl('input', { value: ctx.settings?.browserServiceUrl || 'http://127.0.0.1:7704' }) as HTMLInputElement;
  const searchGate = createEl('input', { value: ctx.settings?.searchGateUrl || 'http://127.0.0.1:7790' }) as HTMLInputElement;
  const download = createEl('input', { value: ctx.settings?.downloadRoot || '' }) as HTMLInputElement;
  const env = createEl('select') as HTMLSelectElement;
  ['debug', 'prod'].forEach((x) => env.appendChild(createEl('option', { value: x }, [x])));
  env.value = ctx.settings?.defaultEnv || 'debug';
  const keyword = createEl('input', { value: ctx.settings?.defaultKeyword || '' }) as HTMLInputElement;
  const loginTimeout = createEl('input', { value: String(ctx.settings?.timeouts?.loginTimeoutSec || 900), type: 'number', min: '30' }) as HTMLInputElement;
  const cmdTimeout = createEl('input', { value: String(ctx.settings?.timeouts?.cmdTimeoutSec || 0), type: 'number', min: '0' }) as HTMLInputElement;
  const configPath = resolveConfigPath(ctx.settings?.downloadRoot || '', window.api);

  async function save() {
    const next = await window.api.settingsSet({
      unifiedApiUrl: unified.value.trim(),
      browserServiceUrl: browser.value.trim(),
      searchGateUrl: searchGate.value.trim(),
      downloadRoot: download.value.trim(),
      defaultEnv: env.value,
      defaultKeyword: keyword.value,
      timeouts: {
        loginTimeoutSec: Number(loginTimeout.value || '900'),
        cmdTimeoutSec: Number(cmdTimeout.value || '0'),
      },
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
        labeledInput('SearchGate', searchGate),
        labeledInput('downloadRoot', download),
        labeledInput('defaultEnv', env),
        labeledInput('defaultKeyword', keyword),
      ]),
      createEl('div', { className: 'row' }, [
        labeledInput('loginTimeoutSec', loginTimeout),
        labeledInput('cmdTimeoutSec', cmdTimeout),
      ]),
      createEl('div', { className: 'row' }, [
        createEl('button', {}, ['保存']),
      ]),
      createEl('div', { className: 'muted' }, [`保存到 ${configPath} 的 desktopConsole 配置块（若 dist/modules/config 不可用则 fallback 到 legacy settings 文件）`]),
    ]),
  );
  (root.querySelector('button') as HTMLButtonElement).onclick = () => void save();
}

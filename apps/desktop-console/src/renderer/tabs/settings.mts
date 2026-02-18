import { createEl, labeledInput, section } from '../ui-components.mts';
import { resolveConfigPath } from '../path-helpers.mts';
import { renderDebug } from './debug.mts';

export function renderSettings(root: HTMLElement, ctx: any) {
  const coreDaemon = createEl('input', { value: ctx.settings?.coreDaemonUrl || 'http://127.0.0.1:7700' }) as HTMLInputElement;
  const download = createEl('input', { value: ctx.settings?.downloadRoot || '' }) as HTMLInputElement;
  const env = createEl('select') as HTMLSelectElement;
  ['debug', 'prod'].forEach((x) => env.appendChild(createEl('option', { value: x }, [x])));
  env.value = ctx.settings?.defaultEnv || 'prod';
  const keyword = createEl('input', { value: ctx.settings?.defaultKeyword || '' }) as HTMLInputElement;
  const loginTimeout = createEl('input', { value: String(ctx.settings?.timeouts?.loginTimeoutSec || 900), type: 'number', min: '30' }) as HTMLInputElement;
  const cmdTimeout = createEl('input', { value: String(ctx.settings?.timeouts?.cmdTimeoutSec || 0), type: 'number', min: '0' }) as HTMLInputElement;
  // AI Reply Configuration
  const aiEnabled = createEl('input', { type: 'checkbox', checked: ctx.settings?.aiReply?.enabled ?? false }) as HTMLInputElement;
  const aiBaseUrl = createEl('input', { value: ctx.settings?.aiReply?.baseUrl || 'http://127.0.0.1:5520', placeholder: 'http://127.0.0.1:5520' }) as HTMLInputElement;
  const aiApiKey = createEl('input', { value: ctx.settings?.aiReply?.apiKey || '', type: 'password', placeholder: 'sk-...' }) as HTMLInputElement;
  const aiModel = createEl('input', { value: ctx.settings?.aiReply?.model || 'iflow.glm-5', placeholder: 'iflow.glm-5' }) as HTMLInputElement;
  const aiTemperature = createEl('input', { value: String(ctx.settings?.aiReply?.temperature ?? 0.7), type: 'number', min: '0', max: '2', step: '0.1' }) as HTMLInputElement;
  const aiMaxChars = createEl('input', { value: String(ctx.settings?.aiReply?.maxChars ?? 20), type: 'number', min: '5', max: '500' }) as HTMLInputElement;
  const aiTimeout = createEl('input', { value: String(ctx.settings?.aiReply?.timeoutMs ?? 25000), type: 'number', min: '5000', step: '1000' }) as HTMLInputElement;
  const aiStyle = createEl('select') as HTMLSelectElement;
  ['friendly', 'professional', 'humorous', 'concise', 'custom'].forEach((x) => aiStyle.appendChild(createEl('option', { value: x }, [x])));
  aiStyle.value = ctx.settings?.aiReply?.stylePreset || 'friendly';
  const aiStyleCustom = createEl('input', { value: ctx.settings?.aiReply?.styleCustom || '', placeholder: '自定义风格描述（可选）' }) as HTMLInputElement;
  const aiTestResult = createEl('div', { className: 'muted', style: 'min-height:1.5em;' }) as HTMLDivElement;

  async function fetchModels() {
    try {
      aiTestResult.textContent = '获取模型列表中...';
      const result = await (window as any).api.invoke('ai:listModels', {
        baseUrl: aiBaseUrl.value.trim(),
        apiKey: aiApiKey.value.trim(),
      });
      if (result.ok && result.models?.length > 0) {
        aiTestResult.textContent = '找到 ' + result.models.length + ' 个模型: ' + result.models.slice(0, 3).join(', ') + (result.models.length > 3 ? '...' : '');
        if (!aiModel.value && result.models[0]) {
          aiModel.value = result.models[0];
        }
      } else {
        aiTestResult.textContent = result.error ? '错误: ' + result.error : '未找到模型';
      }
    } catch (e: any) {
      aiTestResult.textContent = '错误: ' + (e?.message || String(e));
    }
  }

  async function testConnection() {
    try {
      aiTestResult.textContent = '测试连通性...';
      const result = await (window as any).api.invoke('ai:testChatCompletion', {
        baseUrl: aiBaseUrl.value.trim(),
        apiKey: aiApiKey.value.trim(),
        model: aiModel.value.trim() || 'iflow.glm-5',
        timeoutMs: Number(aiTimeout.value) || 25000,
      });
      if (result.ok) {
        aiTestResult.textContent = '连通成功 (' + result.latencyMs + 'ms)';
      } else {
        aiTestResult.textContent = result.error ? '错误: ' + result.error : '测试失败';
      }
    } catch (e: any) {
      aiTestResult.textContent = '错误: ' + (e?.message || String(e));
    }
  }
  const configPath = resolveConfigPath(ctx.settings?.downloadRoot || '', window.api);
  const debugHost = createEl('div') as HTMLDivElement;

  async function save() {
    const next = await window.api.settingsSet({
      coreDaemonUrl: coreDaemon.value.trim(),
      downloadRoot: download.value.trim(),
      defaultEnv: env.value,
      defaultKeyword: keyword.value,
      timeouts: {
        loginTimeoutSec: Number(loginTimeout.value || '900'),
        cmdTimeoutSec: Number(cmdTimeout.value || '0'),
      },
      aiReply: {
        enabled: aiEnabled.checked,
        baseUrl: aiBaseUrl.value.trim(),
        apiKey: aiApiKey.value.trim(),
        model: aiModel.value.trim(),
        temperature: Number(aiTemperature.value) || 0.7,
        maxChars: Number(aiMaxChars.value) || 20,
        timeoutMs: Number(aiTimeout.value) || 25000,
        stylePreset: aiStyle.value as any,
        styleCustom: aiStyleCustom.value.trim(),
      },
    });
    ctx.settings = next;
    ctx.appendLog('[settings] saved');
  }

  root.appendChild(
    section('设置', [
      createEl('div', { className: 'row' }, [
        labeledInput('Core Daemon', coreDaemon),
      ]),
      createEl('div', { className: 'row' }, [
        
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
      section('AI 智能回复', [
        createEl('div', { className: 'row' }, [
          labeledInput('启用智能回复', aiEnabled),
        ]),
        createEl('div', { className: 'row' }, [
          labeledInput('API Base URL', aiBaseUrl),
          labeledInput('API Key', aiApiKey),
        ]),
        createEl('div', { className: 'row' }, [
          labeledInput('模型', aiModel),
          createEl('button', { style: 'margin-left:8px;' }, ['获取模型列表']),
          createEl('button', { style: 'margin-left:8px;' }, ['测试连通']),
        ]),
        createEl('div', { className: 'row' }, [
          labeledInput('Temperature', aiTemperature),
          labeledInput('最大字数', aiMaxChars),
          labeledInput('超时(ms)', aiTimeout),
        ]),
        createEl('div', { className: 'row' }, [
          labeledInput('回复风格', aiStyle),
          labeledInput('自定义风格', aiStyleCustom),
        ]),
        aiTestResult,
      ]),
      section('调试（已并入设置）', [debugHost]),
    ]),
  );
  (root.querySelector('button') as HTMLButtonElement).onclick = () => void save();
  const buttons = root.querySelectorAll('button');
  if (buttons[1]) (buttons[1] as HTMLButtonElement).onclick = () => void fetchModels();
  if (buttons[2]) (buttons[2] as HTMLButtonElement).onclick = () => void testConnection();
  renderDebug(debugHost, ctx);
}

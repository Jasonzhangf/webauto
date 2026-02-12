import { createEl } from '../ui-components.mts';

export function renderLogs(root: HTMLElement, ctx: any) {
  root.textContent = '';

 const title = createEl('div', { style: 'font-weight:700; margin-bottom:8px;' }, ['日志 · Logs']);
 const sub = createEl('div', { className: 'muted', style: 'margin-bottom:10px; font-size:12px;' }, [
   '命令事件的运行日志（从主壳上下文收集）。',
 ]);

  const toolbar = createEl('div', { className: 'row', style: 'margin-bottom:8px;' });
  const clearBtn = createEl('button', { type: 'button', className: 'secondary' }, ['清空日志']) as HTMLButtonElement;
  toolbar.appendChild(clearBtn);

  const container = createEl('div', {
    style: 'display:flex; flex-direction:column; gap:10px; font-family:"Cascadia Mono", Consolas, ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px;',
  }) as HTMLDivElement;

  const sectionMap = new Map<string, HTMLDivElement>();

  const extractRunId = (line: string) => {
    const text = String(line || '');
    const byRunTag = text.match(/^\[(?:run:|rid:)([A-Za-z0-9_-]+)\]/);
    if (byRunTag?.[1]) return String(byRunTag[1]);
    const byRunIdField = text.match(/runId=([A-Za-z0-9_-]+)/);
    if (byRunIdField?.[1]) return String(byRunIdField[1]);
    const byRunIdTag = text.match(/\[runId:([A-Za-z0-9_-]+)\]/);
    if (byRunIdTag?.[1]) return String(byRunIdTag[1]);
    return 'global';
  };

  const ensureSection = (runId: string) => {
    const normalized = String(runId || 'global').trim() || 'global';
    const existing = sectionMap.get(normalized);
    if (existing) return existing;

    const card = createEl('div', {
      style: 'border:1px solid #23262f; background:#0b0d12; border-radius:10px; overflow:hidden;',
    }) as HTMLDivElement;
    const head = createEl('div', {
      style: 'padding:8px 12px; border-bottom:1px solid #23262f; background:#121622; font-weight:600; color:#9aa4bd;',
    }, [normalized === 'global' ? '公共日志' : `runId: ${normalized}`]);
    const body = createEl('div', {
      style: 'padding:10px 12px; white-space:pre-wrap; word-break:break-all; line-height:1.5;',
    }) as HTMLDivElement;

    card.appendChild(head);
    card.appendChild(body);
    container.appendChild(card);
    sectionMap.set(normalized, body);
    return body;
  };

  const appendLine = (line: string) => {
    const text = String(line || '').trim();
    if (!text) return;
    const runId = extractRunId(text);
    const body = ensureSection(runId);
    const div = createEl('div', { className: 'muted' }, [text]);
    body.appendChild(div);
  };

  clearBtn.onclick = () => {
    ctx.clearLog();
    container.textContent = '';
    sectionMap.clear();
  };

  // 初始渲染现有日志
  const existingLines = (ctx as any)._logLines || [];
  if (Array.isArray(existingLines)) {
    existingLines.forEach((line: string) => {
      appendLine(line);
    });
  }

  // 监听后续日志追加
  const originalAppendLog = typeof ctx._appendLogBase === 'function' ? ctx._appendLogBase : ctx.appendLog;
  ctx._appendLogBase = originalAppendLog;
  ctx.appendLog = (line: string) => {
    appendLine(line);
    // 同时保留原有行为（如果其他地方需要）
    if (typeof originalAppendLog === 'function') originalAppendLog(line);
  };

 root.appendChild(title);
 root.appendChild(sub);
 root.appendChild(toolbar);
 root.appendChild(container);
}

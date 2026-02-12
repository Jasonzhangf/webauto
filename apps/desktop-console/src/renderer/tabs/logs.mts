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
    style: 'border:1px solid #23262f; background:#0b0d12; padding:10px 14px; border-radius:10px; height:calc(100vh - 140px); overflow:auto; font-family:"Cascadia Mono", Consolas, ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; white-space:pre-wrap; word-break:break-all;',
  }) as HTMLDivElement;

  clearBtn.onclick = () => {
    ctx.clearLog();
    container.textContent = '';
  };

  // 初始渲染现有日志
  const existingLines = (ctx as any)._logLines || [];
  if (Array.isArray(existingLines)) {
    existingLines.forEach((line: string) => {
      const div = createEl('div', { className: 'muted' }, [line]);
      container.appendChild(div);
    });
  }

  // 监听后续日志追加
  const originalAppendLog = ctx.appendLog;
  ctx.appendLog = (line: string) => {
    const div = createEl('div', { className: 'muted' }, [line]);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    // 同时保留原有行为（如果其他地方需要）
    if (typeof originalAppendLog === 'function') originalAppendLog(line);
  };

  root.appendChild(title);
  root.appendChild(sub);
  root.appendChild(toolbar);
  root.appendChild(container);
}

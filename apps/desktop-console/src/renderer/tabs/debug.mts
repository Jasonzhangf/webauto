import { createEl } from '../ui-components.mts';
import { renderRun } from './run.mts';
import { renderResults } from './results.mts';

type DebugViewId = 'run' | 'results';

let activeDebugView: DebugViewId = 'run';

export function renderDebug(root: HTMLElement, ctx: any) {
  root.textContent = '';

  const title = createEl('div', { style: 'font-weight:700; margin-bottom:8px;' }, ['Debug · 调用与结果']);
  const sub = createEl('div', { className: 'muted', style: 'margin-bottom:10px; font-size:12px;' }, [
    '“调用”和“结果”已整合到 Debug 页；Runtime 已从主导航移除。',
  ]);

  const switcher = createEl('div', { className: 'row', style: 'margin-bottom:8px;' });
  const runBtn = createEl('button', { type: 'button' }, ['调用']) as HTMLButtonElement;
  const resultsBtn = createEl('button', { type: 'button', className: 'secondary' }, ['结果']) as HTMLButtonElement;

  const panel = createEl('div');

  const setView = (id: DebugViewId) => {
    activeDebugView = id;
    runBtn.className = id === 'run' ? '' : 'secondary';
    resultsBtn.className = id === 'results' ? '' : 'secondary';

    panel.textContent = '';
    if (id === 'run') {
      renderRun(panel, ctx);
      return;
    }
    renderResults(panel, ctx);
  };

  runBtn.onclick = () => setView('run');
  resultsBtn.onclick = () => setView('results');

  switcher.appendChild(runBtn);
  switcher.appendChild(resultsBtn);

  root.appendChild(title);
  root.appendChild(sub);
  root.appendChild(switcher);
  root.appendChild(panel);

  setView(activeDebugView);
}

import { createEl } from '../../ui-components.mts';
import type { TestBucket, TestRunResult } from './types.mts';
import { BUCKET_LABELS, AGGREGATE_BUCKETS } from './types.mts';
import { countBucketTests } from './scanner.mts';

export interface TestCenterUI {
  container: HTMLDivElement;
  sidebar: HTMLDivElement;
  mainContent: HTMLDivElement;
  toolbar: HTMLDivElement;
  testList: HTMLDivElement;
  logPanel: HTMLDivElement;
  summaryPanel: HTMLDivElement;
  refreshBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;
  exportBtn: HTMLButtonElement;
  searchInput: HTMLInputElement;
  pauseLogBtn: HTMLButtonElement;
  clearLogBtn: HTMLButtonElement;
}

export function renderTestCenterLayout(root: HTMLElement): TestCenterUI {
  root.textContent = '';

  const container = createEl('div', {
    style: 'display:flex; flex-direction:column; height:100%; gap:8px;',
  }) as HTMLDivElement;

  // Toolbar
  const toolbar = createEl('div', {
    className: 'row',
    style: 'align-items:center; gap:8px; padding:8px; background:var(--bg-secondary); border-radius:4px;',
  }) as HTMLDivElement;

  const searchInput = createEl('input', {
    type: 'text',
    placeholder: '搜索测试用例...',
    style: 'flex:1; min-width:200px;',
  }) as HTMLInputElement;

  const refreshBtn = createEl('button', { type: 'button' }, ['刷新注册']) as HTMLButtonElement;
  const stopBtn = createEl('button', { type: 'button', className: 'secondary', disabled: true }, ['停止']) as HTMLButtonElement;
  const exportBtn = createEl('button', { type: 'button', className: 'secondary' }, ['导出报告']) as HTMLButtonElement;

  toolbar.appendChild(searchInput);
  toolbar.appendChild(refreshBtn);
  toolbar.appendChild(stopBtn);
  toolbar.appendChild(exportBtn);

  // Main content area
  const contentWrapper = createEl('div', {
    style: 'display:flex; gap:8px; flex:1; min-height:0;',
  });

  // Sidebar - Bucket navigation
  const sidebar = createEl('div', {
    style: 'width:200px; overflow-y:auto; padding:8px; background:var(--bg-secondary); border-radius:4px;',
  }) as HTMLDivElement;

  // Test list
  const mainContent = createEl('div', {
    style: 'flex:1; display:flex; flex-direction:column; gap:8px; min-width:0;',
  }) as HTMLDivElement;

  const testList = createEl('div', {
    style: 'flex:1; overflow-y:auto; padding:8px; background:var(--bg-secondary); border-radius:4px;',
  }) as HTMLDivElement;

  // Summary panel
  const summaryPanel = createEl('div', {
    style: 'padding:8px; background:var(--bg-secondary); border-radius:4px; font-size:12px;',
  }) as HTMLDivElement;

  // Log panel
  const logPanel = createEl('div', {
    style: 'height:200px; overflow-y:auto; padding:8px; background:#1e1e1e; border-radius:4px; font-family:monospace; font-size:12px;',
  }) as HTMLDivElement;

  const logToolbar = createEl('div', { className: 'row', style: 'gap:8px; margin-bottom:4px;' });
  const pauseLogBtn = createEl('button', { type: 'button', className: 'secondary' }, ['暂停日志']) as HTMLButtonElement;
  const clearLogBtn = createEl('button', { type: 'button', className: 'secondary' }, ['清空日志']) as HTMLButtonElement;
  logToolbar.appendChild(pauseLogBtn);
  logToolbar.appendChild(clearLogBtn);

  mainContent.appendChild(testList);
  mainContent.appendChild(summaryPanel);
  mainContent.appendChild(logToolbar);
  mainContent.appendChild(logPanel);

  contentWrapper.appendChild(sidebar);
  contentWrapper.appendChild(mainContent);

  container.appendChild(toolbar);
  container.appendChild(contentWrapper);

  root.appendChild(container);

  return {
    container,
    sidebar,
    mainContent,
    toolbar,
    testList,
    logPanel,
    summaryPanel,
    refreshBtn,
    stopBtn,
    exportBtn,
    searchInput,
    pauseLogBtn,
    clearLogBtn,
  };
}

export function renderSidebar(
  sidebar: HTMLDivElement,
  buckets: TestBucket[],
  selectedId: string | null,
  onSelect: (id: string) => void,
  onRunBucket: (id: string) => void,
  running: boolean,
  currentBucketId: string | null
) {
  sidebar.textContent = '';

  // Render aggregate buckets first
  const aggregateSection = createEl('div', { style: 'margin-bottom:12px;' });
  aggregateSection.appendChild(createEl('div', { style: 'font-weight:700; margin-bottom:6px; font-size:11px; text-transform:uppercase; color:var(--text-secondary);' }, ['快捷运行']));

  for (const agg of AGGREGATE_BUCKETS) {
    const aggItem = createEl('div', { style: 'margin-bottom:4px;' });
    const aggBtn = createEl('button', {
      type: 'button',
      className: 'secondary',
      style: 'width:100%; text-align:left; padding:4px 8px; font-size:12px;',
      disabled: running,
    }, [agg.label]) as HTMLButtonElement;
    aggBtn.onclick = () => onRunBucket(agg.id);
    aggItem.appendChild(aggBtn);
    aggregateSection.appendChild(aggItem);
  }

  sidebar.appendChild(aggregateSection);

  // Render individual buckets
  const bucketSection = createEl('div', {});
  bucketSection.appendChild(createEl('div', { style: 'font-weight:700; margin-bottom:6px; font-size:11px; text-transform:uppercase; color:var(--text-secondary);' }, ['测试板块']));

  function renderBucket(bucket: TestBucket, depth = 0) {
    const item = createEl('div', {
      style: `margin-bottom:2px; padding-left:${depth * 12}px;`,
    });

    const isSelected = bucket.id === selectedId;
    const isRunning = running && bucket.id === currentBucketId;
    const testCount = countBucketTests(bucket);

    const btn = createEl('button', {
      type: 'button',
      className: isSelected ? '' : 'secondary',
      style: 'width:100%; text-align:left; padding:4px 8px; font-size:12px;',
    }, [`${bucket.label} (${testCount})`]) as HTMLButtonElement;

    btn.onclick = () => onSelect(bucket.id);
    item.appendChild(btn);

    if (isRunning) {
      const spinner = createEl('span', { style: 'margin-left:4px; color:var(--accent);' }, ['⏳']);
      item.appendChild(spinner);
    }

    bucketSection.appendChild(item);

    // Run button
    const runBtn = createEl('button', {
      type: 'button',
      className: 'secondary',
      style: 'margin-left:4px; padding:2px 6px; font-size:10px;',
      disabled: running,
    }, ['▶']) as HTMLButtonElement;
    runBtn.onclick = (e) => { e.stopPropagation(); onRunBucket(bucket.id); };
    item.appendChild(runBtn);

    // Render sub-buckets
    if (bucket.subBuckets) {
      bucket.subBuckets.forEach(sub => renderBucket(sub, depth + 1));
    }
  }

  buckets.forEach(b => renderBucket(b));
  sidebar.appendChild(bucketSection);
}

export function renderTestList(
  testList: HTMLDivElement,
  bucket: TestBucket | null,
  results: Map<string, TestRunResult>,
  filter: string,
  onRunSingle: (file: string, suite: string, name: string) => void
) {
  testList.textContent = '';

  if (!bucket) {
    testList.appendChild(createEl('div', { className: 'muted' }, ['请选择左侧测试板块']));
    return;
  }

  function renderSuiteItem(suite: any, bucketId: string) {
    for (const tc of suite.cases) {
      if (filter && !tc.name.toLowerCase().includes(filter.toLowerCase())) continue;

      const result = results.get(`${suite.name}::${tc.name}`);
      const status = result?.status || tc.status;

      const row = createEl('div', {
        style: 'display:flex; align-items:center; gap:8px; padding:6px 8px; border-bottom:1px solid var(--border-color);',
      });

      const statusIcon = status === 'passed' ? '✓' : status === 'failed' ? '✗' : status === 'running' ? '⏳' : '○';
      const statusColor = status === 'passed' ? '#4caf50' : status === 'failed' ? '#f44336' : status === 'running' ? '#ff9800' : 'var(--text-secondary)';

      row.appendChild(createEl('span', { style: `color:${statusColor}; font-weight:700; min-width:20px;` }, [statusIcon]));
      row.appendChild(createEl('span', { style: 'flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;' }, [tc.name]));

      if (result?.duration) {
        row.appendChild(createEl('span', { style: 'font-size:11px; color:var(--text-secondary);' }, [`${result.duration}ms`]));
      }

      const runBtn = createEl('button', {
        type: 'button',
        className: 'secondary',
        style: 'padding:2px 6px; font-size:10px;',
      }, ['▶']) as HTMLButtonElement;
      runBtn.onclick = () => onRunSingle(tc.file, suite.name, tc.name);
      row.appendChild(runBtn);

      if (result?.error) {
        const errorRow = createEl('div', {
          style: 'margin-left:28px; color:#f44336; font-size:11px; white-space:pre-wrap; padding:4px 0;',
        }, [result.error.slice(0, 200)]);
        testList.appendChild(row);
        testList.appendChild(errorRow);
      } else {
        testList.appendChild(row);
      }
    }
  }

  // Render suites in this bucket
  for (const suite of bucket.suites) {
    const suiteHeader = createEl('div', {
      style: 'font-weight:700; padding:8px 4px 4px; color:var(--text-secondary); font-size:11px;',
    }, [suite.name]);
    testList.appendChild(suiteHeader);
    renderSuiteItem(suite, bucket.id);
  }

  // Render sub-buckets
  if (bucket.subBuckets) {
    for (const sub of bucket.subBuckets) {
      const subHeader = createEl('div', {
        style: 'font-weight:700; padding:12px 4px 4px; color:var(--text-secondary); font-size:12px; border-top:1px solid var(--border-color); margin-top:8px;',
      }, [sub.label]);
      testList.appendChild(subHeader);

      for (const suite of sub.suites) {
        const suiteHeader = createEl('div', {
          style: 'font-weight:600; padding:4px; font-size:11px; color:var(--text-secondary);',
        }, [suite.name]);
        testList.appendChild(suiteHeader);
        renderSuiteItem(suite, sub.id);
      }
    }
  }
}

export function renderLogs(logPanel: HTMLDivElement, logs: string[], paused: boolean) {
  if (paused) return;

  // Only render new logs
  const currentLineCount = logPanel.children.length;
  const newLogs = logs.slice(currentLineCount);

  for (const line of newLogs) {
    const color = line.includes('ERROR') ? '#f44336' :
                  line.includes('passed') ? '#4caf50' :
                  line.includes('failed') ? '#f44336' :
                  '#cccccc';

    const logLine = createEl('div', { style: `color:${color}; white-space:pre-wrap;` }, [line]);
    logPanel.appendChild(logLine);
  }

  // Auto-scroll to bottom
  logPanel.scrollTop = logPanel.scrollHeight;
}

export function renderSummary(summaryPanel: HTMLDivElement, report: any | null) {
  summaryPanel.textContent = '';

  if (!report) {
    summaryPanel.appendChild(createEl('span', { className: 'muted' }, ['运行报告将在测试完成后显示']));
    return;
  }

  const { summary, bucket } = report;
  const summaryText = `总计: ${summary.total} | 通过: ${summary.passed} | 失败: ${summary.failed} | 跳过: ${summary.skipped} | 成功率: ${summary.successRate} | 耗时: ${(summary.duration / 1000).toFixed(2)}s`;

  summaryPanel.appendChild(createEl('span', {
    style: summary.failed > 0 ? 'color:#f44336;' : 'color:#4caf50;',
  }, [summaryText]));
}

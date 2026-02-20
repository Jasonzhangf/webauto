/**
 * Quota Status Component
 * Displays rate limiter status for search/like/comment/follow/repost
 */

import { createEl } from '../ui-components.mts';

export type QuotaInfo = {
  type: string;
  scope: string;
  count: number;
  max: number;
  windowMs: number;
};

export function renderQuotaBar(root: HTMLElement, ctx: any) {
  root.innerHTML = '';
  
  const container = createEl('div', {
    className: 'bento-cell',
    style: 'padding: var(--gap-sm); margin-bottom: var(--gap);'
  });
  
  container.innerHTML = `
    <div style="display: flex; gap: var(--gap); align-items: center; flex-wrap: wrap;">
      <span style="font-size: 11px; color: var(--text-tertiary);">配额:</span>
      <div id="quota-items" style="display: flex; gap: var(--gap); flex-wrap: wrap;"></div>
      <button id="quota-refresh" class="secondary" style="padding: 4px 8px; font-size: 10px; height: auto; margin-left: auto;">刷新</button>
    </div>
  `;
  
  const itemsContainer = container.querySelector('#quota-items') as HTMLDivElement;
  const refreshBtn = container.querySelector('#quota-refresh') as HTMLButtonElement;
  
  function formatWindow(ms: number): string {
    if (ms >= 3600000) return `${Math.round(ms / 60000)}m`;
    if (ms >= 60000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 1000)}s`;
  }
  
  function renderItems(quotas: QuotaInfo[]) {
    itemsContainer.innerHTML = quotas.map(q => {
      const percent = q.max > 0 ? (q.count / q.max) * 100 : 0;
      const color = percent >= 100 ? 'var(--accent-danger)' : 
                    percent >= 80 ? 'var(--accent-warning)' : 
                    'var(--accent-success)';
      
      return `
        <span class="quota-item" style="font-size: 10px; padding: 2px 6px; background: var(--bg-overlay); border-radius: 4px;">
          <span style="color: var(--text-tertiary);">${q.type}</span>
          <span style="color: ${color}; font-weight: 600;">${q.count}/${q.max}</span>
          <span style="color: var(--text-muted);">${formatWindow(q.windowMs)}</span>
        </span>
      `;
    }).join('');
  }
  
  async function loadQuotas() {
    try {
      const result = await ctx.api.cmdRunJson({
        script: 'apps/webauto/entry/schedule.mjs',
        args: ['quota-status', '--json'],
      });
      
      if (result?.quotas) {
        renderItems(result.quotas);
      } else {
        itemsContainer.innerHTML = '<span class="muted" style="font-size:10px;">加载中...</span>';
      }
    } catch (err) {
      console.error('Failed to load quotas:', err);
      itemsContainer.innerHTML = '<span class="muted" style="font-size:10px;">-</span>';
    }
  }
  
  refreshBtn.addEventListener('click', loadQuotas);
  
  // Initial load
  loadQuotas();
  
  // Auto refresh every 30s
  const interval = setInterval(loadQuotas, 30000);
  
  // Cleanup
  return () => clearInterval(interval);
}

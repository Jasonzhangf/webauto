/**
 * Operation UI 渲染辅助函数
 * 负责生成 operation 列表的 HTML（紧凑布局）
 */

export interface OperationRenderOptions {
  containerId: string;
  operations: any[];
  primarySelector: string | null;
  domPath: string | null;
  hasRawOperations: boolean;
}

export function buildDefaultOperations(containerId: string, primarySelector: string | null, domPath: string | null): any[] {
  const baseConfig: Record<string, any> = {};
  if (primarySelector) {
    baseConfig.selector = primarySelector;
  } else if (typeof domPath === 'string' && domPath.trim()) {
    baseConfig.dom_path = domPath.trim();
  }

  return [
    {
      id: `${containerId}.appear.highlight`,
      type: 'highlight',
      triggers: ['appear'],
      enabled: true,
      config: {
        ...baseConfig,
        style: '2px solid #fbbc05',
        duration: 1500,
      },
    },
  ];
}

export function renderOperationsList(options: OperationRenderOptions): { html: string; hasSuggested: boolean } {
  const { containerId, operations, primarySelector, domPath, hasRawOperations } = options;

  // 若无 operations，生成默认建议
  const synthesizedOperations: any[] = !hasRawOperations ? buildDefaultOperations(containerId, primarySelector, domPath) : [];
  const hasSuggestedOperations = !hasRawOperations && synthesizedOperations.length > 0;

  const opsToRender: any[] = (hasRawOperations ? operations : synthesizedOperations).map((op: any) => ({ ...op }));

  if (!opsToRender.length) {
    return {
      html: renderEmptyState(),
      hasSuggested: false,
    };
  }

  // 按事件分组
  const DEFAULT_TRIGGER = 'appear';
  const preferredOrder = ['appear', 'click', 'manual:rehearsal'];
  const grouped = new Map<string, Array<{ op: any; index: number }>>();

  opsToRender.forEach((op: any, index: number) => {
    const triggers = Array.isArray(op.triggers) && op.triggers.length ? op.triggers : [DEFAULT_TRIGGER];
    triggers.forEach((raw) => {
      const key = String(raw || '').trim() || DEFAULT_TRIGGER;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push({ op, index });
    });
  });

  const triggerOrder: string[] = [];
  preferredOrder.forEach((t) => {
    if (grouped.has(t)) triggerOrder.push(t);
  });
  Array.from(grouped.keys()).forEach((t) => {
    if (!triggerOrder.includes(t)) triggerOrder.push(t);
  });

  const messageOpsHtml = triggerOrder
    .map((trigger) => {
      const rows = grouped.get(trigger) || [];
      const rowsHtml = rows.length
        ? rows.map(({ op, index }) => renderOperationRow(op, index)).join('')
        : `<div class="operation-empty-row">当前事件下暂无操作</div>`;
      return `<section class="operation-group">
        <header class="operation-group-header">
          <span>${renderTriggerLabel(trigger)}</span>
          <span>${rows.length} 个操作</span>
        </header>
        <div class="operation-group-body">${rowsHtml}</div>
      </section>`;
    })
    .join('');

  return {
    html: messageOpsHtml,
    hasSuggested: hasSuggestedOperations,
  };
}

function renderEmptyState(): string {
  return `
    <div style="padding:4px;border:1px dashed #3e3e3e;border-radius:3px;background:#222;">
      <div style="font-size:10px;color:#ccc;font-weight:600;">暂无 Operation</div>
      <div style="font-size:9px;color:#777;margin-top:2px;">该容器尚未配置任何操作，可从零开始创建。</div>
      <div style="margin-top:4px;display:flex;gap:4px;align-items:center;">
        <button id="btnSeedOps" style="font-size:9px;padding:2px 6px;">生成默认 Operation</button>
        <span style="font-size:8px;color:#666;">基于 selector / DOM 路径生成</span>
      </div>
    </div>
  `;
}

function renderOperationRow(op: any, index: number): string {
  const key = op.id || `${op.type || 'unknown'}`;
  const enabled = op.enabled !== false;
  const opIcon =
    op.type === 'highlight' ? '💡'
      : op.type === 'scroll' ? '📜'
        : op.type === 'extract' ? '📋'
          : '⚙️';
  const triggers = Array.isArray(op.triggers) && op.triggers.length ? op.triggers.join(', ') : 'appear';
  const configPreview = formatConfigPreview(op.config);

  return `<div class="operation-card" draggable="true" data-op-index="${index}">
    <div class="operation-card-main">
      <div class="operation-card-title">
        <span>${opIcon}</span>
        <span class="operation-name" title="${key}">${key}</span>
        <span class="operation-type-badge">${op.type || 'unknown'}</span>
        ${!enabled ? '<span class="operation-disabled">已禁用</span>' : ''}
      </div>
      <div class="operation-card-meta">
        <span>触发：${triggers}</span>
        <span>ID：${op.id || '未定义'}</span>
      </div>
      <pre class="operation-card-config">${configPreview}</pre>
    </div>
    <div class="operation-card-actions">
      <button data-op-index="${index}" data-op-action="toggle">${enabled ? '禁用' : '启用'}</button>
      <button data-op-index="${index}" data-op-action="edit">编辑</button>
      <button data-op-index="${index}" data-op-action="rehearse">演练</button>
      <button data-op-index="${index}" data-op-action="delete">删除</button>
    </div>
  </div>`;
}

function renderTriggerLabel(trigger: string): string {
  if (trigger === 'appear') return 'appear';
  if (trigger === 'click') return 'click';
  if (trigger === 'manual:rehearsal') return 'rehearsal';
  return trigger;
}

export function renderAddOperationPanel(primarySelector: string | null, domPath: string | null): string {
  return `
    <div class="operation-quick-add">
      <div class="operation-quick-add-header">
        <span>快速添加 Operation</span>
        ${primarySelector
      ? '<span class="hint ok">✓ 已定位主 selector</span>'
      : '<span class="hint warn">⚠ 未提供 selector，将使用 DOM Path</span>'
    }
      </div>
      <div class="operation-quick-add-body">
        <label>触发
          <select id="opTriggerSelect">
            <option value="appear">appear</option>
            <option value="click">click</option>
            <option value="manual:rehearsal">rehearsal</option>
          </select>
        </label>
        <label>类型
          <select id="opTypeSelect">
            <option value="highlight">highlight</option>
            <option value="scroll">scroll</option>
            <option value="extract">extract</option>
          </select>
        </label>
        <button id="btnAddOp">添加</button>
      </div>
      <div class="operation-quick-add-footer">
        highlight 用于高亮显示，scroll 自动滚动到视图，extract 提取内容数据。新增操作后可在上方列表中调整。
      </div>
    </div>
  `;
}

function formatConfigPreview(config: any): string {
  if (!config) return '{}';
  const json = JSON.stringify(config, null, 2);
  return json.length > 240 ? `${json.slice(0, 240)}…` : json;
}

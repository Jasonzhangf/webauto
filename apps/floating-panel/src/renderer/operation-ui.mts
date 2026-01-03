/**
 * Operation UI 渲染辅助函数
 * 负责生成 operation 列表的 HTML
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
      const rowsHtml = rows
        .map(({ op, index }) => renderOperationRow(op, index))
        .join('');
      return `<div style="display:flex;align-items:flex-start;padding:4px 0;border-bottom:1px solid #2a2a2a;">
        <div style="width:96px;font-size:10px;color:#9cdcfe;padding-top:2px;">${renderTriggerLabel(trigger)}</div>
        <div style="flex:1;min-width:0;">${rowsHtml || '<div style="font-size:10px;color:#666;">当前消息下暂无操作</div>'}</div>
      </div>`;
    })
    .join('');

  return {
    html: messageOpsHtml,
    hasSuggested: hasSuggestedOperations,
  };
}

function renderEmptyState(): string {
  return `
    <div style="padding:6px;border:1px dashed #3e3e3e;border-radius:4px;background:#222;">
      <div style="font-size:11px;color:#ccc;font-weight:600;">暂无 Operation</div>
      <div style="font-size:10px;color:#777;margin-top:2px;">该容器尚未配置任何操作，可从零开始创建。</div>
      <div style="margin-top:6px;display:flex;gap:6px;align-items:center;">
        <button id="btnSeedOps" style="font-size:10px;padding:2px 6px;">生成默认 Operation</button>
        <span style="font-size:9px;color:#666;">基于 selector / DOM 路径生成</span>
      </div>
    </div>
  `;
}

function renderOperationRow(op: any, index: number): string {
  const key = op.id || `${op.type || 'unknown'}`;
  const configPreview = op.config ? JSON.stringify(op.config).slice(0, 40) : '{}';
  const enabled = op.enabled !== false;
  const opIcon =
    op.type === 'highlight' ? '💡'
      : op.type === 'scroll' ? '📜'
        : op.type === 'extract' ? '📋'
          : '⚙️';

  return `<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:4px;margin-bottom:4px;background:#222;border-radius:3px;border:1px solid #333;">
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">
        <span style="font-size:12px;">${opIcon}</span>
        <span style="color:${enabled ? '#ffd700' : '#777'};font-size:11px;font-weight:600;">${key}</span>
        <span style="font-size:9px;color:#aaa;background:#333;padding:0 4px;border-radius:2px;">${op.type || 'unknown'}</span>
        ${!enabled ? '<span style="font-size:9px;color:#bd7e7e;background:#3d0e0e;padding:0 4px;border-radius:2px;">已禁用</span>' : ''}
      </div>
      <div style="font-size:9px;color:#777;font-family:Consolas,monospace;margin-left:18px;">${configPreview}</div>
    </div>
    <div style="display:flex;gap:4px;align-items:center;">
      <button data-op-index="${index}" data-op-action="toggle" style="font-size:9px;padding:2px 5px;background:#2a2a2a;border:1px solid #444;color:${enabled ? '#e5b507' : '#7ebd7e'};border-radius:2px;">${enabled ? '禁用' : '启用'}</button>
      <button data-op-index="${index}" data-op-action="delete" style="font-size:9px;padding:2px 5px;background:#2a2a2a;border:1px solid #444;color:#bd7e7e;border-radius:2px;">删除</button>
      <button data-op-index="${index}" data-op-action="edit" style="font-size:9px;padding:2px 5px;background:#2a2a2a;border:1px solid #444;color:#ccc;border-radius:2px;">编辑</button>
      <button data-op-index="${index}" data-op-action="rehearse" style="font-size:9px;padding:2px 5px;background:#2a2a2a;border:1px solid #444;color:#ccc;border-radius:2px;">演练</button>
    </div>
  </div>`;
}

function renderTriggerLabel(trigger: string): string {
  if (trigger === 'appear') return 'appear（出现）';
  if (trigger === 'click') return 'click（点击）';
  if (trigger === 'manual:rehearsal') return 'manual:rehearsal（演练）';
  return trigger;
}

export function renderAddOperationPanel(primarySelector: string | null, domPath: string | null): string {
  return `
    <div style="margin-top:8px;padding-top:6px;border-top:1px dashed #3e3e3e;">
      <div style="font-size:11px;color:#ccc;font-weight:600;display:flex;justify-content:space-between;align-items:center;">
        <span>快速添加 Operation</span>
        ${primarySelector
      ? '<span style="font-size:9px;color:#7ebd7e;background:#0e3d0e;padding:1px 4px;border-radius:2px;">✓ 有主 selector</span>'
      : '<span style="font-size:9px;color:#e5b507;background:#3d2e0e;padding:1px 4px;border-radius:2px;">⚠ 无 selector</span>'
    }
      </div>
      ${!primarySelector && typeof domPath === 'string' && domPath.trim()
      ? '<div style="margin-top:2px;font-size:9px;color:#e5b507;">将使用 DOM 路径作为配置目标</div>'
      : ''
    }
    </div>
    <div style="margin-top:2px;display:flex;gap:4px;align-items:center;font-size:10px;">
      <div style="font-size:9px;color:#777;min-width:48px;">触发消息</div>
      <select id="opTriggerSelect" style="flex:1;font-size:10px;padding:2px 4px;background:#1e1e1e;color:#ccc;border:1px solid #3e3e3e;border-radius:2px;">
        <option value="appear">appear（出现）</option>
        <option value="click">click（点击）</option>
        <option value="manual:rehearsal">manual:rehearsal（演练）</option>
      </select>
      <div style="font-size:9px;color:#777;min-width:36px;">类型</div>
      <select id="opTypeSelect" style="flex:1;font-size:10px;padding:2px 4px;background:#1e1e1e;color:#ccc;border:1px solid #3e3e3e;border-radius:2px;">
        <option value="highlight">highlight</option>
        <option value="scroll">scroll</option>
        <option value="extract">extract</option>
      </select>
      <button id="btnAddOp" style="font-size:10px;padding:2px 8px;">添加</button>
    </div>
    <div style="margin-top:2px;padding:4px;background:#222;border-radius:2px;font-size:9px;color:#888;">
      <span style="color:#888;">💡 提示：</span>
      <span style="color:#aaa;">highlight 用于高亮显示，scroll 自动滚动到视图，extract 提取内容数据。新增操作后可在下方 JSON 中微调配置。</span>
    </div>
  `;
}

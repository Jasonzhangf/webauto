import {
  initGraph,
  handlePickerResult,
  updatePageContext,
  applyMatchSnapshot,
} from './graph.mjs';
import { logger } from './logger.mts';
import { CapturePanel, ContainerTree, CaptureState } from './ui-components.js';
import { FLOATING_PANEL_VERSION } from './version.mts';

const log = (...args: any[]) => {
  console.log('[ui-renderer]', ...args);
};

const statusEl = document.getElementById('status');
const healthEl = document.getElementById('health');
const dragArea = document.getElementById('drag-area');
const loadingIndicator = document.getElementById('loadingIndicator');
const loadingLabel = loadingIndicator?.querySelector('.loading-label') as HTMLElement | null;
const versionLabel = document.getElementById('versionLabel');

function setStatus(text: string, ok: boolean) {
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.style.color = ok ? '#4CAF50' : '#f44336';
  }
  if (versionLabel) {
    versionLabel.textContent = `v${FLOATING_PANEL_VERSION}`;
  }
}

function setLoadingState(pending: number, detail?: Record<string, any>) {
  if (!loadingIndicator) return;
  if (pending > 0) {
    loadingIndicator.classList.add('active');
    if (loadingLabel) {
      const reason = typeof detail?.reason === 'string' ? detail.reason : '加载中';
      const friendly = reason.replace(/[_-]/g, ' ').trim() || '加载中';
      const suffix = pending > 1 ? ` (${pending})` : '';
      loadingLabel.textContent = `${friendly}${suffix}`;
    }
  } else {
    loadingIndicator.classList.remove('active');
    if (loadingLabel) {
      loadingLabel.textContent = '加载中...';
    }
  }
}

// 模拟 debugLog
function debugLog(module: string, action: string, data: any) {
  if ((window as any).api?.debugLog) {
    (window as any).api.debugLog(module, action, data).catch(() => {});
  }
}

let currentProfile: string | null = null;
let currentRootSelector: string | null = null;
let currentUrl: string | null = null;
let currentContainer: any | null = null;

const containerDetailsEl = document.getElementById('containerDetailsContent');
const containerDetailsTab = document.querySelector('.tab[data-tab="containerDetails"]') as HTMLElement | null;

function renderContainerDetails(container: any | null) {
  if (!containerDetailsEl) return;

  if (!container) {
    containerDetailsEl.innerHTML = `
      <div style="margin-bottom:4px;color:#777;">未选择任何容器节点</div>
      <div style="font-size:10px;color:#555;">在左侧图中点击一个容器节点以查看详情和操作列表。</div>
    `;
    return;
  }

  const id = container.id || container.name || 'unknown';
  const name = container.name || container.id || '未命名容器';
  const type = container.type || 'container';
  const capabilities = Array.isArray(container.capabilities) ? container.capabilities : [];
  const rawOperations = Array.isArray(container.operations) ? container.operations : [];
  const alias =
    (container.metadata && (container.metadata.alias as string)) ||
    (container.alias as string) ||
    (container.nickname as string) ||
    '';

  const matchNode = container.match && Array.isArray(container.match.nodes) && container.match.nodes.length
    ? container.match.nodes[0]
    : null;

  const domPath = matchNode?.dom_path || null;
  const selector = matchNode?.selector || null;
  const matchCount = container.match?.match_count ?? (matchNode ? 1 : 0);

  // 计算容器的“主 selector”，供默认 Operation 和新增 Operation 使用。
  let primarySelector: string | null = null;
  if (typeof selector === 'string' && selector.trim()) {
    primarySelector = selector.trim();
  } else if (Array.isArray((container as any).selectors) && (container as any).selectors.length) {
    const firstSel = (container as any).selectors[0];
    if (typeof firstSel === 'string' && firstSel.trim()) {
      primarySelector = firstSel.trim();
    } else if (firstSel && typeof firstSel.css === 'string' && firstSel.css.trim()) {
      primarySelector = firstSel.css.trim();
    }
  }

  const buildDefaultOperations = () => {
    const baseConfig: Record<string, any> = {};
    if (primarySelector) {
      baseConfig.selector = primarySelector;
    } else if (typeof domPath === 'string' && domPath.trim()) {
      baseConfig.dom_path = domPath.trim();
    }

    return [
      {
        id: `${id}.appear.highlight`,
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
  };

  // 若旧容器尚未定义 operations，则生成一个默认建议操作，但不自动保存。
  const synthesizedOperations: any[] = !rawOperations.length ? buildDefaultOperations() : [];
  const hasRawOperations = rawOperations.length > 0;
  const hasSuggestedOperations = !hasRawOperations && synthesizedOperations.length > 0;

  const operations: any[] = (hasRawOperations ? rawOperations : synthesizedOperations).map((op: any) => ({ ...op }));

  // 将 operations 按消息触发分组：默认触发为 appear。
  const DEFAULT_TRIGGER = 'appear';
  const preferredOrder = ['appear', 'click', 'manual:rehearsal'];
  const grouped = new Map<string, Array<{ op: any; index: number }>>();
  operations.forEach((op: any, index: number) => {
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

  const renderTriggerLabel = (trigger: string) => {
    if (trigger === 'appear') return 'appear（出现）';
    if (trigger === 'click') return 'click（点击）';
    if (trigger === 'manual:rehearsal') return 'manual:rehearsal（演练）';
    return trigger;
  };

  const emptyStateHtml = `
    <div style="padding:6px;border:1px dashed #3e3e3e;border-radius:4px;background:#222;">
      <div style="font-size:11px;color:#ccc;font-weight:600;">暂无 Operation</div>
      <div style="font-size:10px;color:#777;margin-top:2px;">该容器尚未配置任何操作，可从零开始创建。</div>
      <div style="margin-top:6px;display:flex;gap:6px;align-items:center;">
        <button id="btnSeedOps" style="font-size:10px;padding:2px 6px;">生成默认 Operation</button>
        <span style="font-size:9px;color:#666;">基于 selector / DOM 路径生成</span>
      </div>
    </div>
  `;

  const messageOpsHtml =
    operations.length && triggerOrder.length
      ? triggerOrder
          .map((trigger) => {
            const rows = grouped.get(trigger) || [];
            const rowsHtml = rows
             .map(({ op, index }) => {
                const key = op.id || `${trigger}.${op.type || 'unknown'}`;
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
             })
             .join('');
            return `<div style="display:flex;align-items:flex-start;padding:4px 0;border-bottom:1px solid #2a2a2a;">
              <div style="width:96px;font-size:10px;color:#9cdcfe;padding-top:2px;">${renderTriggerLabel(trigger)}</div>
              <div style="flex:1;min-width:0;">${
                rowsHtml || `<div style="font-size:10px;color:#666;">当前消息下暂无操作</div>`
              }</div>
            </div>`;
          })
          .join('')
      : emptyStateHtml;

  containerDetailsEl.innerHTML = `
    <div style="margin-bottom:6px;">
      <div style="font-size:12px;color:#fff;margin-bottom:2px;">
        ${name} <span style="color:#666;font-size:10px;">(${id})</span>
      </div>
      <div style="font-size:10px;color:#999;margin-bottom:2px;">
        类型: <span style="color:#dcdcaa;">${type}</span>
        ${container.metadata?.isVirtual ? '<span style="margin-left:6px;color:#fbbc05;">[虚拟容器]</span>' : ''}
      </div>
      <div style="font-size:10px;color:#999;">
        能力: ${
          capabilities.length
            ? capabilities.map((c: string) => `<span style="margin-right:4px;color:#7ebd7e;">${c}</span>`).join('')
            : '<span style="color:#555;">无</span>'
        }
      </div>
      <div style="margin-top:4px;font-size:10px;color:#999;display:flex;align-items:center;gap:4px;">
        <span>别名/显示名:</span>
        <input id="containerAliasInput" type="text" style="flex:1;min-width:0;font-size:10px;padding:2px 4px;border-radius:2px;border:1px solid #3e3e3e;background:#1e1e1e;color:#ccc;" />
        <button id="btnSaveAlias" style="font-size:10px;padding:2px 6px;">保存名称</button>
      </div>
    </div>
    <div style="margin-bottom:6px;font-size:10px;color:#999;">
      <div>匹配 DOM 路径: <span style="color:#9cdcfe;">${domPath || '未记录'}</span></div>
      <div>匹配 selector: <span style="color:#9cdcfe;">${selector || '未记录'}</span></div>
      <div>匹配计数: <span style="color:#9cdcfe;">${matchCount}</span></div>
    </div>
    <div style="margin-bottom:4px;font-size:11px;color:#ccc;font-weight:600;">消息与 Operation 列表</div>
    ${
      hasSuggestedOperations
        ? `<div style="margin-bottom:6px;padding:4px 6px;border:1px dashed #5a4a1d;border-radius:4px;background:#2a2412;font-size:10px;color:#e5b507;display:flex;justify-content:space-between;align-items:center;">
            <span>已生成默认 Operation（尚未保存）</span>
            <button id="btnSaveSuggestedOps" style="font-size:10px;padding:2px 6px;">保存默认</button>
          </div>`
        : ''
    }
    <div id="containerOperationsList">
      ${messageOpsHtml}
    </div>
    <div style="margin-top:8px;padding-top:6px;border-top:1px dashed #3e3e3e;">
      <div style="font-size:11px;color:#ccc;font-weight:600;display:flex;justify-content:space-between;align-items:center;">
        <span>快速添加 Operation</span>
        ${
          primarySelector
            ? `<span style="font-size:9px;color:#7ebd7e;background:#0e3d0e;padding:1px 4px;border-radius:2px;">✓ 有主 selector</span>`
            : `<span style="font-size:9px;color:#e5b507;background:#3d2e0e;padding:1px 4px;border-radius:2px;">⚠ 无 selector</span>`
        }
      </div>
      ${
        !primarySelector && typeof domPath === 'string' && domPath.trim()
          ? `<div style="margin-top:2px;font-size:9px;color:#e5b507;">将使用 DOM 路径作为配置目标</div>`
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
    <div style="margin-top:6px;font-size:10px;color:#999;">高级：Operation 配置（JSON，可编辑）</div>
    <textarea
      id="containerOpsEditor"
      style="width:100%;height:120px;margin-top:2px;background:#1e1e1e;color:#ccc;border:1px solid #3e3e3e;border-radius:2px;font-family:Consolas,monospace;font-size:10px;padding:4px;resize:vertical;"
    ></textarea>
    <div style="margin-top:4px;display:flex;justify-content:flex-end;gap:6px;">
      <button id="btnSaveOps" style="font-size:10px;padding:2px 6px;">保存 Operation 列表</button>
    </div>
    <div style="margin-top:6px;font-size:10px;color:#666;">
      提示：当前 Operation 编辑会直接写入外置容器库（~/.webauto/container-lib）；演练按钮暂仅记录日志，不会实际执行操作。
    </div>
  `;

  const aliasInput = containerDetailsEl.querySelector('#containerAliasInput') as HTMLInputElement | null;
  if (aliasInput) {
    aliasInput.value = alias || name || id;
  }

  const opsEditor = containerDetailsEl.querySelector('#containerOpsEditor') as HTMLTextAreaElement | null;
  if (opsEditor) {
    try {
      opsEditor.value = JSON.stringify(operations, null, 2);
    } catch {
      opsEditor.value = '[]';
    }
  }

  const btnSaveAlias = containerDetailsEl.querySelector('#btnSaveAlias') as HTMLButtonElement | null;
  if (btnSaveAlias && aliasInput) {
    btnSaveAlias.addEventListener('click', async () => {
      const nextAlias = aliasInput.value.trim();
      debugLog('floating-panel', 'update-alias-clicked', { containerId: id, alias: nextAlias });
      if (!currentProfile || !currentUrl) {
        logger.warn('container-alias', 'Missing profile/url; skip update', {
          profile: currentProfile,
          url: currentUrl,
        });
        return;
      }
      try {
        const api = (window as any).api;
        if (!api?.invokeAction) {
          logger.warn('container-alias', 'invokeAction not available');
          return;
        }
        await api.invokeAction('containers:update-alias', {
          profile: currentProfile,
          url: currentUrl,
          containerId: id,
          alias: nextAlias,
        });
        await api.invokeAction('containers:match', {
          profile: currentProfile,
          url: currentUrl,
          rootSelector: currentRootSelector || undefined,
        });
      } catch (err) {
        logger.error('container-alias', 'Failed to update alias', err);
      }
    });
  }

  const btnSaveOps = containerDetailsEl.querySelector('#btnSaveOps') as HTMLButtonElement | null;
  const btnSeedOps = containerDetailsEl.querySelector('#btnSeedOps') as HTMLButtonElement | null;
  const btnSaveSuggestedOps = containerDetailsEl.querySelector('#btnSaveSuggestedOps') as HTMLButtonElement | null;
  if (btnSaveOps && opsEditor) {
    btnSaveOps.addEventListener('click', async () => {
      if (!currentProfile || !currentUrl) {
        logger.warn('container-operations', 'Missing profile/url; skip update', {
          profile: currentProfile,
          url: currentUrl,
        });
        return;
      }
      let nextOperations: any[] = [];
      try {
        const raw = opsEditor.value || '[]';
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          throw new Error('operations JSON must be an array');
        }
        nextOperations = parsed;
      } catch (err: any) {
        logger.error('container-operations', 'Invalid operations JSON', err);
        debugLog('floating-panel', 'operations-parse-error', {
          containerId: id,
          error: err?.message || String(err),
        });
        return;
      }
      try {
        const api = (window as any).api;
        if (!api?.invokeAction) {
          logger.warn('container-operations', 'invokeAction not available');
          return;
        }
        await api.invokeAction('containers:update-operations', {
          profile: currentProfile,
          url: currentUrl,
          containerId: id,
          operations: nextOperations,
        });
        await api.invokeAction('containers:match', {
          profile: currentProfile,
          url: currentUrl,
          rootSelector: currentRootSelector || undefined,
        });
      } catch (err) {
        logger.error('container-operations', 'Failed to update operations', err);
      }
    });
  }

  const seedOperations = async (nextOps: any[], reason: string) => {
    if (!currentProfile || !currentUrl) {
      logger.warn('container-operations', 'Missing profile/url; skip seed ops', {
        profile: currentProfile,
        url: currentUrl,
        reason,
      });
      return;
    }
    if (opsEditor) {
      try {
        opsEditor.value = JSON.stringify(nextOps, null, 2);
      } catch {
        // ignore editor sync
      }
    }
    try {
      const api = (window as any).api;
      if (!api?.invokeAction) {
        logger.warn('container-operations', 'invokeAction not available (seed ops)');
        return;
      }
      await api.invokeAction('containers:update-operations', {
        profile: currentProfile,
        url: currentUrl,
        containerId: id,
        operations: nextOps,
      });
      await api.invokeAction('containers:match', {
        profile: currentProfile,
        url: currentUrl,
        rootSelector: currentRootSelector || undefined,
      });
    } catch (err) {
      logger.error('container-operations', 'Failed to seed operations', err);
    }
  };

  if (btnSeedOps) {
    btnSeedOps.addEventListener('click', async () => {
      const nextOps = buildDefaultOperations();
      await seedOperations(nextOps, 'seed-default');
    });
  }

  if (btnSaveSuggestedOps && hasSuggestedOperations) {
    btnSaveSuggestedOps.addEventListener('click', async () => {
      await seedOperations(operations, 'save-suggested');
    });
  }

  // “添加 Operation”快捷入口：基于 trigger 与 type 插入一条新操作。
  const triggerSelect = containerDetailsEl.querySelector('#opTriggerSelect') as HTMLSelectElement | null;
  const typeSelect = containerDetailsEl.querySelector('#opTypeSelect') as HTMLSelectElement | null;
  const btnAddOp = containerDetailsEl.querySelector('#btnAddOp') as HTMLButtonElement | null;

  if (btnAddOp && triggerSelect && typeSelect) {
    btnAddOp.addEventListener('click', async () => {
      if (!currentProfile || !currentUrl) {
        logger.warn('container-operations', 'Missing profile/url; skip add op', {
          profile: currentProfile,
          url: currentUrl,
        });
        return;
      }
      const trigger = (triggerSelect.value || 'appear').trim() || 'appear';
      const opType = (typeSelect.value || 'highlight').trim() || 'highlight';

      const nextOperations = operations.map((op: any) => ({ ...op }));

      const baseConfig: any = {};
      if (primarySelector) {
        baseConfig.selector = primarySelector;
      }
      if (opType === 'highlight') {
        baseConfig.style = '2px solid #fbbc05';
        baseConfig.duration = 1500;
      } else if (opType === 'scroll') {
        baseConfig.direction = 'down';
        baseConfig.distance = 500;
      } else if (opType === 'extract') {
        baseConfig.include_text = true;
        baseConfig.max_items = 32;
      }

      nextOperations.push({
        id: `${id}.${trigger}.${opType}.${nextOperations.length + 1}`,
        type: opType,
        triggers: [trigger],
        enabled: true,
        config: baseConfig,
      });

      if (opsEditor) {
        try {
          opsEditor.value = JSON.stringify(nextOperations, null, 2);
        } catch {
          // ignore
        }
      }

      try {
        const api = (window as any).api;
        if (!api?.invokeAction) {
          logger.warn('container-operations', 'invokeAction not available (add op)');
          return;
        }
        await api.invokeAction('containers:update-operations', {
          profile: currentProfile,
          url: currentUrl,
          containerId: id,
          operations: nextOperations,
        });
        await api.invokeAction('containers:match', {
          profile: currentProfile,
          url: currentUrl,
          rootSelector: currentRootSelector || undefined,
        });
      } catch (err) {
        logger.error('container-operations', 'Failed to add operation', err);
      }
    });
  }

  // 为演练按钮挂载简单的占位行为（后续可以接入真正的后台 action）。
  const listEl = containerDetailsEl.querySelector('#containerOperationsList');
  if (listEl) {
    listEl.querySelectorAll('button[data-op-action]').forEach((btn) => {
      const action = (btn as HTMLElement).getAttribute('data-op-action');
      btn.addEventListener('click', async () => {
        const indexAttr = (btn as HTMLElement).getAttribute('data-op-index');
        const index = typeof indexAttr === 'string' ? Number(indexAttr) : NaN;
        if (!Number.isFinite(index)) return;
        const op = operations[index];

        if (action === 'edit') {
          // 编辑模式：聚焦并滚动到 JSON 编辑器，自动展开当前 operation
          if (opsEditor) {
            try {
              // 先聚焦编辑器
              opsEditor.focus();
              // 找到当前操作在 JSON 中的位置并选中
              const text = opsEditor.value || '[]';
              const opIdPattern = `"id"\\s*:\\s*"${op.id || ''}"`;
              const match = new RegExp(opIdPattern).exec(text);
              if (match) {
                const start = match.index;
                // 简单选中当前操作所在行
                opsEditor.setSelectionRange(start, start + match[0].length);
                opsEditor.scrollTop = Math.max(0, (opsEditor.scrollHeight * start) / text.length - 100);
              }
              debugLog('floating-panel', 'op-edit-clicked', { containerId: id, opIndex: index, op });
            } catch (err) {
              logger.warn('op-edit', 'Failed to focus/select operation in editor', err as Error);
            }
          }
        } else if (action === 'toggle') {
          // 切换启用/禁用状态
          const nextOps = operations.map((o: any, i: number) => {
            if (i === index) {
              return { ...o, enabled: !(o.enabled !== false) };
            }
            return { ...o };
          });
          if (opsEditor) {
            try {
              opsEditor.value = JSON.stringify(nextOps, null, 2);
            } catch {
              // ignore
            }
          }
          await seedOperations(nextOps, 'toggle-op');
          debugLog('floating-panel', 'op-toggle-clicked', { containerId: id, opIndex: index, newState: nextOps[index].enabled });
        } else if (action === 'delete') {
          // 删除操作
          if (!confirm(`确认删除操作「${op.id || op.type}」吗？`)) {
            return;
          }
          const nextOps = operations.filter((_: any, i: number) => i !== index);
          if (opsEditor) {
            try {
              opsEditor.value = JSON.stringify(nextOps, null, 2);
            } catch {
              // ignore
            }
          }
          await seedOperations(nextOps, 'delete-op');
          debugLog('floating-panel', 'op-delete-clicked', { containerId: id, opIndex: index, op });
        } else if (action === 'rehearse') {
          debugLog('floating-panel', 'op-rehearse-clicked', { containerId: id, opIndex: index, op });
          // 这里暂时仅记录日志，不做实际执行，避免影响现有流程。
        }
      });
    });
  }
}

if (dragArea) {
  log('drag-area found, enabling drag');
}

window.addEventListener('webauto:graph-loading', ((evt: Event) => {
  const detail = (evt as CustomEvent<any>).detail || {};
  const pending = Number(detail.pending || 0);
  setLoadingState(pending, detail);
}) as EventListener);

window.addEventListener('webauto:graph-status', ((evt: Event) => {
  const detail = (evt as CustomEvent<any>).detail || {};
  const phase = detail.phase as string | undefined;

  if (phase === 'error') {
    setStatus(detail.reason || detail.message || '图谱加载失败', false);
  } else if (phase === 'snapshot:ready' || phase === 'ready') {
    setStatus('图谱已更新', true);
  }
}) as EventListener);

// 监听容器节点选中事件，更新“容器详情”面板。
window.addEventListener('webauto:container-selected', ((evt: Event) => {
  const detail = (evt as CustomEvent<any>).detail || {};
  currentContainer = detail.container || null;
  renderContainerDetails(currentContainer);

  // 自动切换到底部“容器详情”标签，方便查看。
  try {
    if (containerDetailsTab) {
      containerDetailsTab.click();
    }
  } catch {
    // ignore
  }
}) as EventListener);

if (!(window as any).api) {
  log('fatal: window.api missing from preload');
} else {
  log('preload API available');

  // 监听总线连接状态
  if ((window as any).api.onBusStatus) {
    (window as any).api.onBusStatus((status: any) => {
      log('Bus status:', status);
      if (status.connected) {
        if (healthEl) healthEl.textContent = '✅ 已连接总线';
        setStatus('已连接', true);
      } else {
        if (healthEl) healthEl.textContent = '❌ 总线断开';
        setStatus('未连接', false);
      }
    });
  }

  window.api.onBusEvent(async (msg: any) => {
    // 响应健康检查ping
    if (msg.topic === 'floating-panel.ping') {
      try {
        if ((window as any).api?.sendBusEvent) {
          await (window as any).api.sendBusEvent('floating-panel.pong', {
            timestamp: Date.now(),
            received: msg.payload?.timestamp
          });
        }
      } catch (err) {
        logger.error('ping-pong', 'Failed to send pong', err);
      }
    }

    if (msg.topic === "containers.matched") {
      log("收到 containers.matched 事件");
      const data = msg.payload;
      if (data && data.matched) {
        setStatus('已识别', true);
        const snapshot = data.snapshot;
        const profile = data.profileId;
        const url = data.url;
        const rootSelector = snapshot?.metadata?.root_selector || null;

        currentProfile = profile;
        currentRootSelector = rootSelector;
        currentUrl = url || currentUrl;

        if (!profile) {
          log('Missing profile in containers.matched payload');
          return;
        }

        // 统一交给 graph 模块处理：
        // 1) 覆盖容器/DOM 树
        // 2) 自动展开匹配路径并预拉取
        // 3) 等待关键路径加载后统一重绘
        await applyMatchSnapshot(snapshot, {
          profile,
          url,
          rootSelector,
        });

        log('容器树和DOM树更新完成（统一快照刷新）');

        // 每次刷新快照后，如当前选中容器不再存在，重置详情面板。
        if (!currentContainer) {
          renderContainerDetails(null);
        }
      }
    }

    if (msg.topic === 'ui.domPicker.result') {
      log('收到 ui.domPicker.result 事件');
      const data = msg.payload;
      if (data?.success && data?.domPath) {
        handlePickerResult(data.domPath, data.selector || null);
      } else {
        log('domPicker result missing domPath:', data);
      }
    }

    if (msg.topic === 'handshake.status') {
      const payload = msg.payload;
      if (payload?.profileId) {
        currentProfile = payload.profileId;
      }
      updatePageContext({
        profile: payload?.profileId,
        url: payload?.url,
      });
      if (payload?.url) {
        currentUrl = payload.url;
      }
    }

    if (msg.topic === 'browser.runtime.event' || (msg.topic?.startsWith && msg.topic.startsWith('browser.runtime.'))) {
      const payload = msg.payload;
      if (payload?.pageUrl) {
        currentUrl = payload.pageUrl;
        updatePageContext({ url: payload.pageUrl });
      }
    }
  });

  // 初始健康检查和UI初始化验证
  (async () => {
    try {
      // 等待UI元素加载
      await new Promise((resolve) => {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => resolve(null), { once: true });
        } else {
          resolve(null);
        }
      });
      
      // 检查关键UI元素是否存在
      const criticalElements = {
        status: !!statusEl,
        health: !!healthEl,
        dragArea: !!dragArea,
        canvas: !!document.getElementById('graphPanel'),
        loadingIndicator: !!loadingIndicator
      };
      
      const allElementsReady = Object.values(criticalElements).every(Boolean);
      if (!allElementsReady) {
        logger.warn('ui-health', 'Missing critical UI elements', criticalElements);
      }
      
      // 执行健康检查
      const res = await (window.api as any).invokeAction('health', {});
      if (res.ok) {
        log('Health check OK');
        if (healthEl) healthEl.textContent = '✅ 健康检查通过';
      } else {
        if (healthEl) healthEl.textContent = '❌ 健康检查失败';
      }
    } catch (e) {
      logger.error('health-check', 'Health check failed', e);
      if (healthEl) healthEl.textContent = '❌ 健康检查异常';
    }
  })();

}

const canvas = document.getElementById('graphPanel');
if (canvas) {
  initGraph(canvas);
}

// 绑定窗口控制按钮
const btnMinimize = document.getElementById('btnMinimize');
const btnClose = document.getElementById('btnClose');
const btnPicker = document.getElementById('btnPicker');
const captureContainer = document.getElementById('capture-container');
const containerTreeContainer = document.getElementById('containerTree');

const capturePanel = new CapturePanel();
const containerTree = new ContainerTree();
let captureMode = false;

if (captureContainer) captureContainer.appendChild(capturePanel.getElement());
if (containerTreeContainer) containerTreeContainer.appendChild(containerTree.getElement());

if (btnMinimize) {
  btnMinimize.addEventListener('click', () => {
    log('Minimize button clicked');
    if ((window as any).api?.minimize) {
      (window as any).api.minimize().catch((err: any) => {
        log('Minimize failed:', err);
      });
    }
  });
}

if (btnPicker) {
  btnPicker.addEventListener('click', async () => {
    log('Picker button clicked');
    if (captureMode) {
      capturePanel.hide();
      captureMode = false;
    } else {
      capturePanel.show();
      captureMode = true;
    }
  });
}

capturePanel.setCallbacks(
  (state) => {
    logger.info(`Starting capture mode: ${state.selectedProfile} ${state.targetUrl}`);
    if ((window as any).api?.invokeAction) {
      (window as any).api.invokeAction('picker:start', state).catch((err: any) => {
        logger.error('picker-start', 'Failed to start picker', err);
      });
    }
  },
  () => {
    logger.info('Stopping capture mode');
    if ((window as any).api?.invokeAction) {
      (window as any).api.invokeAction('picker:stop', {}).catch((err: any) => {
        logger.error('picker-stop', 'Failed to stop picker', err);
      });
    }
  }
);

containerTree.setOnSelect((id) => {
  logger.info(`Selected container from tree: ${id}`);
  if ((window as any).api?.invokeAction) {
    (window as any).api.invokeAction('container:inspect', { id }).catch((err: any) => {
      logger.error('container-inspect', 'Failed to inspect container', err);
    });
  }
});

if (btnClose) {
  btnClose.addEventListener('click', () => {
    log('Close button clicked');
    if ((window as any).api?.close) {
      (window as any).api.close().catch((err: any) => {
        log('Close failed:', err);
      });
    }
  });
}

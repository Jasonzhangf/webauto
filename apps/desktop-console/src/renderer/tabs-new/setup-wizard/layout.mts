import { createEl } from '../../ui-components.mts';

export type SetupWizardLayout = {
  envCheckBtn: HTMLButtonElement;
  envRepairAllBtn: HTMLButtonElement;
  envReinstallAllBtn: HTMLButtonElement;
  repairCamoBtn: HTMLButtonElement;
  repairCoreBtn: HTMLButtonElement;
  repairCore2Btn: HTMLButtonElement;
  repairRuntimeBtn: HTMLButtonElement;
  repairGeoipBtn: HTMLButtonElement;
  addAccountBtn: HTMLButtonElement;
  newAliasInput: HTMLInputElement;
  enterMainBtn: HTMLButtonElement;
  accountListEl: HTMLDivElement;
  setupStatusText: HTMLDivElement;
  envRepairHistoryEl: HTMLDivElement;
};

export function renderSetupWizardLayout(root: HTMLElement): SetupWizardLayout {
  root.innerHTML = '';

  const header = createEl('div', { style: 'margin-bottom:20px;' }, [
    createEl('h2', { style: 'margin:0 0 8px 0; font-size:20px; color:#dbeafe;' }, ['环境与账户初始化']),
    createEl('div', { className: 'muted', style: 'font-size:13px;' }, ['建议先完成环境检查；账号可先不登录，后续自动识别账户名并回填 alias'])
  ]);
  root.appendChild(header);

  const bentoGrid = createEl('div', { className: 'bento-grid bento-sidebar' });

  const envCard = createEl('div', { className: 'bento-cell' });
  envCard.innerHTML = `
    <div class="bento-title"><span style="color: var(--warning);">●</span> 环境检查</div>
    <div class="env-status-grid">
      <div class="env-item" id="env-camo" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span class="icon" style="color: var(--text-4);">○</span>
          <span class="env-label">Camo CLI (@web-auto/camo)</span>
        </span>
        <button id="repair-camo-btn" class="secondary" style="display:none; flex:0 0 auto;">一键修复</button>
      </div>
      <div class="env-item" id="env-unified" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span class="icon" style="color: var(--text-4);">○</span>
          <span class="env-label">Unified API (7701)</span>
        </span>
        <button id="repair-core-btn" class="secondary" style="display:none; flex:0 0 auto;">一键修复</button>
      </div>
      <div class="env-item" id="env-browser" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span class="icon" style="color: var(--text-4);">○</span>
          <span class="env-label">Camo Runtime Service (7704)</span>
        </span>
        <button id="repair-core2-btn" class="secondary" style="display:none; flex:0 0 auto;">一键修复</button>
      </div>
      <div class="env-item" id="env-firefox" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span class="icon" style="color: var(--text-4);">○</span>
          <span class="env-label">浏览器内核（Camoufox Firefox）</span>
        </span>
        <button id="repair-runtime-btn" class="secondary" style="display:none; flex:0 0 auto;">一键修复</button>
      </div>
      <div class="env-item" id="env-geoip" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span class="icon" style="color: var(--text-4);">○</span>
          <span class="env-label">GeoIP Database（可选）</span>
        </span>
        <button id="repair-geoip-btn" class="secondary" style="display:none; flex:0 0 auto;">可选安装</button>
      </div>
    </div>
    <div style="margin-top: var(--gap);">
      <button id="env-check-btn" class="secondary" style="width: 100%;">检查环境</button>
      <button id="env-repair-all-btn" style="width: 100%; margin-top: 8px; display: none;">一键修复缺失项</button>
      <button id="env-reinstall-all-btn" class="secondary" style="width: 100%; margin-top: 8px;">一键卸载重装资源</button>
    </div>
    <div id="env-repair-history" class="muted" style="margin-top: 10px; font-size: 12px;"></div>
  `;
  bentoGrid.appendChild(envCard);

  const accountCard = createEl('div', { className: 'bento-cell' });
  accountCard.innerHTML = `
    <div class="bento-title">账户设置</div>
    <div class="account-list" id="account-list" style="margin-bottom: var(--gap);">
      <div style="padding:12px; text-align:center; color:#8b93a6;">暂无账户，请点击下方按钮添加</div>
    </div>
    <div class="row">
      <div>
        <label>新账户别名（可选）</label>
        <input id="new-alias-input" placeholder="可留空，登录后自动识别" style="width: 200px;" />
      </div>
      <button id="add-account-btn" style="flex: 0 0 auto; min-width: 120px;">添加账户</button>
    </div>
  `;
  bentoGrid.appendChild(accountCard);
  root.appendChild(bentoGrid);

  const statusRow = createEl('div', { className: 'bento-grid', style: 'margin-top: var(--gap);' });
  const statusCard = createEl('div', { className: 'bento-cell highlight' });
  statusCard.id = 'setup-status-card';
  statusCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-size: 14px; font-weight: 600; color: var(--text-1); margin-bottom: 4px;">
          请完成上述步骤
        </div>
        <div style="font-size: 12px; color: var(--text-3);" id="setup-status-text">
          完成环境检查后即可进入主界面；账号可稍后登录
        </div>
      </div>
      <button id="enter-main-btn" class="secondary" disabled style="padding: 12px 32px; font-size: 14px;">进入主界面</button>
    </div>
  `;
  statusRow.appendChild(statusCard);
  root.appendChild(statusRow);

  return {
    envCheckBtn: root.querySelector('#env-check-btn') as HTMLButtonElement,
    envRepairAllBtn: root.querySelector('#env-repair-all-btn') as HTMLButtonElement,
    envReinstallAllBtn: root.querySelector('#env-reinstall-all-btn') as HTMLButtonElement,
    repairCamoBtn: root.querySelector('#repair-camo-btn') as HTMLButtonElement,
    repairCoreBtn: root.querySelector('#repair-core-btn') as HTMLButtonElement,
    repairCore2Btn: root.querySelector('#repair-core2-btn') as HTMLButtonElement,
    repairRuntimeBtn: root.querySelector('#repair-runtime-btn') as HTMLButtonElement,
    repairGeoipBtn: root.querySelector('#repair-geoip-btn') as HTMLButtonElement,
    addAccountBtn: root.querySelector('#add-account-btn') as HTMLButtonElement,
    newAliasInput: root.querySelector('#new-alias-input') as HTMLInputElement,
    enterMainBtn: root.querySelector('#enter-main-btn') as HTMLButtonElement,
    accountListEl: root.querySelector('#account-list') as HTMLDivElement,
    setupStatusText: root.querySelector('#setup-status-text') as HTMLDivElement,
    envRepairHistoryEl: root.querySelector('#env-repair-history') as HTMLDivElement,
  };
}

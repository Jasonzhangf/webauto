import { renderSetupWizardLayout } from './setup-wizard/layout.mts';
import { type EnvSnapshot, isEnvReady } from './setup-wizard/helpers.mts';
import { createEnvironmentManager } from './setup-wizard/env.mts';
import { createAccountManager } from './setup-wizard/accounts.mts';

export function renderSetupWizard(root: HTMLElement, ctx: any) {
  const ui = renderSetupWizardLayout(root);

  const autoSyncTimers = new Map<string, ReturnType<typeof setInterval>>();

  let envReady = false;
  let accounts: any[] = [];
  let repairHistory: Array<{ ts: string; action: string; ok: boolean; detail?: string }> =
    Array.isArray(ctx.api?.settings?.envRepairHistory) ? [...ctx.api.settings.envRepairHistory] : [];
  let envCheckInFlight = false;
  let accountCheckInFlight = false;
  let busUnsubscribe: (() => void) | null = null;

  function updateCompleteStatus() {
    const hasValidAccount = accounts.some((a) => a.valid);
    const canProceed = envReady;

    ui.enterMainBtn.disabled = !canProceed;

    if (canProceed) {
      ui.setupStatusText.textContent = hasValidAccount
        ? `环境就绪，${accounts.length} 个账户配置完成`
        : '环境就绪，可先进入主界面后登录账号（alias 将在登录后自动识别）';
      ui.enterMainBtn.className = '';
    } else {
      const missing = [];
      if (!envReady) missing.push('环境检查');
      if (!hasValidAccount) missing.push('账户登录（可稍后）');
      ui.setupStatusText.textContent = `尚未完成: ${missing.join('、')}`;
    }
  }

  const envManager = createEnvironmentManager({
    ctx,
    ui,
    state: {
      envReady,
      envCheckInFlight,
      repairHistory,
    },
    callbacks: {
      onEnvUpdated: (snapshot: EnvSnapshot) => {
        envReady = isEnvReady(snapshot);
        updateCompleteStatus();
      },
      onAccountsUpdated: () => {
        updateCompleteStatus();
      }
    }
  });

  const accountManager = createAccountManager(ctx, {
    accountListEl: ui.accountListEl,
    addAccountBtn: ui.addAccountBtn,
    newAliasInput: ui.newAliasInput,
  }, {
    accounts,
    accountCheckInFlight,
    autoSyncTimers,
  }, {
    onAccountsUpdated: () => {
      accounts = accountManager['state']?.accounts || accounts;
      updateCompleteStatus();
    }
  });

  async function tickEnvironment() {
    if (envCheckInFlight) return;
    envCheckInFlight = true;
    try {
      await envManager.checkEnvironment();
    } finally {
      envCheckInFlight = false;
    }
  }

  async function tickAccounts() {
    if (accountCheckInFlight) return;
    accountCheckInFlight = true;
    try {
      await accountManager.tickAccounts();
      accounts = accountManager['state']?.accounts || accounts;
    } finally {
      accountCheckInFlight = false;
    }
  }

  ui.envCheckBtn.onclick = () => void envManager.checkEnvironment();
  ui.envRepairAllBtn.onclick = () => void envManager.runRepair('一键修复缺失项', async () => {
    const snapshot = await envManager.collectEnvironment();
    return await envManager.repairMissing(snapshot);
  });
  ui.envReinstallAllBtn.onclick = () => void envManager.runRepair('一键卸载重装资源', () =>
    (async () => {
      const core = await envManager.repairCoreServices();
      if (!core.ok) return core;
      return envManager.repairInstall({ browser: true, geoip: true, reinstall: true });
    })());
  ui.repairCoreBtn.onclick = () => void envManager.runRepair('修复核心服务', envManager.repairCoreServices);
  ui.repairCore2Btn.onclick = () => void envManager.runRepair('修复核心服务', envManager.repairCoreServices);
  ui.repairCamoBtn.onclick = () => void envManager.runRepair('修复 Camo CLI', envManager.repairCoreServices);
  ui.repairRuntimeBtn.onclick = () => void envManager.runRepair('修复浏览器内核', () => envManager.repairInstall({ browser: true }));
  ui.repairGeoipBtn.onclick = () => void envManager.runRepair('安装 GeoIP', () => envManager.repairInstall({ geoip: true }));
  ui.addAccountBtn.onclick = () => void accountManager.addAccount();
  ui.enterMainBtn.onclick = () => {
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab('tasks');
    }
  };

  void tickEnvironment();
  void tickAccounts();
  if (typeof ctx.api?.onBusEvent === 'function') {
    busUnsubscribe = ctx.api.onBusEvent((evt: any) => {
      const type = String(evt?.type || evt?.event || '').trim().toLowerCase();
      if (!type) return;
      if (type.startsWith('account:')) {
        void tickAccounts();
      }
      if (type.startsWith('env:')) {
        void tickEnvironment();
      }
    });
  }
  envManager.renderRepairHistory();

  return () => {
    accountManager.stopAll();
    if (typeof busUnsubscribe === 'function') busUnsubscribe();
  };
}

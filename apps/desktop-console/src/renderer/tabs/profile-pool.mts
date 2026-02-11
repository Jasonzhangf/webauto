import { createEl, labeledInput, section } from '../ui-components.mjs';
import { resolveWebautoRoot } from '../path-helpers.mjs';

export function renderProfilePool(root: HTMLElement, ctx: any) {
  const webautoRoot = resolveWebautoRoot(ctx.settings?.downloadRoot || '', window.api);
  
  const availableProfiles = createEl('div', { className: 'list', style: 'max-height:200px; overflow:auto;' });
  const selectedProfiles = createEl('div', { className: 'list', style: 'max-height:200px; overflow:auto; border:2px solid var(--primary);' });
  const statusText = createEl('div', { className: 'muted' });
  
  let profiles: string[] = [];
  let selected: Set<string> = new Set();
  
  async function loadProfiles() {
    try {
      const res = await fetch('http://127.0.0.1:7800/profile/list');
      const data = await res.json();
      profiles = data.allowed || [];
      // Restore saved selection
      if (ctx.settings?.allowedProfiles) {
        selected = new Set(ctx.settings.allowedProfiles);
      }
      renderLists();
    } catch (e) {
      statusText.textContent = '加载失败: ' + (e as Error).message;
    }
  }
  
  function renderLists() {
    availableProfiles.textContent = '';
    selectedProfiles.textContent = '';
    
    profiles.forEach(p => {
      if (!selected.has(p)) {
        const row = createEl('div', { className: 'item', style: 'cursor:pointer; padding:4px 8px;' }, [p]);
        row.onclick = () => { selected.add(p); renderLists(); };
        availableProfiles.appendChild(row);
      }
    });
    
    selected.forEach(p => {
      const row = createEl('div', { className: 'item', style: 'cursor:pointer; padding:4px 8px; background:#e3f2fd;' }, [p + ' ✓']);
      row.onclick = () => { selected.delete(p); renderLists(); };
      selectedProfiles.appendChild(row);
    });
    
    statusText.textContent = `可用: ${profiles.length - selected.size} | 已选: ${selected.size}`;
  }
  
  const btnSave = createEl('button', {}, ['保存到配置']);
  btnSave.onclick = async () => {
    const profileList = Array.from(selected);
    await window.api.settingsSet({ allowedProfiles: profileList });
    ctx.settings.allowedProfiles = profileList;
    ctx.appendLog('[ProfilePool] saved: ' + profileList.join(', '));
  };
  
  const btnRefresh = createEl('button', { className: 'secondary' }, ['刷新']);
  btnRefresh.onclick = () => loadProfiles();
  
  const btnSelectAll = createEl('button', { className: 'secondary' }, ['全选']);
  btnSelectAll.onclick = () => { profiles.forEach(p => selected.add(p)); renderLists(); };
  
  const btnClear = createEl('button', { className: 'secondary' }, ['清空']);
  btnClear.onclick = () => { selected.clear(); renderLists(); };
  
  root.appendChild(
    section('Profile Pool 配置', [
      createEl('div', { className: 'row' }, [
        btnRefresh,
        btnSelectAll,
        btnClear,
        btnSave,
      ]),
      statusText,
      createEl('div', { style: 'display:grid; grid-template-columns:1fr 1fr; gap:16px; marginTop:12px;' }, [
        createEl('div', {}, [
          createEl('div', { className: 'muted', style: 'marginBottom:4px;' }, ['可用 Profiles']),
          availableProfiles,
        ]),
        createEl('div', {}, [
          createEl('div', { className: 'muted', style: 'marginBottom:4px;' }, ['已选 Profiles']),
          selectedProfiles,
        ]),
      ]),
    ]),
  );
  
  loadProfiles();
}

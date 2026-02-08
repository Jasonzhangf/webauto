// @ts-nocheck
import { spawnSync } from 'node:child_process';

export async function shortcut(req, res) {
  const { shortcut, app = 'camoufox' } = req.body || {};
  if (!shortcut) return res.status(400).json({ success:false, error:'shortcut required' });

  if (process.platform === 'darwin') {
    spawnSync('osascript', ['-e', `tell application "${app}" to activate`]);
    if (shortcut === 'new-tab') {
      const r = spawnSync('osascript', ['-e', 'tell application "System Events" to keystroke "t" using command down']);
      if (r.status !== 0) return res.status(500).json({ success:false, error:'osascript new-tab failed' });
      return res.json({ success:true, data:{ ok:true, shortcut } });
    }
    return res.status(400).json({ success:false, error:`unsupported shortcut: ${shortcut}` });
  }

  if (process.platform === 'win32') {
    if (shortcut === 'new-tab') {
      const script = 'Add-Type -AssemblyName System.Windows.Forms; $ws = New-Object -ComObject WScript.Shell; $ws.SendKeys("^t");';
      const r = spawnSync('powershell', ['-NoProfile', '-Command', script], { windowsHide: true });
      if (r.status !== 0) return res.status(500).json({ success:false, error:'powershell new-tab failed' });
      return res.json({ success:true, data:{ ok:true, shortcut } });
    }
    return res.status(400).json({ success:false, error:`unsupported shortcut: ${shortcut}` });
  }

  return res.status(400).json({ success:false, error:'unsupported platform' });
}

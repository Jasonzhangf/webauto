// Camo Command Adapter - TypeScript wrapper for @web-auto/camo CLI
// Bridges camo CLI commands with XHS orchestrator blocks

import { execSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(execSync);

export interface CamoOptions {
  profileId?: string;
  serviceUrl?: string;
  timeoutMs?: number;
}

export interface CamoSession {
  sessionId: string;
  profileId: string;
  url?: string;
}

export interface CamoElement {
  path: string;
  tag?: string;
  id?: string;
  classes?: string[];
  text?: string;
  rect?: { x: number; y: number; w: number; h: number };
  visibilityRatio?: number;
}

export interface CamoContainerResult {
  ok: boolean;
  count?: number;
  elements?: CamoElement[];
  error?: string;
}

// Execute camo CLI command and parse JSON output
async function camoExec(args: string[], options: CamoOptions = {}): Promise<any> {
  const timeout = options.timeoutMs || 30000;
  const profileFlag = options.profileId ? [`--profile`, options.profileId] : [];
  
  try {
    const result = execAsync(`camo ${args.join(' ')} ${profileFlag.join(' ')}`, {
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = result.toString().trim();
    
    // Try to parse JSON output
    try {
      return JSON.parse(output);
    } catch {
      return { ok: true, output };
    }
  } catch (error: any) {
    const stderr = error.stderr?.toString() || error.message || String(error);
    throw new Error(`Camo command failed: ${stderr}`);
  }
}

// ==================== Browser Lifecycle ====================

export async function camoStart(profileId: string, url?: string, headless?: boolean): Promise<CamoSession> {
  const args = ['start', profileId];
  if (url) args.push('--url', url);
  if (headless) args.push('--headless');
  
  const result = await camoExec(args);
  return {
    sessionId: result.sessionId || profileId,
    profileId: result.profileId || profileId,
    url: result.url,
  };
}

export async function camoStop(profileId: string): Promise<void> {
  await camoExec(['stop', profileId]);
}

export async function camoGoto(profileId: string, url: string): Promise<void> {
  await camoExec(['goto', profileId, url]);
}

export async function camoBack(profileId: string): Promise<void> {
  await camoExec(['back', profileId]);
}

// ==================== Mouse/Keyboard Actions ====================

export async function camoClick(profileId: string, selector: string): Promise<void> {
  await camoExec(['click', profileId, selector]);
}

export async function camoType(profileId: string, selector: string, text: string): Promise<void> {
  await camoExec(['type', profileId, selector, text]);
}

export async function camoPress(profileId: string, key: string): Promise<void> {
  await camoExec(['press', profileId, key]);
}

export async function camoScroll(
  profileId: string,
  direction: 'up' | 'down' | 'left' | 'right' = 'down',
  amount: number = 300
): Promise<void> {
  await camoExec(['scroll', profileId, `--${direction}`, '--amount', String(amount)]);
}

export async function camoMouseClick(profileId: string, x: number, y: number): Promise<void> {
  await camoExec(['mouse:click', profileId, String(x), String(y)]);
}

// ==================== Container/Filter Operations ====================

export async function camoContainerList(profileId: string): Promise<CamoContainerResult> {
  return camoExec(['container', 'list'], { profileId });
}

export async function camoContainerFilter(
  profileId: string,
  selector: string
): Promise<CamoContainerResult> {
  return camoExec(['container', 'filter', selector], { profileId });
}

export async function camoContainerWatch(
  profileId: string,
  selector: string,
  onEvent: (event: any) => void,
  throttleMs: number = 500
): Promise<() => void> {
  // Spawn watch process
  const proc = spawn('camo', ['container', 'watch', '--selector', selector, '--throttle', String(throttleMs), '--profile', profileId], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        onEvent(event);
      } catch {
        // Ignore non-JSON output
      }
    }
  });

  // Return unsubscribe function
  return () => {
    proc.kill('SIGTERM');
  };
}

// ==================== Screenshot & Debug ====================

export async function camoScreenshot(profileId: string, outputPath?: string, fullPage?: boolean): Promise<string> {
  const args = ['screenshot', profileId];
  if (outputPath) args.push('--output', outputPath);
  if (fullPage) args.push('--full');
  
  const result = await camoExec(args);
  return result.data || result.output;
}

export async function camoHighlight(profileId: string, selector: string): Promise<void> {
  await camoExec(['highlight', profileId, selector]);
}

export async function camoClearHighlight(profileId: string): Promise<void> {
  await camoExec(['clear-highlight', profileId]);
}

// ==================== Session Management ====================

export async function camoStatus(profileId?: string): Promise<any> {
  const args = profileId ? ['status', profileId] : ['status'];
  return camoExec(args);
}

export async function camoListSessions(): Promise<any[]> {
  const result = await camoExec(['sessions']);
  return result.sessions || [];
}

export async function camoCleanup(profileId?: string): Promise<void> {
  const args = profileId ? ['cleanup', profileId] : ['cleanup', 'all'];
  await camoExec(args);
}

// ==================== Profile Management ====================

export async function camoListProfiles(): Promise<string[]> {
  const result = await camoExec(['profile', 'list']);
  return result.profiles || [];
}

export async function camoSetDefaultProfile(profileId: string): Promise<void> {
  await camoExec(['profile', 'default', profileId]);
}

export async function camoGetDefaultProfile(): Promise<string | null> {
  const result = await camoExec(['profile', 'default']);
  return result.defaultProfile || null;
}

// ==================== Utility Functions ====================

export async function camoWaitForElement(
  profileId: string,
  selector: string,
  timeoutMs: number = 10000,
  checkIntervalMs: number = 500
): Promise<CamoElement | null> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const result = await camoContainerFilter(profileId, selector);
    if (result.ok && result.elements && result.elements.length > 0) {
      return result.elements[0];
    }
    await new Promise(r => setTimeout(r, checkIntervalMs));
  }
  
  return null;
}

export async function camoWaitForCheckpoint(
  profileId: string,
  checkpointSelector: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  const element = await camoWaitForElement(profileId, checkpointSelector, timeoutMs);
  return element !== null;
}

export async function camoSafeClick(
  profileId: string,
  selector: string,
  maxRetries: number = 3
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to highlight first to ensure element is visible
      await camoHighlight(profileId, selector);
      await new Promise(r => setTimeout(r, 200));
      
      await camoClick(profileId, selector);
      return true;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return false;
}

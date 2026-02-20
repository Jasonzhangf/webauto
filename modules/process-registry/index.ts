/**
 * ProcessRegistry - 进程生命周期管理
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';

export type ProcessType = 'weibo-search' | 'weibo-detail' | 'xhs-search' | 'xhs-detail' | 'xhs-interact';

export interface ProcessEntry {
  pid: number;
  type: ProcessType;
  profileId: string;
  keyword?: string;
  startedAt: number;
  lastHeartbeat: number;
  status: 'running' | 'stale' | 'dead';
  metadata?: Record<string, any>;
}

export interface ProcessRegistryConfig {
  heartbeatIntervalMs: number;
  staleTimeoutMs: number;
  cleanupIntervalMs: number;
}

const DEFAULT_CONFIG: ProcessRegistryConfig = {
  heartbeatIntervalMs: 30000,
  staleTimeoutMs: 120000,
  cleanupIntervalMs: 60000,
};

function resolveRegistryPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'process-registry.json');
}

export class ProcessRegistry {
  private static instance: ProcessRegistry | null = null;
  
  private entries: Map<number, ProcessEntry> = new Map();
  private registryPath: string;
  private config: ProcessRegistryConfig;
  private ownPid: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private initialized = false;
  private shutdownHandlersRegistered = false;
  
  private constructor(config: Partial<ProcessRegistryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registryPath = resolveRegistryPath();
    this.ownPid = process.pid;
  }
  
  static getInstance(config?: Partial<ProcessRegistryConfig>): ProcessRegistry {
    if (!ProcessRegistry.instance) {
      ProcessRegistry.instance = new ProcessRegistry(config);
    }
    return ProcessRegistry.instance;
  }
  
  async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      const data = JSON.parse(content);
      for (const entry of Object.values(data) as ProcessEntry[]) {
        this.entries.set(entry.pid, entry);
      }
      console.log('[ProcessRegistry] Loaded', this.entries.size, 'entries');
    } catch {
      // 无记录
    }
    
    this.startCleanupTimer();
    this.initialized = true;
  }
  
  async register(
    type: ProcessType,
    profileId: string,
    metadata?: { keyword?: string; [key: string]: any }
  ): Promise<number> {
    await this.init();
    
    const entry: ProcessEntry = {
      pid: this.ownPid,
      type,
      profileId,
      keyword: metadata?.keyword,
      startedAt: Date.now(),
      lastHeartbeat: Date.now(),
      status: 'running',
      metadata,
    };
    
    this.entries.set(this.ownPid, entry);
    await this.persist();
    
    console.log(`[ProcessRegistry] Registered: pid=${this.ownPid} type=${type} profile=${profileId}`);
    
    this.startHeartbeat();
    
    // 注册一次 exit 处理器
    if (!this.shutdownHandlersRegistered) {
      this.registerShutdownHandlers();
      this.shutdownHandlersRegistered = true;
    }
    
    return this.ownPid;
  }
  
  private registerShutdownHandlers(): void {
    const handler = async () => {
      await this.unregister();
    };
    
    process.once('SIGINT', handler);
    process.once('SIGTERM', handler);
    process.once('beforeExit', handler);
  }
  
  heartbeat(): void {
    const entry = this.entries.get(this.ownPid);
    if (entry) {
      entry.lastHeartbeat = Date.now();
      entry.status = 'running';
      this.persist().catch(() => {});
    }
  }
  
  async unregister(): Promise<void> {
    if (!this.entries.has(this.ownPid)) return;
    
    this.stopHeartbeat();
    this.entries.delete(this.ownPid);
    await this.persist();
    console.log(`[ProcessRegistry] Unregistered: pid=${this.ownPid}`);
  }
  
  getAll(): ProcessEntry[] {
    return Array.from(this.entries.values());
  }
  
  getRunning(): ProcessEntry[] {
    return this.getAll().filter(e => e.status === 'running');
  }
  
  async cleanStale(): Promise<{ cleaned: number; killed: string[] }> {
    await this.init();
    
    const now = Date.now();
    const cleaned: string[] = [];
    
    for (const [pid, entry] of this.entries) {
      if (pid === this.ownPid) continue;
      
      if (now - entry.lastHeartbeat > this.config.staleTimeoutMs) {
        entry.status = 'stale';
        const isAlive = this.isProcessAlive(pid);
        
        if (!isAlive) {
          this.entries.delete(pid);
          cleaned.push(`pid=${pid} (dead)`);
          await this.cleanupBrowserSession(entry.profileId);
        } else {
          console.log(`[ProcessRegistry] Killing stale process: pid=${pid} type=${entry.type}`);
          this.killProcess(pid);
          this.entries.delete(pid);
          cleaned.push(`pid=${pid} (killed)`);
          await this.cleanupBrowserSession(entry.profileId);
        }
      }
    }
    
    if (cleaned.length > 0) {
      await this.persist();
      console.log(`[ProcessRegistry] Cleaned ${cleaned.length} stale entries`);
    }
    
    return { cleaned: cleaned.length, killed: cleaned };
  }
  
  getStatus(): { pid: number; type: ProcessType; profileId: string; uptime: number } | null {
    const entry = this.entries.get(this.ownPid);
    if (!entry) return null;
    
    return {
      pid: entry.pid,
      type: entry.type,
      profileId: entry.profileId,
      uptime: Date.now() - entry.startedAt,
    };
  }
  
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat();
    }, this.config.heartbeatIntervalMs);
    
    this.heartbeatTimer.unref();
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  
  private startCleanupTimer(): void {
    if (this.cleanupTimer) return;
    
    this.cleanupTimer = setInterval(() => {
      this.cleanStale().catch(() => {});
    }, this.config.cleanupIntervalMs);
    
    this.cleanupTimer.unref();
  }
  
  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  
  private killProcess(pid: number): void {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGTERM');
        setTimeout(() => {
          if (this.isProcessAlive(pid)) {
            try { process.kill(pid, 'SIGKILL'); } catch {}
          }
        }, 5000);
      }
    } catch {}
  }
  
  private async cleanupBrowserSession(profileId: string): Promise<void> {
    try {
      execSync(`camo stop ${profileId}`, { stdio: 'ignore', timeout: 10000 });
      console.log(`[ProcessRegistry] Cleaned browser: ${profileId}`);
    } catch {}
  }
  
  private async persist(): Promise<void> {
    try {
      const dir = path.dirname(this.registryPath);
      await fs.mkdir(dir, { recursive: true });
      
      const data: Record<number, ProcessEntry> = {};
      for (const [pid, entry] of this.entries) {
        data[pid] = entry;
      }
      
      await fs.writeFile(this.registryPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ProcessRegistry] Failed to persist:', err);
    }
  }
  
  async shutdown(): Promise<void> {
    this.stopHeartbeat();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    await this.unregister();
  }
}

export const processRegistry = ProcessRegistry.getInstance();

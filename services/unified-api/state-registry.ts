/**
 * State Registry - Unified state management for WebAuto
 * 
 * Records and exposes:
 * - Service states (unified-api, browser-service, search-gate)
 * - Session states (active browser sessions)
 * - Environment states (build version, config paths, feature flags)
 * 
 * Persistence: ~/.webauto/state/core-state.json
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ===== Types =====

export interface ServiceState {
  name: string;
  port: number;
  status: 'running' | 'starting' | 'down';
  healthy: boolean;
  lastHealthAt?: string;
  pid?: number;
}

export interface SessionState {
  profileId: string;
  sessionId?: string;
  currentUrl?: string;
  lastPhase?: string; // phase1/2/3/4 or workflowId
  lastActiveAt: string;
  createdAt: string;
  status: 'running' | 'idle' | 'error';
  pid?: number;
}

export interface EnvState {
  buildVersion?: string;
  configPaths: {
    browserService?: string;
    containerIndex?: string;
  };
  featureFlags: {
    searchGateEnabled: boolean;
    viewportSafetyEnabled: boolean;
  };
}

export interface CoreState {
  services: Record<string, ServiceState>;
  sessions: Record<string, SessionState>;
  env: EnvState;
  timestamp: string;
}

// ===== State Registry Class =====

function resolveStatePaths() {
  const home = os.homedir();
  const stateDir = path.join(home, '.webauto', 'state');
  const logDir = path.join(home, '.webauto', 'logs');
  return {
    home,
    stateDir,
    logDir,
    stateFile: path.join(stateDir, 'core-state.json'),
    logFile: path.join(logDir, 'state.jsonl'),
  };
}

class StateRegistry {
  private state: CoreState;
  private flushTimer?: NodeJS.Timeout;

  constructor() {
    // Ensure directories exist
    const paths = resolveStatePaths();
    fs.mkdirSync(paths.stateDir, { recursive: true });
    fs.mkdirSync(paths.logDir, { recursive: true });

    // Load or initialize state
    this.state = this.loadState();

    // Auto-flush every 30 seconds
    this.flushTimer = setInterval(() => {
      this.flush();
    }, 30000);
  }

  /**
   * Load state from file or create new
   */
  private loadState(): CoreState {
    try {
      const { stateFile } = resolveStatePaths();
      if (fs.existsSync(stateFile)) {
        const data = fs.readFileSync(stateFile, 'utf-8');
        const parsed = JSON.parse(data);
        // Validate and migrate if needed
        return this.validateState(parsed);
      }
    } catch (err) {
      console.error('[StateRegistry] Failed to load state:', err);
    }

    // Return initial state
    return {
      services: {},
      sessions: {},
      env: {
        configPaths: {},
        featureFlags: {
          searchGateEnabled: true,
          viewportSafetyEnabled: true,
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validate and migrate state
   */
  private validateState(raw: any): CoreState {
    const state: CoreState = {
      services: raw.services || {},
      sessions: raw.sessions || {},
      env: raw.env || {
        configPaths: {},
        featureFlags: {
          searchGateEnabled: true,
          viewportSafetyEnabled: true,
        },
      },
      timestamp: raw.timestamp || new Date().toISOString(),
    };

    // Ensure env fields exist
    if (!state.env.configPaths) {
      state.env.configPaths = {};
    }
    if (!state.env.featureFlags) {
      state.env.featureFlags = {
        searchGateEnabled: true,
        viewportSafetyEnabled: true,
      };
    }

    return state;
  }

  /**
   * Get full state snapshot
   */
  getState(): CoreState {
    return {
      ...this.state,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Update service state
   */
  updateServiceState(serviceKey: string, updates: Partial<ServiceState>): void {
    const current = this.state.services[serviceKey] || {
      name: serviceKey,
      port: 0,
      status: 'down',
      healthy: false,
    };

    this.state.services[serviceKey] = {
      ...current,
      ...updates,
      lastHealthAt: updates.healthy ? new Date().toISOString() : current.lastHealthAt,
    };

    this.state.timestamp = new Date().toISOString();
    this.logChange('service', serviceKey, updates);
  }

  /**
   * Update session state
   */
  updateSessionState(profileId: string, updates: Partial<SessionState>): void {
    const current = this.state.sessions[profileId] || {
      profileId,
      lastActiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      status: 'running' as const,
    };

    this.state.sessions[profileId] = {
      ...current,
      ...updates,
      lastActiveAt: new Date().toISOString(),
    };

    this.state.timestamp = new Date().toISOString();
    this.logChange('session', profileId, updates);
  }

  /**
   * Remove session state
   */
  removeSessionState(profileId: string): void {
    delete this.state.sessions[profileId];
    this.state.timestamp = new Date().toISOString();
    this.logChange('session', profileId, { action: 'removed' });
  }

  /**
   * Update environment state
   */
  updateEnvState(updates: Partial<EnvState>): void {
    this.state.env = {
      ...this.state.env,
      ...updates,
    };

    if (updates.configPaths) {
      this.state.env.configPaths = {
        ...this.state.env.configPaths,
        ...updates.configPaths,
      };
    }

    if (updates.featureFlags) {
      this.state.env.featureFlags = {
        ...this.state.env.featureFlags,
        ...updates.featureFlags,
      };
    }

    this.state.timestamp = new Date().toISOString();
    this.logChange('env', 'global', updates);
  }

  /**
   * Get session state
   */
  getSessionState(profileId: string): SessionState | undefined {
    return this.state.sessions[profileId];
  }

  /**
   * Get all session states
   */
  getAllSessionStates(): Record<string, SessionState> {
    return { ...this.state.sessions };
  }

  /**
   * Get service states
   */
  getServiceStates(): Record<string, ServiceState> {
    return { ...this.state.services };
  }

  /**
   * Get environment state
   */
  getEnvState(): EnvState {
    return { ...this.state.env };
  }

  /**
   * Flush state to disk
   */
  flush(): void {
    try {
      const { stateFile, stateDir } = resolveStatePaths();
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('[StateRegistry] Failed to flush state:', err);
    }
  }

  /**
   * Log state change to jsonl file
   */
  private logChange(type: string, key: string, changes: any): void {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      key,
      changes,
    };

    try {
      const { logFile, logDir } = resolveStatePaths();
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err) {
      console.error('[StateRegistry] Failed to log change:', err);
    }
  }

  /**
   * Cleanup old sessions (inactive for > 24 hours)
   */
  cleanupOldSessions(): void {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [profileId, session] of Object.entries(this.state.sessions)) {
      const lastActive = new Date(session.lastActiveAt).getTime();
      if (now - lastActive > dayMs) {
        delete this.state.sessions[profileId];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[StateRegistry] Cleaned up ${cleaned} old sessions`);
      this.state.timestamp = new Date().toISOString();
      this.flush();
    }
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
  }
}

// Singleton instance
let registryInstance: StateRegistry | null = null;
let registryHome: string | null = null;

export function getStateRegistry(): StateRegistry {
  const currentHome = os.homedir();
  if (!registryInstance || registryHome !== currentHome) {
    registryInstance = new StateRegistry();
    registryHome = currentHome;
  }
  return registryInstance;
}

export { StateRegistry };

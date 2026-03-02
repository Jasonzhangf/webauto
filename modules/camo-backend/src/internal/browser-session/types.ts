export interface BrowserSessionOptions {
  profileId: string;
  sessionName?: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  engine?: 'camoufox' | null;
  fingerprintPlatform?: 'windows' | 'macos' | null;
}

export interface RecordingOptions {
  name?: string;
  outputPath?: string;
  overlay?: boolean;
}

export interface RecordingState {
  active: boolean;
  enabled: boolean;
  name: string | null;
  outputPath: string | null;
  overlay: boolean;
  startedAt: number | null;
  endedAt: number | null;
  eventCount: number;
  lastEventAt: number | null;
  lastError: string | null;
}

export type NavigationWaitUntil = 'load' | 'domcontentloaded' | 'networkidle' | 'commit';

export function createEmptyRecordingState(): RecordingState {
  return {
    active: false,
    enabled: false,
    name: null,
    outputPath: null,
    overlay: false,
    startedAt: null,
    endedAt: null,
    eventCount: 0,
    lastEventAt: null,
    lastError: null,
  };
}

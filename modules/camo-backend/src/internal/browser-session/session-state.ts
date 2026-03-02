import type { Page, BrowserContext, Browser } from 'playwright';
import type { BrowserSessionOptions, RecordingState } from './types.js';
import { createEmptyRecordingState } from './types.js';
import type { ViewportState } from './viewport.js';

export interface SessionState {
  options: BrowserSessionOptions;
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  mode: 'dev' | 'run';
  lastKnownUrl: string | null;
  lastCookieSignature: string | null;
  lastCookieSaveTs: number;
  lastViewport: ViewportState;
  fingerprint: any;
  recording: RecordingState;
  recordingStream: import('fs').WriteStream | null;
  exitNotified: boolean;
  wheelMode: 'wheel' | 'keyboard';
}

export function createInitialSessionState(options: BrowserSessionOptions): SessionState {
  return {
    options,
    browser: undefined,
    context: undefined,
    page: undefined,
    mode: 'dev',
    lastKnownUrl: null,
    lastCookieSignature: null,
    lastCookieSaveTs: 0,
    lastViewport: {
      lastViewport: null,
      followWindowViewport: !options.headless,
    },
    fingerprint: null,
    recording: createEmptyRecordingState(),
    recordingStream: null,
    exitNotified: false,
    wheelMode: String(process.env.CAMO_SCROLL_INPUT_MODE || '').trim().toLowerCase() === 'keyboard'
      ? 'keyboard'
      : 'wheel',
  };
}

export function getActivePage(state: SessionState): Page | null {
  if (state.page && !state.page.isClosed()) {
    return state.page;
  }
  if (!state.context) return null;
  const alive = state.context.pages().find((p) => !p.isClosed());
  if (alive) {
    state.page = alive;
    return alive;
  }
  state.page = undefined;
  return null;
}

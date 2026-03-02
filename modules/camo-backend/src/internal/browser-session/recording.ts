import fs from 'fs';
import path from 'path';
import type { Page, BrowserContext } from 'playwright';
import type { RecordingState, RecordingOptions } from './types.js';
import { resolveRecordsRoot } from '../storage-paths.js';

export class BrowserSessionRecording {
  private recordingStream: fs.WriteStream | null = null;
  private recording: RecordingState = {
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

  private bindRecorderBridge: (page: Page) => void = () => {};
  private installRecorderRuntime: (page: Page, reason: string) => Promise<void> = async () => {};

  constructor(
    private profileId: string,
    private getCurrentUrl: () => string | null,
    private getContext: () => BrowserContext | undefined,
  ) {}

  setBindRecorderBridge(fn: (page: Page) => void): void {
    this.bindRecorderBridge = fn;
  }

  setInstallRecorderRuntime(fn: (page: Page, reason: string) => Promise<void>): void {
    this.installRecorderRuntime = fn;
  }

  getRecordingStatus(): RecordingState {
    return { ...this.recording };
  }

  private normalizeRecordingName(raw?: string): string {
    const text = String(raw || '').trim();
    const fallback = `record-${this.profileId}`;
    if (!text) return fallback;
    return text.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || fallback;
  }

  private buildRecordingFilename(name: string): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${stamp}-${name}.jsonl`;
  }

  private resolveRecordingOutputPath(options: RecordingOptions): string {
    const name = this.normalizeRecordingName(options?.name);
    const rawOutput = String(options?.outputPath || '').trim();
    if (!rawOutput) {
      const root = path.join(resolveRecordsRoot(), this.profileId);
      return path.join(root, this.buildRecordingFilename(name));
    }
    const absolute = path.isAbsolute(rawOutput) ? rawOutput : path.resolve(rawOutput);
    if (absolute.endsWith(path.sep)) {
      return path.join(absolute, this.buildRecordingFilename(name));
    }
    if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
      return path.join(absolute, this.buildRecordingFilename(name));
    }
    return absolute;
  }

  async startRecording(options: RecordingOptions = {}): Promise<RecordingState> {
    const outputPath = this.resolveRecordingOutputPath(options);
    const name = this.normalizeRecordingName(options?.name);
    const overlay = options?.overlay !== false;

    if (this.recordingStream) {
      await this.stopRecording({ reason: 'restart' });
    }

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    const stream = fs.createWriteStream(outputPath, { flags: 'a', encoding: 'utf-8' });
    stream.on('error', (err) => {
      this.recording.lastError = (err as Error)?.message || String(err);
      this.recording.enabled = false;
    });
    this.recordingStream = stream;

    this.recording = {
      active: true,
      enabled: true,
      name,
      outputPath,
      overlay,
      startedAt: Date.now(),
      endedAt: null,
      eventCount: 0,
      lastEventAt: null,
      lastError: null,
    };

    const context = this.getContext();
    if (context) {
      const pages = context.pages().filter((p) => !p.isClosed());
      for (const page of pages) {
        this.bindRecorderBridge(page);
        // eslint-disable-next-line no-await-in-loop
        await this.installRecorderRuntime(page, 'recording_start').catch(() => {});
      }
    }

    this.writeRecordingEvent(
      'recording.start',
      { name, outputPath, overlay },
      { allowWhenDisabled: true },
    );
    return this.getRecordingStatus();
  }

  async stopRecording(options: { reason?: string } = {}): Promise<RecordingState> {
    if (!this.recordingStream) {
      this.recording.active = false;
      this.recording.enabled = false;
      this.recording.overlay = false;
      this.recording.endedAt = Date.now();
      const context = this.getContext();
      if (context) {
        const pages = context.pages().filter((p) => !p.isClosed());
        for (const page of pages) {
          // eslint-disable-next-line no-await-in-loop
          await this.destroyRecorderRuntimeOnPage(page).catch(() => {});
        }
      }
      return this.getRecordingStatus();
    }

    this.writeRecordingEvent(
      'recording.stop',
      { reason: options.reason || 'manual' },
      { allowWhenDisabled: true },
    );
    this.recording.enabled = false;
    this.recording.active = false;
    this.recording.overlay = false;
    this.recording.endedAt = Date.now();

    const context = this.getContext();
    if (context) {
      const pages = context.pages().filter((p) => !p.isClosed());
      for (const page of pages) {
        // eslint-disable-next-line no-await-in-loop
        await this.destroyRecorderRuntimeOnPage(page).catch(() => {});
      }
    }

    const stream = this.recordingStream;
    this.recordingStream = null;
    await new Promise<void>((resolve) => {
      stream.end(() => resolve());
    });
    return this.getRecordingStatus();
  }

  writeRecordingEvent(
    type: string,
    payload: any = {},
    options: { pageUrl?: string; allowWhenDisabled?: boolean } = {},
  ): void {
    if (!this.recordingStream || !this.recording.active) return;
    if (!this.recording.enabled && !options.allowWhenDisabled) return;
    const eventTs = Date.now();
    const entry = {
      ts: eventTs,
      profileId: this.profileId,
      sessionId: this.profileId,
      type,
      url: options.pageUrl || this.getCurrentUrl() || null,
      payload,
    };
    try {
      this.recordingStream.write(`${JSON.stringify(entry)}\n`);
      this.recording.eventCount += 1;
      this.recording.lastEventAt = eventTs;
    } catch (err) {
      this.recording.lastError = (err as Error)?.message || String(err);
    }
  }

  handleRecorderEvent(page: Page, evt: any): void {
    const type = String(evt?.type || '').trim();
    if (!type) return;
    const pageUrl = String(evt?.href || page?.url?.() || this.getCurrentUrl() || '');
    const payload = evt?.payload && typeof evt.payload === 'object' ? evt.payload : {};

    if (type === 'recording.toggled') {
      if (!this.recording.active) {
        this.recording.enabled = false;
        return;
      }
      this.recording.enabled = payload.enabled !== false;
      this.writeRecordingEvent(type, payload, { pageUrl, allowWhenDisabled: true });
      return;
    }
    if (type === 'recording.runtime_ready') {
      this.writeRecordingEvent(type, payload, { pageUrl, allowWhenDisabled: true });
      return;
    }
    this.writeRecordingEvent(type, payload, { pageUrl });
  }

  recordPageVisit(page: Page, reason: string): void {
    const pageUrl = page?.url?.() || this.getCurrentUrl() || null;
    if (!pageUrl) return;
    this.writeRecordingEvent(
      'page.visit',
      { reason, title: null },
      { pageUrl },
    );
  }

  private async destroyRecorderRuntimeOnPage(page: Page): Promise<void> {
    if (!page || page.isClosed()) return;
    await page.evaluate(() => {
      const runtime = (window as any).__camoRecorderV1__;
      if (!runtime || typeof runtime.destroy !== 'function') return null;
      return runtime.destroy();
    });
  }
}

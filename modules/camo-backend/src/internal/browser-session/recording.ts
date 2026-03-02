import fs from 'fs';
import path from 'path';
import { Page } from 'playwright';
import { RecordingState, RecordingOptions } from './types.js';
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

  constructor(
    private profileId: string,
    private getCurrentUrl: () => string | null,
  ) {}

  getRecordingStatus(): RecordingState {
    return { ...this.recording };
  }

  private normalizeRecordingName(raw?: string): string {
    const name = String(raw || '').trim();
    if (!name) return `recording-${this.profileId}-${Date.now()}`;
    return name.replace(/[^a-z0-9_-]/gi, '_').slice(0, 64);
  }

  private resolveRecordingOutputPath(options: RecordingOptions): string {
    const recordsRoot = resolveRecordsRoot();
    const name = this.normalizeRecordingName(options.name);
    const dir = path.join(recordsRoot, this.profileId, 'recordings');
    fs.mkdirSync(dir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(dir, `${name}-${timestamp}.jsonl`);
  }

  async startRecording(options: RecordingOptions = {}): Promise<RecordingState> {
    if (this.recording.active) {
      throw new Error('Recording already active');
    }
    const outputPath = this.resolveRecordingOutputPath(options);
    const stream = fs.createWriteStream(outputPath, { flags: 'a' });
    this.recordingStream = stream;
    this.recording = {
      active: true,
      enabled: options.overlay !== false,
      name: options.name || null,
      outputPath,
      overlay: options.overlay !== false,
      startedAt: Date.now(),
      endedAt: null,
      eventCount: 0,
      lastEventAt: null,
      lastError: null,
    };
    return { ...this.recording };
  }

  async stopRecording(options: { reason?: string } = {}): Promise<RecordingState> {
    if (!this.recording.active) return { ...this.recording };
    if (this.recordingStream) {
      await new Promise<void>((resolve) => {
        this.recordingStream!.end(() => resolve());
      });
      this.recordingStream = null;
    }
    this.recording = {
      ...this.recording,
      active: false,
      endedAt: Date.now(),
      lastError: options.reason || null,
    };
    return { ...this.recording };
  }

  writeRecordingEvent(type: string, payload?: any, options?: { pageUrl?: string; allowWhenDisabled?: boolean }): void {
    if (!this.recording.active || !this.recordingStream) return;
    if (!this.recording.enabled && !options?.allowWhenDisabled) return;
    const event = {
      ts: Date.now(),
      type,
      payload: payload || {},
      pageUrl: options?.pageUrl || this.getCurrentUrl(),
    };
    this.recordingStream.write(JSON.stringify(event) + '\n');
    this.recording.eventCount += 1;
    this.recording.lastEventAt = Date.now();
  }
}

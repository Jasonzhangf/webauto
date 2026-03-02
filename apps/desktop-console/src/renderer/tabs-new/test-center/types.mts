export type TestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface TestCase {
  id: string; // file::suite::case
  file: string; // relative path from repo root
  suite: string; // describe block name
  name: string; // it block name
  status: TestStatus;
  duration?: number;
  error?: string;
  logs: string[];
}

export interface TestSuite {
  name: string;
  file: string;
  cases: TestCase[];
}

export interface TestBucket {
  id: string; // folder name or synthetic id
  label: string; // display name
  path: string; // tests/e2e-ui/<bucket>
  suites: TestSuite[];
  subBuckets?: TestBucket[]; // for controls/ subfolders
}

export interface TestRunResult {
  suite: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  logs: string[];
}

export interface TestReport {
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    successRate: string;
  };
  bucket: string;
  results: TestRunResult[];
  timestamp: string;
}

export interface TestCenterState {
  buckets: TestBucket[];
  selectedBucketId: string | null;
  running: boolean;
  currentBucketId: string | null;
  results: Map<string, TestRunResult>;
  logs: string[];
  logsPaused: boolean;
  report: TestReport | null;
  filterText: string;
}

export const BUCKET_LABELS: Record<string, string> = {
  contracts: '契约层 (L0)',
  controls: '控件层 (L1)',
  flows: '业务链路层 (L2)',
  stability: '稳定性层 (L3)',
};

export const AGGREGATE_BUCKETS = [
  { id: 'basic', label: '基础模块', bucketIds: ['contracts', 'controls'] },
  { id: 'staged', label: '阶段编排', bucketIds: ['contracts', 'flows'] },
  { id: 'full', label: '完整编排', bucketIds: ['contracts', 'controls', 'flows', 'stability'] },
];

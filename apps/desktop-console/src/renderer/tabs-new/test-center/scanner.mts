import type { TestBucket, TestSuite, TestCase } from './types.mts';
import { BUCKET_LABELS } from './types.mts';

const TESTS_ROOT = 'tests/e2e-ui';

// Simple regex-based parsing of describe/it blocks
const DESCRIBE_RE = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g;
const IT_RE = /it\s*\(\s*['"`]([^'"`]+)['"`]/g;

function parseTestFile(content: string, file: string): TestSuite[] {
  const suites: TestSuite[] = [];
  const lines = content.split('\n');
  let currentSuite: TestSuite | null = null;

  for (const line of lines) {
    // Match describe blocks
    let match: RegExpExecArray | null;
    DESCRIBE_RE.lastIndex = 0;
    if ((match = DESCRIBE_RE.exec(line))) {
      if (currentSuite) suites.push(currentSuite);
      currentSuite = { name: match[1], file, cases: [] };
      continue;
    }

    // Match it blocks within current suite
    if (currentSuite) {
      IT_RE.lastIndex = 0;
      if ((match = IT_RE.exec(line))) {
        const tc: TestCase = {
          id: `${file}::${currentSuite.name}::${match[1]}`,
          file,
          suite: currentSuite.name,
          name: match[1],
          status: 'pending',
          logs: [],
        };
        currentSuite.cases.push(tc);
      }
    }
  }

  if (currentSuite) suites.push(currentSuite);
  return suites;
}

// Browser-compatible scanner that uses preload IPC to read files
export async function scanTestBuckets(repoRoot: string): Promise<TestBucket[]> {
  const buckets: TestBucket[] = [];
  const topLevelDirs = ['contracts', 'controls', 'flows', 'stability'];

  for (const dir of topLevelDirs) {
    const bucketPath = `${TESTS_ROOT}/${dir}`;
    const bucket: TestBucket = {
      id: dir,
      label: BUCKET_LABELS[dir] || dir,
      path: bucketPath,
      suites: [],
    };

    try {
      // Use fsListDir to get files in the bucket directory
      const listResult = await (window as any).api.fsListDir({ dir: `${repoRoot}/${bucketPath}`, recursive: false });
      if (!listResult || !listResult.files) continue;

      const testFiles = listResult.files.filter((f: any) => f.name.endsWith('.test.ts') && f.isFile);

      for (const tf of testFiles) {
        const filePath = `${bucketPath}/${tf.name}`;
        // Read file content via fsReadTextPreview (sufficient for parsing)
        const readResult = await (window as any).api.fsReadTextPreview({ path: `${repoRoot}/${filePath}`, maxBytes: 65536 });
        if (!readResult || !readResult.text) continue;

        const suites = parseTestFile(readResult.text, filePath);
        bucket.suites.push(...suites);
      }

      // Check for sub-buckets (e.g., controls/elements)
      const subDirs = listResult.files.filter((f: any) => f.isDirectory && !f.name.startsWith('.'));
      if (subDirs.length > 0 && dir === 'controls') {
        bucket.subBuckets = [];
        for (const sub of subDirs) {
          const subBucketPath = `${bucketPath}/${sub.name}`;
          const subList = await (window as any).api.fsListDir({ dir: `${repoRoot}/${subBucketPath}`, recursive: false });
          if (!subList || !subList.files) continue;

          const subTestFiles = subList.files.filter((f: any) => f.name.endsWith('.test.ts') && f.isFile);
          const subBucket: TestBucket = {
            id: `${dir}/${sub.name}`,
            label: sub.name,
            path: subBucketPath,
            suites: [],
          };

          for (const tf of subTestFiles) {
            const filePath = `${subBucketPath}/${tf.name}`;
            const readResult = await (window as any).api.fsReadTextPreview({ path: `${repoRoot}/${filePath}`, maxBytes: 65536 });
            if (!readResult || !readResult.text) continue;

            const suites = parseTestFile(readResult.text, filePath);
            subBucket.suites.push(...suites);
          }

          if (subBucket.suites.length > 0) {
            bucket.subBuckets.push(subBucket);
          }
        }
      }

      if (bucket.suites.length > 0 || (bucket.subBuckets && bucket.subBuckets.length > 0)) {
        buckets.push(bucket);
      }
    } catch (err) {
      console.warn(`[test-center] scan bucket ${dir} failed:`, err);
    }
  }

  return buckets;
}

export function countBucketTests(bucket: TestBucket): number {
  let count = bucket.suites.reduce((sum, s) => sum + s.cases.length, 0);
  if (bucket.subBuckets) {
    count += bucket.subBuckets.reduce((sum, sub) => sum + countBucketTests(sub), 0);
  }
  return count;
}

export function gatherBucketTestFiles(bucket: TestBucket): string[] {
  const files = new Set<string>();
  bucket.suites.forEach(s => files.add(s.file));
  if (bucket.subBuckets) {
    bucket.subBuckets.forEach(sub => gatherBucketTestFiles(sub).forEach(f => files.add(f)));
  }
  return Array.from(files);
}

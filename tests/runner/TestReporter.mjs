#!/usr/bin/env node
/**
 * Test Reporter - 生成测试报告
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

class TestReporter {
  async generate(results) {
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const duration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
    
    const report = {
      summary: {
        total: results.length,
        passed,
        failed,
        skipped: 0,
        duration,
        successRate: results.length > 0 ? `${(passed / results.length * 100).toFixed(2)}%` : '0%'
      },
      results: results.map(r => ({
        name: r.name,
        status: r.status,
        duration: r.duration,
        error: r.error
      })),
      timestamp: new Date().toISOString()
    };
    
    const reportPath = path.join(PROJECT_ROOT, 'tests', 'reports', `test-report-${Date.now()}.json`);
    
    // Ensure reports directory exists
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    
    // Write report
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`📄 Report saved: ${reportPath}`);
    
    return report;
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('TestReporter: Run through TestRunner instead');
  process.exit(1);
}

export default TestReporter;

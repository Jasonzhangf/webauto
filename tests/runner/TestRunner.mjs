#!/usr/bin/env node
/**
 * Test Runner - 主测试运行器
 * 支持单元测试、集成测试、E2E 测试
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

class TestRunner {
  constructor(config) {
    this.config = config;
    this.results = [];
    this.startTime = Date.now();
  }

  async loadConfig() {
    const configPath = path.join(__dirname, 'config.json');
    const content = await fs.readFile(configPath, 'utf8');
    return JSON.parse(content);
  }

  async findTestFiles(suitePath) {
    const files = [];
    
    async function scan(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.mjs'))) {
          files.push(fullPath);
        }
      }
    }
    
    await scan(suitePath);
    return files;
  }

  async runTest(testFile) {
    const start = Date.now();
    const testName = path.relative(PROJECT_ROOT, testFile);
    
    console.log(`  Running: ${testName}`);
    
    return new Promise((resolve) => {
      const isTs = testFile.endsWith('.ts');
      const cmd = isTs ? 'npx' : 'node';
      const args = isTs ? ['tsx', testFile] : [testFile];
      
      const proc = spawn(cmd, args, {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        const duration = Date.now() - start;
        
        if (code === 0) {
          console.log(`    ✅ Passed (${duration}ms)`);
          resolve({
            name: testName,
            status: 'passed',
            duration,
            stdout,
            stderr
          });
        } else {
          console.log(`    ❌ Failed (${duration}ms)`);
          console.log(`       ${stderr.split('\n')[0]}`);
          resolve({
            name: testName,
            status: 'failed',
            duration,
            stdout,
            stderr,
            error: stderr
          });
        }
      });
      
      proc.on('error', (err) => {
        const duration = Date.now() - start;
        console.log(`    ❌ Error (${duration}ms)`);
        console.log(`       ${err.message}`);
        resolve({
          name: testName,
          status: 'failed',
          duration,
          error: err.message
        });
      });
    });
  }

  async runSuite(suite) {
    console.log(`\n📦 Running ${suite.name} tests...`);
    
    const suitePath = path.join(PROJECT_ROOT, suite.path);
    
    // Check if suite directory exists
    try {
      await fs.access(suitePath);
    } catch (err) {
      console.log(`  ⚠️  Suite directory not found: ${suitePath}`);
      return [];
    }
    
    const testFiles = await this.findTestFiles(suitePath);
    
    if (testFiles.length === 0) {
      console.log(`  ℹ️  No test files found`);
      return [];
    }
    
    console.log(`  Found ${testFiles.length} test file(s)`);
    
    const results = [];
    
    if (suite.parallel) {
      // Run tests in parallel
      const promises = testFiles.map(file => this.runTest(file));
      const suiteResults = await Promise.all(promises);
      results.push(...suiteResults);
    } else {
      // Run tests sequentially
      for (const file of testFiles) {
        const result = await this.runTest(file);
        results.push(result);
        
        // Stop on first failure if configured
        if (suite.stopOnFailure && result.status === 'failed') {
          console.log(`  ⚠️  Stopping suite on first failure`);
          break;
        }
      }
    }
    
    return results;
  }

  async run(suiteNames = []) {
    console.log('🧪 WebAuto Test Runner\n');
    
    const config = await this.loadConfig();
    
    // Determine which suites to run
    let suitesToRun = config.suites;
    if (suiteNames.length > 0) {
      suitesToRun = config.suites.filter(s => suiteNames.includes(s.name));
    }
    
    for (const suite of suitesToRun) {
      const results = await this.runSuite(suite);
      this.results.push(...results);
    }
    
    this.printSummary();
    
    return this.results;
  }

  printSummary() {
    const duration = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const total = this.results.length;
    
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Test Summary');
    console.log('═'.repeat(60));
    console.log(`Total:     ${total}`);
    console.log(`Passed:    ${passed} ✅`);
    console.log(`Failed:    ${failed} ❌`);
    console.log(`Duration:  ${(duration / 1000).toFixed(2)}s`);
    console.log(`Success:   ${total > 0 ? ((passed / total * 100).toFixed(2)) : 0}%`);
    console.log('═'.repeat(60));
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => r.status === 'failed')
        .forEach(r => {
          console.log(`  • ${r.name}`);
          if (r.error) {
            const firstLine = r.error.split('\n')[0];
            console.log(`    ${firstLine}`);
          }
        });
    }
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const suiteArg = args.find(a => a.startsWith('--suite='));
  const allFlag = args.includes('--all');
  
  const runner = new TestRunner();
  
  let suites = [];
  if (allFlag) {
    // Run all suites
    suites = [];
  } else if (suiteArg) {
    // Run specific suite
    suites = [suiteArg.split('=')[1]];
  } else {
    // Default: run unit tests only
    suites = ['unit'];
  }
  
  runner.run(suites).then((results) => {
    const failed = results.filter(r => r.status === 'failed').length;
    process.exit(failed > 0 ? 1 : 0);
  }).catch((err) => {
    console.error('❌ Test runner failed:', err);
    process.exit(1);
  });
}

export default TestRunner;

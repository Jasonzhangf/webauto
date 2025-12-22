// 简单的时序工作流编排器
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import WorkflowRunner from './WorkflowRunner';

class SequenceRunner {
  constructor() {
    this.runner = new WorkflowRunner();
  }

  async runSequence(sequenceConfigPath) {
    if (!existsSync(sequenceConfigPath)) {
      throw new Error(`序列配置不存在: ${sequenceConfigPath}`);
    }

    const cfg = JSON.parse(readFileSync(sequenceConfigPath, 'utf8'));
    if (!cfg || !Array.isArray(cfg.workflows) || cfg.workflows.length === 0) {
      throw new Error('无有效的序列工作流配置');
    }

    const results = [];
    let shared = cfg.sharedParameters || {};
    for (let i = 0; i < cfg.workflows.length; i++) {
      const item = cfg.workflows[i];
      const path = item.path.startsWith('.') || item.path.startsWith('/')
        ? join(process.cwd(), item.path)
        : join(process.cwd(), item.path);
      const params = { ...shared, ...(item.parameters || {}) };
      const res = await this.runner.runWorkflow(path, params);
      results.push(res);
      if (!res.success && item.stopOnFailure !== false) {
        return { success: false, index: i, results };
      }
      // 将当前结果的变量合并到共享参数，供下一步使用
      shared = { ...shared, ...(res.variables || {}) };
      if (cfg.pauseBetweenMs) {
        await new Promise(r => setTimeout(r, cfg.pauseBetweenMs));
      }
    }

    return { success: true, results };
  }
}

// CLI 运行
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.log('用法: node SequenceRunner.js <sequence-config.json>');
    process.exit(1);
  }

  const runner = new SequenceRunner();
  runner.runSequence(args[0])
    .then(res => {
      console.log('📦 序列执行完成:', res.success ? '✅ 成功' : '❌ 失败');
      if (!res.success) process.exit(1);
    })
    .catch(err => { console.error('💥 序列执行错误:', err.message); process.exit(1); });
}

export default SequenceRunner;


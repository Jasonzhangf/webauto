#!/usr/bin/env node
// 1688通用搜索工作流执行器
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WorkflowRunner from '../workflows/WorkflowRunner.js';

class UniversalSearchExecutor {
  constructor() {
    this.templatePath = join(process.cwd(), 'workflows', '1688', '1688-universal-search-template.json');
    this.runner = new WorkflowRunner();
  }

  // 替换工作流模板中的参数占位符
  replaceTemplateParameters(template, params) {
    const templateStr = JSON.stringify(template);
    let result = templateStr;

    // 替换参数占位符 {parameter}
    for (const [key, value] of Object.entries(params)) {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    return JSON.parse(result);
  }

  // 验证必需参数
  validateParameters(params) {
    const template = JSON.parse(readFileSync(this.templatePath, 'utf8'));
    const requiredParams = Object.keys(template.parameters || {}).filter(key =>
      template.parameters[key]?.required
    );

    const missingParams = requiredParams.filter(param => !(param in params));
    if (missingParams.length > 0) {
      throw new Error(`缺少必需参数: ${missingParams.join(', ')}`);
    }

    // 设置默认值
    for (const [key, config] of Object.entries(template.parameters || {})) {
      if (!(key in params) && config.default !== undefined) {
        params[key] = config.default;
      }
    }

    return params;
  }

  // 生成参数化的工作流文件
  generateParameterizedWorkflow(params) {
    const validatedParams = this.validateParameters(params);
    const template = JSON.parse(readFileSync(this.templatePath, 'utf8'));

    console.log('🔧 参数配置:');
    Object.entries(validatedParams).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    return this.replaceTemplateParameters(template, validatedParams);
  }

  async executeSearch(params) {
    try {
      console.log('🚀 开始执行1688通用搜索工作流...');

      // 生成参数化的工作流
      const workflow = this.generateParameterizedWorkflow(params);

      // 将工作流写入临时文件然后执行
      const tempWorkflowPath = join(process.cwd(), 'workflows', '1688', `temp-${Date.now()}.json`);
      writeFileSync(tempWorkflowPath, JSON.stringify(workflow, null, 2));

      // 执行工作流
      const result = await this.runner.runWorkflow(tempWorkflowPath, params);

      if (result.success) {
        console.log('✅ 搜索工作流执行成功!');

        // 输出关键结果
        if (result.results) {
          const merchants = result.results.merchants || [];
          console.log(`📊 提取商家数量: ${merchants.length}`);

          if (merchants.length > 0) {
            console.log('🔗 前几个商家链接:');
            merchants.slice(0, 3).forEach((merchant, index) => {
              console.log(`  ${index + 1}. ${merchant.title} - ${merchant.merchantName}`);
              console.log(`     链接: ${merchant.merchantLink}`);
            });
          }
        }

        if (result.record) {
          console.log(`📁 结果文件: ${result.record.file}`);
        }
      } else {
        console.error('❌ 搜索工作流执行失败:', result.error);
      }

      return result;
    } catch (error) {
      console.error('💥 执行错误:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// 命令行接口
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('用法:');
    console.log('  node scripts/run-1688-universal-search.js <搜索关键词> [选项]');
    console.log('');
    console.log('选项:');
    console.log('  --max-results=<数量>    最大结果数量 (默认: 20)');
    console.log('  --no-open-first        不打开第一条链接');
    console.log('  --category=<类型>      搜索类别: selloffer/company/product (默认: selloffer)');
    console.log('  --debug                 启用调试模式');
    console.log('');
    console.log('示例:');
    console.log('  node scripts/run-1688-universal-search.js 钢化膜');
    console.log('  node scripts/run-1688-universal-search.js 手机 --max-results=10');
    console.log('  node scripts/run-1688-universal-search.js 服装 --no-open-first --debug');
    process.exit(1);
  }

  const keyword = args[0];
  const flags = args.slice(1);

  // 解析命令行参数
  const params = { keyword };

  for (const flag of flags) {
    if (flag === '--debug') {
      params.debug = true;
    } else if (flag === '--no-open-first') {
      params.openFirstLink = false;
    } else if (flag.startsWith('--max-results=')) {
      params.maxResults = parseInt(flag.split('=')[1], 10);
    } else if (flag.startsWith('--category=')) {
      params.searchCategory = flag.split('=')[1];
    } else {
      console.warn('⚠️ 未知参数:', flag);
    }
  }

  const executor = new UniversalSearchExecutor();
  const result = await executor.executeSearch(params);

  if (!result.success) {
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('💥 运行错误:', err?.message || err);
    process.exit(1);
  });
}

export default UniversalSearchExecutor;
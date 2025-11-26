import { Command } from 'commander';
import { PythonCliBridge } from '../services/PythonCliBridge';
import { WebAutoConfig, CommandResult } from '../types';
import chalk from 'chalk';

export class NodeCommands {
  private bridge: PythonCliBridge;

  constructor(config: WebAutoConfig) {
    this.bridge = new PythonCliBridge(config);
  }

  /**
   * 注册node相关命令
   */
  register(program: Command): void {
    const nodeCmd = program
      .command('node')
      .description('Node执行命令');

    // 执行单个Node
    nodeCmd
      .command('exec <sessionId> <nodeType>')
      .description('执行单个Node')
      .option('--params <json>', 'Node参数JSON字符串')
      .action(async (sessionId, nodeType, options) => {
        await this.executeNode(sessionId, nodeType, options.params);
      });

    // 批量执行Node（从文件）
    nodeCmd
      .command('batch <sessionId> <workflowFile>')
      .description('批量执行Node（从文件）')
      .action(async (sessionId, workflowFile) => {
        await this.batchExecute(sessionId, workflowFile);
      });
  }

  /**
   * 执行单个Node
   */
  private async executeNode(sessionId: string, nodeType: string, paramsJson?: string): Promise<void> {
    try {
      console.log(chalk.blue(`⚡ 执行Node: ${nodeType}`));

      let parameters = {};
      if (paramsJson) {
        try {
          parameters = JSON.parse(paramsJson);
        } catch (error) {
          console.error(chalk.red('❌ 参数JSON解析失败:'), error);
          process.exit(1);
        }
      }

      const result: CommandResult = await this.bridge.executeCommand({
        command_type: 'node_execute',
        node_type: nodeType,
        parameters,
        timestamp: new Date().toISOString()
      }, sessionId);

      if (result.success) {
        console.log(chalk.green('✅ Node执行成功'));
        console.log(chalk.cyan('Node类型:'), nodeType);
        console.log(chalk.cyan('参数:'), JSON.stringify(parameters, null, 2));

        if (result.result && Object.keys(result.result).length > 0) {
          console.log(chalk.cyan('结果:'));
          console.log(JSON.stringify(result.result, null, 2));
        }

        if (result.executionTime) {
          console.log(chalk.cyan('执行时间:'), `${result.executionTime}ms`);
        }
      } else {
        console.error(chalk.red('❌ Node执行失败'));
        console.error(chalk.red('错误:'), result.error || '未知错误');
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('❌ 执行Node时发生错误:'), error);
      process.exit(1);
    }
  }

  /**
   * 批量执行Node
   */
  private async batchExecute(sessionId: string, workflowFile: string): Promise<void> {
    try {
      console.log(chalk.blue(`🔄 批量执行Node: ${workflowFile}`));

      const fs = require('fs');

      if (!fs.existsSync(workflowFile)) {
        console.error(chalk.red(`❌ 工作流文件不存在: ${workflowFile}`));
        process.exit(1);
      }

      let workflow;
      try {
        const content = fs.readFileSync(workflowFile, 'utf-8');
        workflow = JSON.parse(content);
      } catch (error) {
        console.error(chalk.red('❌ 工作流文件解析失败:'), error);
        process.exit(1);
      }

      if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
        console.error(chalk.red('❌ 工作流格式错误: 缺少nodes数组'));
        process.exit(1);
      }

      console.log(chalk.cyan(`📝 开始执行 ${workflow.nodes.length} 个节点...`));

      let successCount = 0;
      let failCount = 0;
      const results = [];

      for (let i = 0; i < workflow.nodes.length; i++) {
        const node = workflow.nodes[i];
        console.log(chalk.blue(`\n[${i + 1}/${workflow.nodes.length}] 执行节点: ${node.type || 'unknown'}`));

        try {
          const result: CommandResult = await this.bridge.executeCommand({
            command_type: 'node_execute',
            node_type: node.type,
            parameters: node.parameters || {},
            timestamp: new Date().toISOString()
          }, sessionId);

          const nodeResult = {
            step: i + 1,
            type: node.type,
            success: result.success,
            result: result.result,
            error: result.error
          };

          results.push(nodeResult);

          if (result.success) {
            successCount++;
            console.log(chalk.green(`✅ 节点 ${node.type} 执行成功`));
          } else {
            failCount++;
            console.error(chalk.red(`❌ 节点 ${node.type} 执行失败: ${result.error}`));

            // 如果节点标记为required且失败，停止执行
            if (node.required !== false) {
              console.log(chalk.yellow('⚠️  节点失败且为required，停止执行'));
              break;
            }
          }
        } catch (error) {
          failCount++;
          const nodeResult = {
            step: i + 1,
            type: node.type,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
          results.push(nodeResult);
          console.error(chalk.red(`❌ 节点 ${node.type} 执行异常: ${error}`));
        }
      }

      console.log(chalk.blue('\n📊 执行统计:'));
      console.log(chalk.cyan('总节点数:'), workflow.nodes.length);
      console.log(chalk.green('成功:'), successCount);
      console.log(chalk.red('失败:'), failCount);
      console.log(chalk.cyan('成功率:'), `${((successCount / workflow.nodes.length) * 100).toFixed(1)}%`);

    } catch (error) {
      console.error(chalk.red('❌ 批量执行时发生错误:'), error);
      process.exit(1);
    }
  }
}
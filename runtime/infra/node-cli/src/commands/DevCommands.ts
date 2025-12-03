import { Command } from 'commander';
import { PythonCliBridge } from '../services/PythonCliBridge';
import { WebAutoConfig, CommandResult } from '../types';
import chalk from 'chalk';

export class DevCommands {
  private bridge: PythonCliBridge;

  constructor(config: WebAutoConfig) {
    this.bridge = new PythonCliBridge(config);
  }

  /**
   * 注册dev相关命令
   */
  register(program: Command): void {
    const devCmd = program
      .command('dev')
      .description('Dev模式调试命令');

    // 启用overlay
    devCmd
      .command('overlay <sessionId>')
      .description('启用Dev覆盖层')
      .action(async (sessionId) => {
        await this.enableOverlay(sessionId);
      });
  }

  /**
   * 启用Dev覆盖层
   */
  private async enableOverlay(sessionId: string): Promise<void> {
    try {
      console.log(chalk.blue(`🎨 启用Dev覆盖层: ${sessionId}`));

      const result: CommandResult = await this.bridge.executeCommand({
        command_type: 'dev_control',
        action: 'enable_overlay',
        parameters: {
          overlay_config: {
            inspect_enabled: true,
            container_editor: true,
            workflow_recorder: true,
            element_highlight: true,
            console_access: true
          }
        }
      }, sessionId);

      if (result.success) {
        console.log(chalk.green('✅ Dev覆盖层启用成功'));
        console.log(chalk.cyan('会话ID:'), sessionId);
        console.log(chalk.cyan('功能:'), '检查器、容器编辑器、工作流录制、元素高亮、控制台访问');
      } else {
        console.error(chalk.red('❌ Dev覆盖层启用失败'));
        console.error(chalk.red('错误:'), result.error || '未知错误');
      }
    } catch (error) {
      console.error(chalk.red('❌ 启用Dev覆盖层时发生错误:'), error);
    }
  }
}
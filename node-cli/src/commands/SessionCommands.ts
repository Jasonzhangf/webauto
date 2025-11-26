import { Command } from 'commander';
import { PythonCliBridge } from '../services/PythonCliBridge';
import { WebAutoConfig, CommandResult } from '../types';
import chalk from 'chalk';
import Table from 'cli-table3';

export class SessionCommands {
  private bridge: PythonCliBridge;

  constructor(config: WebAutoConfig) {
    this.bridge = new PythonCliBridge(config);
  }

  /**
   * 注册session相关命令
   */
  register(program: Command): void {
    const sessionCmd = program
      .command('session')
      .description('会话管理命令');

    // 创建会话
    sessionCmd
      .command('create')
      .description('创建新的浏览器会话')
      .option('--capabilities <list>', '会话能力列表，逗号分隔', 'dom')
      .action(async (options) => {
        await this.createSession(options.capabilities);
      });

    // 列出会话
    sessionCmd
      .command('list')
      .description('列出所有活跃会话')
      .action(async () => {
        await this.listSessions();
      });

    // 获取会话信息
    sessionCmd
      .command('info <sessionId>')
      .description('获取会话详细信息')
      .action(async (sessionId) => {
        await this.getSessionInfo(sessionId);
      });

    // 删除会话
    sessionCmd
      .command('delete <sessionId>')
      .description('删除会话')
      .option('--force', '强制删除')
      .action(async (sessionId, options) => {
        await this.deleteSession(sessionId, options.force);
      });
  }

  /**
   * 创建会话
   */
  private async createSession(capabilities: string): Promise<void> {
    try {
      console.log(chalk.blue('🚀 创建浏览器会话...'));

      const capabilitiesList = capabilities.split(',').map(c => c.trim());

      const result: CommandResult = await this.bridge.executeCommand({
        command_type: 'session_control',
        action: 'create',
        capabilities: capabilitiesList
      });

      if (result.success && result.data?.success) {
        const sessionId = result.data.session_id;
        console.log(chalk.green('✅ 会话创建成功'));
        console.log(chalk.cyan('会话ID:'), sessionId);
        console.log(chalk.cyan('能力:'), capabilitiesList.join(', '));
        console.log(chalk.cyan('状态:'), result.data.status || 'initializing');
      } else {
        console.error(chalk.red('❌ 会话创建失败'));
        console.error(chalk.red('错误:'), result.error || '未知错误');
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('❌ 创建会话时发生错误:'), error);
      process.exit(1);
    }
  }

  /**
   * 列出会话
   */
  private async listSessions(): Promise<void> {
    try {
      console.log(chalk.blue('📋 获取会话列表...'));

      const result: CommandResult = await this.bridge.executeCommand({
        command_type: 'session_control',
        action: 'list'
      });

      if (result.success && result.data?.success) {
        const sessions = result.data.sessions || [];

        if (sessions.length === 0) {
          console.log(chalk.yellow('⚠️  当前没有活跃会话'));
          return;
        }

        const table = new Table({
          head: ['会话ID', '能力', '模式', '当前URL', '状态', '创建时间'],
          colWidths: [20, 15, 10, 30, 10, 20]
        });

        sessions.forEach((session: any) => {
          table.push([
            session.session_id || 'N/A',
            (session.capabilities || []).join(', ') || 'N/A',
            session.mode || 'unknown',
            session.current_url || 'N/A',
            session.status || 'unknown',
            session.created_at ? new Date(session.created_at).toLocaleString() : 'N/A'
          ]);
        });

        console.log(chalk.green('✅ 找到'), chalk.cyan(`${sessions.length}`), chalk.green('个活跃会话:'));
        console.log(table.toString());
      } else {
        console.error(chalk.red('❌ 获取会话列表失败'));
        console.error(chalk.red('错误:'), result.error || '未知错误');
      }
    } catch (error) {
      console.error(chalk.red('❌ 获取会话列表时发生错误:'), error);
    }
  }

  /**
   * 获取会话信息
   */
  private async getSessionInfo(sessionId: string): Promise<void> {
    try {
      console.log(chalk.blue(`🔍 获取会话信息: ${sessionId}`));

      const result: CommandResult = await this.bridge.executeCommand({
        command_type: 'session_control',
        action: 'info',
        parameters: { sessionId }
      }, sessionId);

      if (result.success && result.data?.success) {
        const info = result.data.session_info;

        console.log(chalk.green('✅ 会话信息:'));
        console.log(chalk.cyan('会话ID:'), info.session_id);
        console.log(chalk.cyan('能力:'), (info.capabilities || []).join(', '));
        console.log(chalk.cyan('模式:'), info.mode);
        console.log(chalk.cyan('当前URL:'), info.current_url || 'N/A');
        console.log(chalk.cyan('状态:'), info.status);
        console.log(chalk.cyan('创建时间:'), info.created_at ? new Date(info.created_at).toLocaleString() : 'N/A');
        console.log(chalk.cyan('最后活动:'), info.last_activity ? new Date(info.last_activity).toLocaleString() : 'N/A');
      } else {
        console.error(chalk.red('❌ 获取会话信息失败'));
        console.error(chalk.red('错误:'), result.error || '未知错误');
      }
    } catch (error) {
      console.error(chalk.red('❌ 获取会话信息时发生错误:'), error);
    }
  }

  /**
   * 删除会话
   */
  private async deleteSession(sessionId: string, force: boolean): Promise<void> {
    try {
      console.log(chalk.blue(`🗑️  删除会话: ${sessionId}`));

      const result: CommandResult = await this.bridge.executeCommand({
        command_type: 'session_control',
        action: 'delete',
        parameters: { sessionId }
      }, sessionId);

      if (result.success && result.data?.success) {
        console.log(chalk.green('✅ 会话删除成功'));
        console.log(chalk.cyan('会话ID:'), sessionId);
        console.log(chalk.cyan('消息:'), result.data.message || 'Session removed');
      } else {
        console.error(chalk.red('❌ 会话删除失败'));
        console.error(chalk.red('错误:'), result.error || '未知错误');
        if (!force) {
          process.exit(1);
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ 删除会话时发生错误:'), error);
      if (!force) {
        process.exit(1);
      }
    }
  }
}
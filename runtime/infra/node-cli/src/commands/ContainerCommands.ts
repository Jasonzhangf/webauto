import { Command } from 'commander';
import { PythonCliBridge } from '../services/PythonCliBridge';
import { WebAutoConfig, CommandResult } from '../types';
import chalk from 'chalk';

export class ContainerCommands {
  private bridge: PythonCliBridge;

  constructor(config: WebAutoConfig) {
    this.bridge = new PythonCliBridge(config);
  }

  /**
   * 注册container相关命令
   */
  register(program: Command): void {
    const containerCmd = program
      .command('container')
      .description('容器操作命令');

    // 匹配根容器
    containerCmd
      .command('match <sessionId> <url>')
      .description('匹配根容器')
      .action(async (sessionId, url) => {
        await this.matchRoot(sessionId, url);
      });

    // 发现子容器
    containerCmd
      .command('discover <sessionId>')
      .description('发现子容器')
      .option('--root-selector <selector>', '根容器选择器')
      .action(async (sessionId, options) => {
        await this.discoverChildren(sessionId, options.rootSelector);
      });
  }

  /**
   * 匹配根容器
   */
  private async matchRoot(sessionId: string, url: string): Promise<void> {
    try {
      console.log(chalk.blue(`🔍 匹配容器: ${url}`));

      const result: CommandResult = await this.bridge.executeCommand({
        command_type: 'container_operation',
        action: 'match_root',
        // 服务端要求 page_context，而非 parameters
        page_context: { url },
        parameters: { sessionId }
      } as any, sessionId);

      if (!result.success) {
        console.error(chalk.red('❌ 容器匹配失败'));
        console.error(chalk.red('错误:'), result.error || '未知错误');
        return;
      }

      const payload = result.data;
      if (!payload?.success) {
        console.error(chalk.red('❌ 容器匹配失败'));
        console.error(chalk.red('错误:'), payload?.error || payload?.message || '未知错误');
        return;
      }

      console.log(chalk.green('✅ 容器匹配成功'));
      const matchedData = (payload as any).data || payload;
      const matched = matchedData.matched_container;
      if (matched?.id) {
        console.log(chalk.cyan('匹配的容器:'), matched.id);
        console.log(chalk.cyan('容器名称:'), matched.name || 'N/A');
        if ((matched as any).matched_selector) {
          console.log(chalk.cyan('匹配选择器:'), (matched as any).matched_selector);
          console.log(chalk.cyan('匹配数量:'), (matched as any).match_count ?? 'N/A');
        }
      } else {
        console.log(chalk.yellow('⚠️  未找到匹配的容器'));
      }
    } catch (error) {
      console.error(chalk.red('❌ 匹配容器时发生错误:'), error);
    }
  }

  /**
   * 发现子容器
   */
  private async discoverChildren(sessionId: string, rootSelector?: string): Promise<void> {
    try {
      console.log(chalk.blue(`🔍 发现子容器`));

      const parameters: any = { sessionId };
      if (rootSelector) {
        parameters.rootSelector = rootSelector;
      }

      const result: CommandResult = await this.bridge.executeCommand({
        command_type: 'container_operation',
        action: 'discover_children',
        parameters
      }, sessionId);

      if (!result.success) {
        console.error(chalk.red('❌ 子容器发现失败'));
        console.error(chalk.red('错误:'), result.error || '未知错误');
        return;
      }

      const payload = result.data;
      if (!payload?.success) {
        console.error(chalk.red('❌ 子容器发现失败'));
        console.error(chalk.red('错误:'), payload?.error || payload?.message || '未知错误');
        return;
      }

      console.log(chalk.green('✅ 子容器发现成功'));
      const children = payload.child_containers || [];

      if (children.length > 0) {
        console.log(chalk.cyan(`找到 ${children.length} 个子容器:`));
        children.forEach((child: any, index: number) => {
          const id = child.containerId || child.id || 'N/A';
          const name = child.containerName || child.name || 'N/A';
          console.log(chalk.cyan(`  [${index + 1}] ${id} - ${name}`));
        });
      } else {
        console.log(chalk.yellow('⚠️  未找到子容器'));
      }
    } catch (error) {
      console.error(chalk.red('❌ 发现子容器时发生错误:'), error);
    }
  }
}

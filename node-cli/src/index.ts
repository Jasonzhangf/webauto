import { Command } from 'commander';
import { WebAutoConfig } from './types';
import { SessionCommands } from './commands/SessionCommands';
import { NodeCommands } from './commands/NodeCommands';
import { ContainerCommands } from './commands/ContainerCommands';
import { DevCommands } from './commands/DevCommands';
import chalk from 'chalk';

export class CommandRouter {
  private config: WebAutoConfig;
  private sessionCommands: SessionCommands;
  private nodeCommands: NodeCommands;
  private containerCommands: ContainerCommands;
  private devCommands: DevCommands;

  constructor(config: WebAutoConfig) {
    this.config = config;
    this.sessionCommands = new SessionCommands(config);
    this.nodeCommands = new NodeCommands(config);
    this.containerCommands = new ContainerCommands(config);
    this.devCommands = new DevCommands(config);
  }

  /**
   * 注册所有命令
   */
  registerCommands(program: Command): void {
    // 注册session命令
    this.sessionCommands.register(program);

    // 注册node命令
    this.nodeCommands.register(program);

    // 注册container命令
    this.containerCommands.register(program);

    // 注册dev命令
    this.devCommands.register(program);

    // 添加版本命令
    program
      .command('version')
      .description('显示版本信息')
      .action(async () => {
        await this.showVersion();
      });
  }

  /**
   * 显示版本信息
   */
  private async showVersion(): Promise<void> {
    console.log(chalk.blue('🚀 WebAuto Browser CLI v1.0.0'));
    console.log(chalk.cyan('Node.js wrapper for Python CLI'));

    // 检查Python CLI版本
    try {
      const { PythonCliBridge } = await import('./services/PythonCliBridge');
      const bridge = new PythonCliBridge(this.config);
      const pythonVersion = await bridge.getPythonVersion();
      console.log(chalk.cyan('Python CLI版本:'), pythonVersion);
    } catch (error) {
      console.log(chalk.yellow('⚠️  Python CLI不可用'));
    }

    console.log(chalk.cyan('Node.js版本:'), process.version);
  }
}
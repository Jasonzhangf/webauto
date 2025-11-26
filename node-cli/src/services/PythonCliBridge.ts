import { spawn } from 'child_process';
import { WebAutoConfig, CommandResult, PythonCommand } from '../types';
import { WsTransport } from './WsTransport';
import chalk from 'chalk';
import path from 'path';

export class PythonCliBridge {
  private config: WebAutoConfig;
  private pythonPath: string;
  private cliPath: string;
  private wsTransport?: WsTransport;

  constructor(config: WebAutoConfig) {
    this.config = config;
    this.pythonPath = 'python3'; // 可配置
    this.cliPath = path.resolve(__dirname, '../../../cli/main.py');
    if (process.env.WEBAUTO_BACKEND === 'ws') {
      this.wsTransport = new WsTransport(config);
    }
  }

  /**
   * 执行Python CLI命令
   */
  async executeCommand(
    command: PythonCommand,
    sessionId?: string
  ): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      // WS 模式：直接走WebSocket，不调用Python进程
      if (this.wsTransport) {
        // 反风控：为创建会话注入默认浏览器配置（headless + autosession），避免可见窗口 & 复用session
        if (command.command_type === 'session_control' && command.action === 'create') {
          command.browser_config = Object.assign({
            headless: true,
            auto_session: true,
            session_name: 'weibo-fresh'
          }, command.browser_config || {});
        }
        // 追加 sessionId 到 parameters
        if (sessionId) {
          if (!command.parameters || typeof command.parameters !== 'object') {
            command.parameters = {};
          }
          (command.parameters as any).sessionId = sessionId;
        }
        const res = await this.wsTransport.execute(command, sessionId);
        res.executionTime = Date.now() - startTime;
        return res;
      }

      if (sessionId) {
        if (!command.parameters || typeof command.parameters !== 'object') {
          command.parameters = {};
        }
        if (!command.parameters.sessionId) {
          command.parameters.sessionId = sessionId;
        }
      }

      const args = this.buildPythonArgs(command, sessionId);
      const result = await this.runPythonProcess(args);

      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * 构建Python CLI参数
   */
  private buildPythonArgs(command: PythonCommand, sessionId?: string): string[] {
    const args = [this.cliPath];

    // 全局选项
    args.push('--websocket-url', this.config.websocketUrl);
    args.push('--format', 'json');

    if (sessionId) {
      args.push('--session', sessionId);
    }

    if (this.config.verbose) {
      args.push('--verbose');
    }

    // 构建命令特定参数
    const commandArgs = this.buildCommandSpecificArgs(command);
    args.push(...commandArgs);

    return args;
  }

  /**
   * 构建命令特定参数
   */
  private buildCommandSpecificArgs(command: PythonCommand): string[] {
    const args: string[] = [];

    switch (command.command_type) {
      case 'session_control':
        args.push('session');
        if (command.action === 'create') {
          args.push('create');
          if (command.capabilities) {
            args.push('--capabilities', command.capabilities.join(','));
          }
        } else if (command.action === 'list') {
          args.push('list');
        } else if (command.action === 'delete') {
          args.push('delete', command.parameters?.sessionId || '');
        }
        break;

      case 'node_execute':
        args.push('node', 'exec');
        args.push(command.parameters?.sessionId || '');
        args.push(command.node_type || '');
        if (command.parameters) {
          args.push('--params', JSON.stringify(command.parameters));
        }
        break;

      case 'container_operation':
        args.push('container');
        if (command.action === 'match_root') {
          args.push('match');
          args.push(command.parameters?.sessionId || '');
          args.push(command.parameters?.url || '');
        } else if (command.action === 'discover_children') {
          args.push('discover');
          args.push(command.parameters?.sessionId || '');
          if (command.parameters?.rootSelector) {
            args.push('--root-selector', command.parameters.rootSelector);
          }
        }
        break;

      case 'dev_control':
        args.push('dev');
        if (command.action === 'enable_overlay') {
          args.push('overlay');
          args.push(command.parameters?.sessionId || '');
        }
        break;

      default:
        throw new Error(`不支持的命令类型: ${command.command_type}`);
    }

    return args;
  }

  /**
   * 运行Python进程
   */
  private async runPythonProcess(args: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.config.verbose) {
        console.log(chalk.blue('执行Python命令:'), this.pythonPath, args.join(' '));
      }

      const process = spawn(this.pythonPath, args, {
        cwd: path.dirname(this.cliPath),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          try {
            const result = stdout.trim() ? JSON.parse(stdout.trim()) : {};
            resolve(result);
          } catch (error) {
            reject(new Error(`解析Python输出失败: ${stdout}`));
          }
        } else {
          reject(new Error(`Python进程退出，代码: ${code}, 错误: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`启动Python进程失败: ${error.message}`));
      });
    });
  }

  /**
   * 检查Python CLI是否可用
   */
  async checkAvailability(): Promise<boolean> {
    try {
      await this.runPythonProcess(['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取Python版本信息
   */
  async getPythonVersion(): Promise<string> {
    try {
      const result = await this.runPythonProcess(['--version']);
      return result.data || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }
}

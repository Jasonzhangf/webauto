#!/usr/bin/env node

/**
 * CLI interface for the WebAuto Operations Framework Daemon
 * Provides command-line controls for managing the daemon
 */

import { Command } from 'commander';
import { createDaemon, createDaemonFromFile, DaemonConfig, createDefaultConfig } from '../index';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('webauto-daemon')
  .description('WebAuto Operations Framework Daemon CLI')
  .version('1.0.0');

program
  .command('start')
  .description('Start the daemon')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-p, --port <port>', 'WebSocket server port', (val) => parseInt(val, 10))
  .option('-w, --workers <count>', 'Number of worker processes', (val) => parseInt(val, 10))
  .option('-l, --log-level <level>', 'Log level (debug, info, warn, error)')
  .option('-d, --daemonize', 'Run as daemon process')
  .action(async (options) => {
    try {
      console.log('🚀 Starting WebAuto Operations Framework Daemon...');

      let config: DaemonConfig;

      if (options.config) {
        config = await loadConfigFromFile(options.config);
      } else {
        config = createDefaultConfig();
      }

      // Apply CLI overrides
      if (options.port) config.port = options.port;
      if (options.workers) config.maxWorkers = options.workers;
      if (options.logLevel) config.logLevel = options.logLevel;

      console.log('📋 Configuration:', {
        name: config.name,
        port: config.port,
        workers: config.maxWorkers,
        logLevel: config.logLevel,
        storagePath: config.storagePath
      });

      const daemon = await createDaemon(config);

      console.log('✅ Daemon started successfully');
      console.log('🔌 WebSocket server available at:', `ws://${config.host}:${config.port}`);
      console.log('📁 Data storage:', config.storagePath);
      console.log('📊 Health check interval:', `${config.healthCheckInterval / 1000}s`);

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down daemon...');
        await daemon.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\n🛑 Shutting down daemon...');
        await daemon.stop();
        process.exit(0);
      });

    } catch (error) {
      console.error('❌ Failed to start daemon:', error);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop a running daemon (requires PID file)')
  .option('-p, --pid-file <path>', 'PID file path', './daemon.pid')
  .action(async (options) => {
    try {
      if (!fs.existsSync(options.pidFile)) {
        console.error('❌ PID file not found. Daemon may not be running.');
        process.exit(1);
      }

      const pid = parseInt(fs.readFileSync(options.pidFile, 'utf8'), 10);

      console.log(`🛑 Stopping daemon (PID: ${pid})...`);

      process.kill(pid, 'SIGTERM');

      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 5000));

      if (fs.existsSync(options.pidFile)) {
        console.warn('⚠️  Daemon did not shut down gracefully, force killing...');
        process.kill(pid, 'SIGKILL');
      }

      fs.unlinkSync(options.pidFile);
      console.log('✅ Daemon stopped successfully');

    } catch (error) {
      console.error('❌ Failed to stop daemon:', error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check daemon status')
  .option('-p, --pid-file <path>', 'PID file path', './daemon.pid')
  .option('-c, --config <path>', 'Configuration file path')
  .action(async (options) => {
    try {
      if (fs.existsSync(options.pidFile)) {
        const pid = parseInt(fs.readFileSync(options.pidFile, 'utf8'), 10);

        try {
          process.kill(pid, 0); // Check if process exists
          console.log('✅ Daemon is running');
          console.log(`📍 PID: ${pid}`);

          if (options.config) {
            const config = await loadConfigFromFile(options.config);
            console.log(`🔌 WebSocket: ws://${config.host}:${config.port}`);
            console.log(`📁 Storage: ${config.storagePath}`);
          }

        } catch (error) {
          console.log('❌ PID file exists but process is not running');
          console.log('🗑️  Cleaning up stale PID file...');
          fs.unlinkSync(options.pidFile);
        }
      } else {
        console.log('❌ Daemon is not running');
      }

    } catch (error) {
      console.error('❌ Failed to check status:', error);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Manage daemon configuration')
  .option('--generate <path>', 'Generate default configuration file')
  .option('--validate <path>', 'Validate configuration file')
  .option('--show', 'Show current configuration')
  .action(async (options) => {
    try {
      if (options.generate) {
        const config = createDefaultConfig();
        const configPath = path.resolve(options.generate);

        // Ensure directory exists
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(`✅ Configuration generated: ${configPath}`);

      } else if (options.validate) {
        await loadConfigFromFile(options.validate);
        console.log('✅ Configuration is valid');

      } else if (options.show) {
        const config = createDefaultConfig();
        console.log('Current configuration:');
        console.log(JSON.stringify(config, null, 2));

      } else {
        console.log('Use --generate, --validate, or --show options');
      }

    } catch (error) {
      console.error('❌ Configuration error:', error);
      process.exit(1);
    }
  });

program
  .command('health')
  .description('Check daemon health')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-p, --port <port>', 'Daemon port', (val) => parseInt(val, 10))
  .action(async (options) => {
    try {
      const WebSocket = require('ws');

      let config: DaemonConfig;
      if (options.config) {
        config = await loadConfigFromFile(options.config);
      } else {
        config = createDefaultConfig();
      }

      const port = options.port || config.port;
      const ws = new WebSocket(`ws://${config.host}:${port}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'status:request',
          timestamp: new Date()
        }));
      });

      ws.on('message', (data: any) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'status_response') {
            console.log('✅ Daemon is healthy');
            console.log('📊 Status:', message.payload);
            ws.close();
          }
        } catch (error) {
          console.error('❌ Failed to parse health response:', error);
          ws.close();
        }
      });

      ws.on('error', (error: any) => {
        console.error('❌ Failed to connect to daemon:', error.message);
        console.log('🔍 Make sure the daemon is running and the port is correct');
        process.exit(1);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        console.error('❌ Health check timeout');
        ws.close();
        process.exit(1);
      }, 5000);

    } catch (error) {
      console.error('❌ Health check failed:', error);
      process.exit(1);
    }
  });

program
  .command('logs')
  .description('Show daemon logs')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-f, --follow', 'Follow log output')
  .option('-n, --lines <number>', 'Number of lines to show', (val) => parseInt(val, 10), 50)
  .action(async (options) => {
    try {
      let config: DaemonConfig;
      if (options.config) {
        config = await loadConfigFromFile(options.config);
      } else {
        config = createDefaultConfig();
      }

      const logDir = path.join(config.storagePath, 'logs');
      const logFile = path.join(logDir, 'combined.log');

      if (!fs.existsSync(logFile)) {
        console.log('📄 No log file found');
        return;
      }

      if (options.follow) {
        console.log('📄 Following logs (Ctrl+C to stop)...');
        const tail = require('tail').Tail;
        const tailer = new tail(logFile);

        tailer.on('line', (line: string) => {
          try {
            const log = JSON.parse(line);
            console.log(`${log.timestamp} [${log.level}]: ${log.message}`);
          } catch {
            console.log(line);
          }
        });

        process.on('SIGINT', () => {
          tailer.unwatch();
          process.exit(0);
        });

      } else {
        const logs = fs.readFileSync(logFile, 'utf8').split('\n').slice(-options.lines);
        logs.forEach(line => {
          if (line.trim()) {
            try {
              const log = JSON.parse(line);
              console.log(`${log.timestamp} [${log.level}]: ${log.message}`);
            } catch {
              console.log(line);
            }
          }
        });
      }

    } catch (error) {
      console.error('❌ Failed to show logs:', error);
      process.exit(1);
    }
  });

program
  .command('task')
  .description('Task management commands')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-p, --port <port>', 'Daemon port', (val) => parseInt(val, 10))
  .argument('<action>', 'Action to perform (submit, list, cancel)')
  .argument('[data]', 'Task data (JSON string or file path)')
  .action(async (action, data, options) => {
    try {
      const WebSocket = require('ws');

      let config: DaemonConfig;
      if (options.config) {
        config = await loadConfigFromFile(options.config);
      } else {
        config = createDefaultConfig();
      }

      const port = options.port || config.port;
      const ws = new WebSocket(`ws://${config.host}:${port}`);

      ws.on('open', () => {
        switch (action) {
          case 'submit':
            if (!data) {
              console.error('❌ Task data required for submit action');
              process.exit(1);
            }

            let taskData;
            if (fs.existsSync(data)) {
              taskData = JSON.parse(fs.readFileSync(data, 'utf8'));
            } else {
              taskData = JSON.parse(data);
            }

            ws.send(JSON.stringify({
              type: 'task:submit',
              payload: taskData,
              timestamp: new Date()
            }));
            break;

          case 'list':
            ws.send(JSON.stringify({
              type: 'task:list',
              timestamp: new Date()
            }));
            break;

          case 'cancel':
            if (!data) {
              console.error('❌ Task ID required for cancel action');
              process.exit(1);
            }

            ws.send(JSON.stringify({
              type: 'task:cancel',
              payload: { taskId: data },
              timestamp: new Date()
            }));
            break;

          default:
            console.error('❌ Unknown action:', action);
            process.exit(1);
        }
      });

      ws.on('message', (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('📨 Response:', message);
          ws.close();
        } catch (error) {
          console.error('❌ Failed to parse response:', error);
          ws.close();
        }
      });

      ws.on('error', (error: any) => {
        console.error('❌ Failed to connect to daemon:', error.message);
        process.exit(1);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        console.error('❌ Request timeout');
        ws.close();
        process.exit(1);
      }, 10000);

    } catch (error) {
      console.error('❌ Task management failed:', error);
      process.exit(1);
    }
  });

/**
 * Load configuration from file
 */
async function loadConfigFromFile(configPath: string): Promise<DaemonConfig> {
  const absolutePath = path.resolve(configPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Configuration file not found: ${absolutePath}`);
  }

  const configData = fs.readFileSync(absolutePath, 'utf8');
  const config = JSON.parse(configData) as DaemonConfig;

  return config;
}

// Run the CLI
program.parse();
/**
 * UI Recognition Service - Basic Scaffold
 * 基础版本的UI识别服务，用于快速验证核心功能
 */

import EventEmitter from 'events';
import { spawn } from 'child_process';
import axios from 'axios';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class UIRecognitionService extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      serviceHost: config.serviceHost || 'localhost',
      servicePort: config.servicePort || 8899,
      pythonServicePath: config.pythonServicePath || join(__dirname, '..', 'python-service'),
      modelPath: config.modelPath || 'Tongyi-MiA/UI-Ins-7B',
      timeout: config.timeout || 30000,
      ...config
    };

    this.pythonProcess = null;
    this.serviceReady = false;
    this.requestId = 0;
    this.startTime = Date.now();
  }

  async start() {
    try {
      this.emit('status', { status: 'starting', message: '启动UI识别服务...' });

      // 检查Python服务脚本
      const serviceScript = join(this.config.pythonServicePath, 'server.py');
      if (!existsSync(serviceScript)) {
        throw new Error(`Python服务脚本不存在: ${serviceScript}`);
      }

      // 启动Python服务
      await this.startPythonService();

      // 等待服务就绪
      await this.waitForService();

      this.serviceReady = true;
      this.emit('status', { status: 'ready', message: 'UI识别服务已就绪' });

    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  async startPythonService() {
    return new Promise((resolve, reject) => {
      const args = [
        'server.py',
        '--host', this.config.serviceHost,
        '--port', this.config.servicePort.toString(),
        '--model-path', this.config.modelPath
      ];

      this.pythonProcess = spawn('python3', args, {
        cwd: this.config.pythonServicePath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });

      this.pythonProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        console.log('[UI-Service]', output);

        if (output.includes('Server ready') || output.includes('Uvicorn running')) {
          resolve();
        }
      });

      this.pythonProcess.stderr.on('data', (data) => {
        console.error('[UI-Service Error]', data.toString());
      });

      this.pythonProcess.on('close', (code) => {
        this.serviceReady = false;
        this.emit('status', { status: 'stopped', message: `服务停止 (code: ${code})` });
      });

      // 超时处理
      setTimeout(() => {
        if (this.pythonProcess && !this.serviceReady) {
          reject(new Error('UI识别服务启动超时'));
        }
      }, 60000);
    });
  }

  async waitForService() {
    const maxWait = 30000;
    const interval = 1000;
    let waitTime = 0;

    while (waitTime < maxWait) {
      try {
        const response = await axios.get(`http://${this.config.serviceHost}:${this.config.servicePort}/health`, {
          timeout: 2000
        });

        if (response.data.status === 'healthy') {
          return;
        }
      } catch {
        // 服务尚未就绪，继续等待
      }

      await new Promise(resolve => setTimeout(resolve, interval));
      waitTime += interval;
    }

    throw new Error('等待UI识别服务就绪超时');
  }

  async recognize(options) {
    if (!this.serviceReady) {
      throw new Error('UI识别服务未就绪');
    }

    const requestId = ++this.requestId;
    const startTime = Date.now();

    try {
      this.emit('request-start', { requestId, options });

      const response = await axios.post(
        `http://${this.config.serviceHost}:${this.config.servicePort}/recognize`,
        {
          request_id: requestId,
          image: options.image,
          query: options.query || '识别页面中的可交互元素',
          scope: options.scope || 'full',
          region: options.region || null,
          parameters: {
            temperature: options.temperature || 0.1,
            max_tokens: options.maxTokens || 512
          }
        },
        { timeout: this.config.timeout }
      );

      const processingTime = Date.now() - startTime;
      const result = response.data;

      this.emit('request-complete', {
        requestId,
        result,
        processingTime,
        success: true
      });

      return {
        success: true,
        requestId,
        processingTime,
        elements: result.elements || [],
        actions: result.actions || [],
        analysis: result.analysis,
        metadata: {
          model: this.config.modelPath,
          processingTime,
          confidence: result.confidence || 0.0
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;

      this.emit('request-error', {
        requestId,
        error: error.message,
        processingTime,
        success: false
      });

      return {
        success: false,
        requestId,
        processingTime,
        error: error.message,
        elements: [],
        actions: []
      };
    }
  }

  getStatus() {
    return {
      ready: this.serviceReady,
      config: this.config,
      processId: this.pythonProcess?.pid,
      uptime: this.pythonProcess ? Date.now() - this.startTime : 0
    };
  }

  async stop() {
    if (this.pythonProcess) {
      this.pythonProcess.kill('SIGTERM');
      this.pythonProcess = null;
    }
    this.serviceReady = false;
    this.emit('status', { status: 'stopped', message: 'UI识别服务已停止' });
  }
}

export default UIRecognitionService;
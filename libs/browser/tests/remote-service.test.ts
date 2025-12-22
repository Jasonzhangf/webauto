import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startBrowserService } from '../remote-service.js';

const testHost = '127.0.0.1';
const testPort = 19704;

describe('Browser Remote Service', () => {
  let service: any;

  beforeAll(async () => {
    service = await startBrowserService({
      host: testHost,
      port: testPort,
      enableWs: false
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (service && typeof service.stop === 'function') {
      await service.stop();
    }
  });

  const postCommand = async (action: string) => {
    const http = await import('node:http');

    return new Promise<any>((resolve, reject) => {
      const postData = JSON.stringify({ action });
      const req = http.request({
        hostname: testHost,
        port: testPort,
        path: '/command',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  };

  it('should start HTTP service and respond to /command', async () => {
    const response = await postCommand('getStatus');

    expect(response).toHaveProperty('ok', true);
    expect(response).toHaveProperty('sessions');
    expect(Array.isArray(response.sessions)).toBe(true);
  });

  it('should return an error for unknown actions', async () => {
    const response = await postCommand('unknownAction');

    expect(response).toHaveProperty('error');
  });
});

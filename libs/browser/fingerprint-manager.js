/**
 * 浏览器指纹管理器
 * 提供稳定的指纹生成、应用和管理功能
 */

import { randomBytes } from 'crypto';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';

export function generateFingerprint(profileId = 'default') {
    const seed = profileId + Date.now();
    const hash = randomBytes(16).toString('hex');
    
    const fingerprints = [
        {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            platform: 'Win32'
        },
        {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            platform: 'MacIntel'
        },
        {
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            platform: 'Linux x86_64'
        }
    ];
    
    const base = fingerprints[hash.charCodeAt(0) % fingerprints.length];
    
    return {
        profileId,
        userAgent: base.userAgent,
        platform: base.platform,
        languages: ['zh-CN', 'zh', 'en-US', 'en'],
        language: 'zh-CN',
        hardwareConcurrency: [4, 6, 8, 12, 16][hash.charCodeAt(1) % 5],
        deviceMemory: [4, 8, 16, 32][hash.charCodeAt(2) % 4],
        viewport: {
            width: [1366, 1440, 1536, 1920][hash.charCodeAt(3) % 4],
            height: [768, 900, 864, 1080][hash.charCodeAt(4) % 4]
        },
        timezoneId: 'Asia/Shanghai',
        maxTouchPoints: 0,
        vendor: 'Google Inc.',
        renderer: 'ANGLE (NVIDIA, NVIDIA GeForce, D3D11)'
    };
}

export async function applyFingerprint(context, fingerprint) {
    if (!context || !fingerprint) return;
    
    try {
        // 设置User-Agent
        if (fingerprint.userAgent) {
            await context.addInitScript(`
                Object.defineProperty(navigator, 'userAgent', {
                    get: () => '${fingerprint.userAgent}',
                    configurable: true
                });
            `);
        }
        
        // 设置语言
        if (fingerprint.languages && fingerprint.language) {
            await context.addInitScript(`
                Object.defineProperty(navigator, 'language', {
                    get: () => '${fingerprint.language}',
                    configurable: true
                });
                
                Object.defineProperty(navigator, 'languages', {
                    get: () => ${JSON.stringify(fingerprint.languages)},
                    configurable: true
                });
            `);
        }
        
        // 设置硬件信息
        if (fingerprint.hardwareConcurrency) {
            await context.addInitScript(`
                Object.defineProperty(navigator, 'hardwareConcurrency', {
                    get: () => ${fingerprint.hardwareConcurrency},
                    configurable: true
                });
            `);
        }
        
        // 设置设备内存
        if (fingerprint.deviceMemory) {
            await context.addInitScript(`
                Object.defineProperty(navigator, 'deviceMemory', {
                    get: () => ${fingerprint.deviceMemory},
                    configurable: true
                });
            `);
        }
        
        // 设置视口
        if (fingerprint.viewport) {
            await context.setViewportSize(fingerprint.viewport);
        }
        
        // 设置时区
        if (fingerprint.timezoneId) {
            context.timezoneId = fingerprint.timezoneId;
        }
        
        // 移除webdriver标识
        await context.addInitScript(`
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
                configurable: true
            });
            
            delete navigator.__proto__.webdriver;
        `);
        
    } catch (error) {
        console.warn('Failed to apply some fingerprint properties:', error.message);
    }
}

export async function loadFingerprint(fingerprintPath) {
    try {
        const data = await readFile(fingerprintPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return null;
    }
}

export async function saveFingerprint(fingerprintPath, fingerprint) {
    try {
        await mkdir(dirname(fingerprintPath), { recursive: true });
        await writeFile(fingerprintPath, JSON.stringify(fingerprint, null, 2));
        return true;
    } catch (error) {
        console.error('Failed to save fingerprint:', error);
        return false;
    }
}

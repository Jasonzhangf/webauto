/**
 * 默认浏览器配置文件
 * 创建默认profile和配置
 */

import { existsSync, mkdirSync, writeFile } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export function ensureDefaultProfile() {
    const profileRoot = join(homedir(), '.webauto', 'profiles');
    const defaultProfileDir = join(profileRoot, 'default');
    const fingerprintPath = join(defaultProfileDir, 'fingerprint.json');
    
    // 确保目录存在
    if (!existsSync(profileRoot)) {
        mkdirSync(profileRoot, { recursive: true });
    }
    
    if (!existsSync(defaultProfileDir)) {
        mkdirSync(defaultProfileDir, { recursive: true });
    }
    
    // 创建默认指纹文件
    if (!existsSync(fingerprintPath)) {
        const defaultFingerprint = {
            profileId: 'default',
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            platform: 'MacIntel',
            languages: ['zh-CN', 'zh', 'en-US', 'en'],
            language: 'zh-CN',
            hardwareConcurrency: 8,
            deviceMemory: 8,
            viewport: {
                width: 1440,
                height: 900
            },
            timezoneId: 'Asia/Shanghai',
            maxTouchPoints: 0,
            vendor: 'Google Inc.',
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce, D3D11)'
        };
        
        writeFile(fingerprintPath, JSON.stringify(defaultFingerprint, null, 2), 'utf8', (err) => {
            if (err) {
                console.warn('Failed to create default fingerprint:', err.message);
            }
        });
    }
    
    return {
        profileRoot,
        defaultProfileDir,
        fingerprintPath
    };
}

// 自动创建默认配置
ensureDefaultProfile();

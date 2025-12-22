/**
 * 浏览器服务配置管理
 * 支持环境变量和配置文件覆盖
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let serviceConfig = {
    host: '0.0.0.0',
    port: 7704,
    profileRoot: join(homedir(), '.webauto', 'profiles'),
    backend: { baseUrl: 'http://127.0.0.1:7701' }
};

export function loadBrowserServiceConfig() {
    try {
        const configPath = join(__dirname, '../../config/browser-service.json');
        const data = readFileSync(configPath, 'utf8');
        const fileConfig = JSON.parse(data);
        return {
            host: fileConfig.host || serviceConfig.host,
            port: Number(fileConfig.port || serviceConfig.port),
            profileRoot: fileConfig.profileRoot || serviceConfig.profileRoot,
            backend: fileConfig.backend || serviceConfig.backend
        };
    } catch (error) {
        return { ...serviceConfig };
    }
}

export { serviceConfig as defaultConfig };

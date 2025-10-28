// 日志管理器
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Logger {
    constructor() {
        this.logLevel = 'info';
        this.logs = [];
        this.logFile = null;
        this.maxLogSize = 10000; // 最大日志条数
    }

    setLogLevel(level) {
        this.logLevel = level;
    }

    setLogFile(filePath) {
        this.logFile = filePath;
    }

    log(level, message, data = null) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const messageLevelIndex = levels.indexOf(level);

        if (messageLevelIndex >= currentLevelIndex) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                level: level.toUpperCase(),
                message: message,
                data: data
            };

            this.logs.push(logEntry);

            // 控制台输出
            console.log(`[${logEntry.timestamp}] [${logEntry.level}] ${message}`);

            // 数据输出
            if (data) {
                console.log('Data:', JSON.stringify(data, null, 2));
            }

            // 保持日志大小
            if (this.logs.length > this.maxLogSize) {
                this.logs = this.logs.slice(-this.maxLogSize);
            }

            // 写入文件
            if (this.logFile) {
                this.writeToFile(logEntry);
            }
        }
    }

    debug(message, data = null) {
        this.log('debug', message, data);
    }

    info(message, data = null) {
        this.log('info', message, data);
    }

    warn(message, data = null) {
        this.log('warn', message, data);
    }

    error(message, data = null) {
        this.log('error', message, data);
    }

    writeToFile(logEntry) {
        try {
            const logDir = dirname(this.logFile);
            if (!existsSync(logDir)) {
                mkdirSync(logDir, { recursive: true });
            }

            const logLine = JSON.stringify(logEntry) + '\n';
            writeFileSync(this.logFile, logLine, { flag: 'a' });
        } catch (error) {
            console.error('Failed to write log to file:', error);
        }
    }

    getLogs(level = null) {
        if (level) {
            return this.logs.filter(log => log.level.toLowerCase() === level.toLowerCase());
        }
        return this.logs;
    }

    clearLogs() {
        this.logs = [];
    }

    exportLogs(filePath = null) {
        const exportPath = filePath || this.logFile || join(__dirname, 'logs', 'workflow-logs.json');

        try {
            const exportData = {
                exportTime: new Date().toISOString(),
                totalLogs: this.logs.length,
                logs: this.logs
            };

            writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
            return exportPath;
        } catch (error) {
            console.error('Failed to export logs:', error);
            return null;
        }
    }

    getStats() {
        const stats = {
            total: this.logs.length,
            debug: 0,
            info: 0,
            warn: 0,
            error: 0
        };

        this.logs.forEach(log => {
            const level = log.level.toLowerCase();
            if (stats.hasOwnProperty(level)) {
                stats[level]++;
            }
        });

        return stats;
    }
}

export default Logger;
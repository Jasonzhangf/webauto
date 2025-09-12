const fs = require('fs').promises;
const path = require('path');

class Logger {
  constructor(logFilePath = './logs/webauto.log') {
    this.logFilePath = logFilePath;
    // 确保日志目录存在
    const logDir = path.dirname(this.logFilePath);
    fs.mkdir(logDir, { recursive: true }).catch(() => {});
  }

  async log(level, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    
    // 输出到控制台
    console.log(logMessage.trim());
    
    // 写入日志文件
    try {
      await fs.appendFile(this.logFilePath, logMessage);
    } catch (error) {
      console.error(`Failed to write to log file: ${error.message}`);
    }
  }

  async debug(message) {
    return this.log('debug', message);
  }

  async info(message) {
    return this.log('info', message);
  }

  async warn(message) {
    return this.log('warn', message);
  }

  async error(message) {
    return this.log('error', message);
  }
}

module.exports = Logger;
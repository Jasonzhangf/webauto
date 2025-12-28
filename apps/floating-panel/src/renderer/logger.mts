// 渲染进程日志工具 - 将日志发送到主进程保存到文件
const logToMain = (level: string, module: string, message: string, data?: any) => {
  const logData = {
    level,
    module,
    message,
    data,
    timestamp: new Date().toISOString()
  };
  
  if ((window as any).api?.debugLog) {
    (window as any).api.debugLog(`renderer-${module}`, message, { level, ...data }).catch(() => {});
  }
  
  // 同时输出到控制台
  const prefix = `[${level}][${module}]`;
  if (level === 'ERROR') {
    console.error(prefix, message, data || '');
  } else if (level === 'WARN') {
    console.warn(prefix, message, data || '');
  } else {
    console.log(prefix, message, data || '');
  }
};

export const logger = {
  info: (module: string, message: string, data?: any) => logToMain('INFO', module, message, data),
  warn: (module: string, message: string, data?: any) => logToMain('WARN', module, message, data),
  error: (module: string, message: string, data?: any) => logToMain('ERROR', module, message, data),
  debug: (module: string, message: string, data?: any) => logToMain('DEBUG', module, message, data)
};

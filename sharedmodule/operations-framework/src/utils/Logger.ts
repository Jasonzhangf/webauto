/**
 * Enhanced logging utility for the WebAuto Operations Framework
 * Provides structured logging with multiple output formats and log levels
 */

import * as winston from 'winston';
import path from 'path';

export class Logger {
  private logger: winston.Logger;
  private config: any;

  constructor(config: any) {
    this.config = config;
    this.logger = this.createLogger();
  }

  /**
   * Create Winston logger instance
   */
  private createLogger(): winston.Logger {
    const logFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
      }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const logEntry = {
          timestamp,
          level: level.toUpperCase(),
          message,
          ...meta
        };

        // Clean up undefined values
        Object.keys(logEntry).forEach(key => {
          if (logEntry[key] === undefined) {
            delete logEntry[key];
          }
        });

        return JSON.stringify(logEntry);
      })
    );

    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
      }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0
          ? ` ${JSON.stringify(meta)}`
          : '';
        return `${timestamp} [${level}]: ${message}${metaStr}`;
      })
    );

    const transports: winston.transport[] = [
      new winston.transports.Console({
        level: this.config.logLevel,
        format: consoleFormat
      })
    ];

    // Add file transport if storage path is available
    if (this.config.storagePath) {
      const logDir = path.join(this.config.storagePath, 'logs');

      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          format: logFormat,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5
        }),
        new winston.transports.File({
          filename: path.join(logDir, 'combined.log'),
          format: logFormat,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5
        })
      );
    }

    return winston.createLogger({
      level: this.config.logLevel,
      format: logFormat,
      transports,
      exitOnError: false,
      handleExceptions: true,
      handleRejections: true
    });
  }

  /**
   * Log debug message
   */
  debug(message: string, meta?: any): void {
    this.logger.debug(message, this.sanitizeMeta(meta));
  }

  /**
   * Log info message
   */
  info(message: string, meta?: any): void {
    this.logger.info(message, this.sanitizeMeta(meta));
  }

  /**
   * Log warning message
   */
  warn(message: string, meta?: any): void {
    this.logger.warn(message, this.sanitizeMeta(meta));
  }

  /**
   * Log error message
   */
  error(message: string, meta?: any): void {
    this.logger.error(message, this.sanitizeMeta(meta));
  }

  /**
   * Log structured event
   */
  logEvent(event: string, data?: any): void {
    this.info(event, {
      type: 'event',
      event,
      data: this.sanitizeMeta(data)
    });
  }

  /**
   * Log performance metrics
   */
  logMetric(name: string, value: number, unit?: string, meta?: any): void {
    this.info(`Metric: ${name}`, {
      type: 'metric',
      metric: name,
      value,
      unit,
      ...this.sanitizeMeta(meta)
    });
  }

  /**
   * Log with custom level
   */
  log(level: string, message: string, meta?: any): void {
    this.logger.log(level, message, this.sanitizeMeta(meta));
  }

  /**
   * Create child logger with additional context
   */
  child(context: Record<string, any>): Logger {
    const childConfig = {
      ...this.config,
      defaultMeta: {
        ...this.config.defaultMeta,
        ...context
      }
    };

    const childLogger = new Logger(childConfig);
    childLogger.logger = this.logger.child(context);
    return childLogger;
  }

  /**
   * Get current log level
   */
  getLevel(): string {
    return this.logger.level;
  }

  /**
   * Set log level
   */
  setLevel(level: string): void {
    this.logger.level = level;
    this.logger.transports.forEach(transport => {
      transport.level = level;
    });
  }

  /**
   * Check if level is enabled
   */
  isLevelEnabled(level: string): boolean {
    return this.logger.isLevelEnabled(level);
  }

  /**
   * Sanitize metadata for logging
   */
  private sanitizeMeta(meta?: any): any {
    if (!meta) {
      return undefined;
    }

    // Handle Error objects
    if (meta instanceof Error) {
      return {
        message: meta.message,
        stack: meta.stack,
        name: meta.name
      };
    }

    // Handle circular references
    try {
      return JSON.parse(JSON.stringify(meta, this.replacer));
    } catch (error) {
      return {
        message: 'Failed to serialize metadata',
        error: error.message
      };
    }
  }

  /**
   * JSON replacer function for handling circular references
   */
  private replacer(key: string, value: any): any {
    if (typeof value === 'object' && value !== null) {
      if (this.seen.has(value)) {
        return '[Circular]';
      }
      this.seen.add(value);
    }
    return value;
  }

  private seen = new WeakSet();

  /**
   * Add transport dynamically
   */
  addTransport(transport: winston.transport): void {
    this.logger.add(transport);
  }

  /**
   * Remove transport
   */
  removeTransport(transport: winston.transport): void {
    this.logger.remove(transport);
  }

  /**
   * Profile execution time
   */
  profile(id: string, meta?: any): () => void {
    const start = process.hrtime.bigint();

    return () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1000000;

      this.info(`Profile: ${id}`, {
        type: 'profile',
        profileId: id,
        duration: durationMs,
        durationUnit: 'ms',
        ...this.sanitizeMeta(meta)
      });
    };
  }

  /**
   * Create audit log entry
   */
  audit(action: string, userId?: string, resource?: string, details?: any): void {
    this.info(`Audit: ${action}`, {
      type: 'audit',
      action,
      userId,
      resource,
      timestamp: new Date().toISOString(),
      ...this.sanitizeMeta(details)
    });
  }

  /**
   * Log security event
   */
  security(event: string, details?: any): void {
    this.warn(`Security: ${event}`, {
      type: 'security',
      event,
      timestamp: new Date().toISOString(),
      ...this.sanitizeMeta(details)
    });
  }

  /**
   * Log HTTP request
   */
  httpRequest(method: string, url: string, statusCode: number, duration?: number, meta?: any): void {
    this.info(`HTTP ${method} ${url}`, {
      type: 'http',
      method,
      url,
      statusCode,
      duration,
      timestamp: new Date().toISOString(),
      ...this.sanitizeMeta(meta)
    });
  }

  /**
   * Log database operation
   */
  database(operation: string, table: string, duration?: number, meta?: any): void {
    this.debug(`DB ${operation} on ${table}`, {
      type: 'database',
      operation,
      table,
      duration,
      ...this.sanitizeMeta(meta)
    });
  }

  /**
   * Log task execution
   */
  task(taskId: string, action: string, meta?: any): void {
    this.info(`Task ${action}`, {
      type: 'task',
      taskId,
      action,
      timestamp: new Date().toISOString(),
      ...this.sanitizeMeta(meta)
    });
  }

  /**
   * Log worker activity
   */
  worker(workerId: string, action: string, meta?: any): void {
    this.info(`Worker ${action}`, {
      type: 'worker',
      workerId,
      action,
      timestamp: new Date().toISOString(),
      ...this.sanitizeMeta(meta)
    });
  }

  /**
   * Log system health
   */
  health(component: string, status: 'healthy' | 'warning' | 'critical', details?: any): void {
    const level = status === 'critical' ? 'error' : status === 'warning' ? 'warn' : 'info';
    this.logger.log(level, `Health: ${component}`, {
      type: 'health',
      component,
      status,
      timestamp: new Date().toISOString(),
      ...this.sanitizeMeta(details)
    });
  }
}
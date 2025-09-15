/**
 * 通知服务操作
 * 用于发送各种类型的通知和报告
 */

import BaseOperation from '../BaseOperation.js';

export class NotificationOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'NotificationOperation';
    this.description = '通知服务操作，支持邮件、webhook、文件等多种通知方式';
    this.version = '1.0.0';
  }

  async execute(context, params = {}) {
    try {
      const { 
        operation = 'send',
        message,
        subject,
        recipients,
        channels = ['log'],
        priority = 'normal',
        attachments = []
      } = params;

      this.logger.info('Executing notification operation', { 
        operation, 
        channels,
        priority 
      });

      let result;

      switch (operation) {
        case 'send':
          result = await this.sendNotification(context, message, subject, recipients, channels, priority, attachments);
          break;
        case 'broadcast':
          result = await this.broadcastNotification(context, message, channels);
          break;
        case 'schedule':
          result = await this.scheduleNotification(context, message, subject, recipients, params.scheduleTime);
          break;
        case 'template':
          result = await this.sendTemplateNotification(context, params.templateName, params.templateData, recipients, channels);
          break;
        case 'report':
          result = await this.sendReport(context, params.reportData, params.reportType, recipients);
          break;
        default:
          throw new Error(`Unsupported notification operation: ${operation}`);
      }

      return {
        success: true,
        result,
        metadata: {
          operation,
          channels,
          priority,
          recipients: recipients ? recipients.length : 0,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      this.logger.error('Notification operation failed', { 
        error: error.message,
        params 
      });
      throw error;
    }
  }

  async sendNotification(context, message, subject, recipients, channels, priority, attachments) {
    this.logger.info('Sending notification to multiple channels');

    const results = {
      successful: [],
      failed: [],
      stats: {
        total: channels.length,
        successful: 0,
        failed: 0
      }
    };

    for (const channel of channels) {
      try {
        const result = await this.sendToChannel(context, message, subject, recipients, channel, priority, attachments);
        results.successful.push({
          channel,
          result,
          timestamp: new Date().toISOString()
        });
        results.stats.successful++;
      } catch (error) {
        results.failed.push({
          channel,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        results.stats.failed++;
      }
    }

    return results;
  }

  async sendToChannel(context, message, subject, recipients, channel, priority, attachments) {
    switch (channel) {
      case 'log':
        return await this.sendLogNotification(message, priority);
      case 'email':
        return await this.sendEmailNotification(message, subject, recipients, attachments);
      case 'webhook':
        return await this.sendWebhookNotification(message, subject, context.getWebhookUrl());
      case 'file':
        return await this.sendFileNotification(message, subject, context.getOutputDirectory());
      case 'console':
        return await this.sendConsoleNotification(message, priority);
      default:
        throw new Error(`Unsupported notification channel: ${channel}`);
    }
  }

  async sendLogNotification(message, priority) {
    const logMethod = this.getLogMethod(priority);
    logMethod.call(this.logger, 'Notification', { 
      message, 
      priority,
      timestamp: new Date().toISOString()
    });

    return {
      channel: 'log',
      status: 'delivered',
      timestamp: new Date().toISOString()
    };
  }

  async sendEmailNotification(message, subject, recipients, attachments) {
    // 模拟邮件发送
    this.logger.info('Sending email notification', { 
      recipients: recipients?.length || 0,
      subject,
      attachments: attachments?.length || 0
    });

    // 模拟延迟
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      channel: 'email',
      status: 'delivered',
      recipients: recipients || [],
      subject,
      timestamp: new Date().toISOString()
    };
  }

  async sendWebhookNotification(message, subject, webhookUrl) {
    if (!webhookUrl) {
      throw new Error('Webhook URL is required for webhook notifications');
    }

    this.logger.info('Sending webhook notification', { webhookUrl });

    try {
      const fetch = await import('node-fetch');
      const payload = {
        message,
        subject,
        timestamp: new Date().toISOString(),
        priority: 'normal'
      };

      const response = await fetch.default(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status}`);
      }

      return {
        channel: 'webhook',
        status: 'delivered',
        url: webhookUrl,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.warn('Webhook notification failed', { 
        webhookUrl, 
        error: error.message 
      });
      
      // 如果webhook失败，记录到日志作为fallback
      return {
        channel: 'webhook',
        status: 'failed',
        error: error.message,
        fallback: 'logged',
        timestamp: new Date().toISOString()
      };
    }
  }

  async sendFileNotification(message, subject, outputDir) {
    const fs = await import('fs/promises');
    const path = await import('path');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `notification_${timestamp}.txt`;
    const filePath = path.join(outputDir, fileName);

    const content = `通知时间: ${new Date().toLocaleString()}\n`;
    if (subject) {
      content += `主题: ${subject}\n`;
    }
    content += `内容: ${message}\n`;

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');

    return {
      channel: 'file',
      status: 'delivered',
      filePath,
      timestamp: new Date().toISOString()
    };
  }

  async sendConsoleNotification(message, priority) {
    const prefix = this.getConsolePrefix(priority);
    console.log(`${prefix} ${message}`);

    return {
      channel: 'console',
      status: 'delivered',
      timestamp: new Date().toISOString()
    };
  }

  async broadcastNotification(context, message, channels) {
    this.logger.info('Broadcasting notification to all channels');

    // 广播到所有配置的渠道
    const broadcastChannels = channels || ['log', 'console'];
    return await this.sendNotification(context, message, 'Broadcast', null, broadcastChannels, 'high', []);
  }

  async scheduleNotification(context, message, subject, recipients, scheduleTime) {
    this.logger.info('Scheduling notification', { scheduleTime });

    const now = new Date();
    const scheduledTime = new Date(scheduleTime);
    
    if (scheduledTime <= now) {
      // 如果时间已过，立即发送
      return await this.sendNotification(context, message, subject, recipients, ['log'], 'normal', []);
    }

    // 计算延迟时间
    const delay = scheduledTime.getTime() - now.getTime();
    
    // 设置定时器
    setTimeout(async () => {
      try {
        await this.sendNotification(context, message, subject, recipients, ['log'], 'normal', []);
        this.logger.info('Scheduled notification delivered', { scheduleTime });
      } catch (error) {
        this.logger.error('Scheduled notification failed', { 
          scheduleTime, 
          error: error.message 
        });
      }
    }, delay);

    return {
      channel: 'scheduled',
      status: 'scheduled',
      scheduledTime: scheduleTime,
      delay: delay,
      timestamp: new Date().toISOString()
    };
  }

  async sendTemplateNotification(context, templateName, templateData, recipients, channels) {
    this.logger.info('Sending template notification', { templateName });

    const template = this.getNotificationTemplate(templateName);
    const message = this.renderTemplate(template, templateData);
    const subject = this.renderTemplate(template.subject || templateName, templateData);

    return await this.sendNotification(context, message, subject, recipients, channels, 'normal', []);
  }

  async sendReport(context, reportData, reportType, recipients) {
    this.logger.info('Sending report notification', { reportType });

    const report = this.generateReport(reportData, reportType);
    const subject = `Report: ${reportType}`;
    const channels = ['log', 'file'];

    return await this.sendNotification(context, report, subject, recipients, channels, 'high', []);
  }

  // 辅助方法
  getLogMethod(priority) {
    switch (priority) {
      case 'low':
        return this.logger.debug;
      case 'normal':
        return this.logger.info;
      case 'high':
        return this.logger.warn;
      case 'urgent':
        return this.logger.error;
      default:
        return this.logger.info;
    }
  }

  getConsolePrefix(priority) {
    const timestamp = new Date().toLocaleString();
    switch (priority) {
      case 'low':
        return `[${timestamp}] [INFO]`;
      case 'normal':
        return `[${timestamp}] [NOTICE]`;
      case 'high':
        return `[${timestamp}] [WARNING]`;
      case 'urgent':
        return `[${timestamp}] [URGENT]`;
      default:
        return `[${timestamp}] [INFO]`;
    }
  }

  getNotificationTemplate(templateName) {
    const templates = {
      'workflow_completion': {
        subject: '工作流执行完成',
        message: '工作流 {{workflowName}} 已成功完成。\\n\\n执行详情：\\n- 执行ID: {{executionId}}\\n- 开始时间: {{startTime}}\\n- 结束时间: {{endTime}}\\n- 耗时: {{duration}}ms\\n- 步骤数: {{stepCount}}\\n\\n{{summary}}'
      },
      'workflow_failure': {
        subject: '工作流执行失败',
        message: '工作流 {{workflowName}} 执行失败。\\n\\n错误详情：\\n- 执行ID: {{executionId}}\\n- 失败时间: {{failureTime}}\\n- 失败步骤: {{failedStep}}\\n- 错误信息: {{errorMessage}}\\n\\n请及时检查处理。'
      },
      'data_processing_complete': {
        subject: '数据处理完成',
        message: '数据处理任务已完成。\\n\\n处理结果：\\n- 输入文件: {{inputFiles}}\\n- 输出文件: {{outputFiles}}\\n- 处理记录: {{recordCount}}\\n- 成功率: {{successRate}}%\\n\\n{{additionalInfo}}'
      },
      'system_alert': {
        subject: '系统告警',
        message: '系统检测到异常情况。\\n\\n告警详情：\\n- 告警类型: {{alertType}}\\n- 告警级别: {{alertLevel}}\\n- 发生时间: {{alertTime}}\\n- 影响范围: {{affectedComponents}}\\n\\n告警描述：\\n{{alertDescription}}'
      }
    };

    return templates[templateName] || {
      subject: templateName,
      message: '通知内容：' + JSON.stringify(templateData)
    };
  }

  renderTemplate(template, data) {
    let rendered = template.message || template;
    
    // 简单的模板渲染
    for (const [key, value] of Object.entries(data)) {
      const placeholder = `{{${key}}}`;
      rendered = rendered.replace(new RegExp(placeholder, 'g'), String(value));
    }
    
    return rendered;
  }

  generateReport(reportData, reportType) {
    const timestamp = new Date().toLocaleString();
    
    switch (reportType) {
      case 'workflow_execution':
        return `工作流执行报告\\n\\n生成时间: ${timestamp}\\n\\n${JSON.stringify(reportData, null, 2)}`;
      
      case 'system_health':
        return `系统健康报告\\n\\n生成时间: ${timestamp}\\n\\n${JSON.stringify(reportData, null, 2)}`;
      
      case 'data_processing':
        return `数据处理报告\\n\\n生成时间: ${timestamp}\\n\\n${JSON.stringify(reportData, null, 2)}`;
      
      default:
        return `通用报告\\n\\n生成时间: ${timestamp}\\n\\n${JSON.stringify(reportData, null, 2)}`;
    }
  }
}

export default NotificationOperation;
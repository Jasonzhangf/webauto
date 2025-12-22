// 结束节点
import BaseNode from './BaseNode';

class EndNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

    constructor(nodeId: string, config: any) {
        super();
        this.name = 'EndNode';
        this.description = '工作流结束节点';
    }

    async execute(context: any, params: any): Promise<any> {
        const { config, logger, browser, variables, engine, page } = context;

        try {
            logger.info('🏁 工作流结束');

            // 设置结束时间
            variables.set('endTime', new Date().toISOString());

            // 清理所有非持久化高亮（绿色目标高亮）
            if (page && config.cleanupHighlights !== false) {
                try {
                    await page.evaluate(() => {
                        if (typeof window.__webautoHighlight !== 'undefined' &&
                            typeof window.__webautoHighlight.cleanupNonPersistent === 'function') {
                            window.__webautoHighlight.cleanupNonPersistent();
                        }
                    });
                    logger.info('🧹 已清理所有非持久化高亮');
                } catch (e) {
                    logger.warn('⚠️ 清理高亮失败: ' + (e?.message || e));
                }
            }

            // 选择是否持久化会话
            const persistSession = config.persistSession !== false; // 默认持久化
            if (persistSession) {
                try {
                    engine.saveSession();
                    logger.info(`🔗 会话已持久化 (sessionId=${variables.get('sessionId')})`);
                    variables.set('sessionPersisted', true);
                } catch (e) {
                    logger.warn('⚠️ 会话持久化失败: ' + (e?.message || e));
                }
            }

            // 清理浏览器
            if (config.cleanup && browser) {
                logger.info('🧹 清理浏览器资源...');
                await browser.close();
                variables.set('browserClosed', true);
            }

            // 导出日志
            if (config.saveLogs) {
                logger.info('📄 保存执行日志...');
                variables.set('logsExported', true);
            }

            return {
                success: true,
                variables: {
                    workflowCompleted: true,
                    endTime: variables.get('endTime'),
                    executionTime: this.calculateExecutionTime(variables),
                    sessionId: variables.get('sessionId'),
                    sessionPersisted: variables.get('sessionPersisted') || false
                }
            };

        } catch (error) {
            logger.error(`❌ 工作流结束处理失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    calculateExecutionTime(variables) {
        const startTime = variables.get('startTime');
        const endTime = variables.get('endTime');

        if (startTime && endTime) {
            return new Date(endTime) - new Date(startTime);
        }
        return 0;
    }

    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                cleanup: {
                    type: 'boolean',
                description: '是否清理浏览器资源',
                default: true
            },
                persistSession: {
                    type: 'boolean',
                    description: '是否持久化浏览器会话以便后续工作流接力',
                    default: true
                },
                saveLogs: {
                    type: 'boolean',
                    description: '是否保存日志',
                    default: true
                },
                cleanupHighlights: {
                    type: 'boolean',
                    description: '是否清理非持久化高亮（绿色目标高亮）',
                    default: true
                }
            },
            required: []
        };
    }

    getInputs() {
        return [
            {
                name: 'browser',
                type: 'object',
                description: '浏览器实例'
            },
            {
                name: 'variables',
                type: 'object',
                description: '变量管理器'
            }
        ];
    }

    getOutputs() {
        return [
            {
                name: 'workflowCompleted',
                type: 'boolean',
                description: '工作流完成状态'
            },
            {
                name: 'executionTime',
                type: 'number',
                description: '执行时间（毫秒）'
            }
        ];
    }
}

export default EndNode;

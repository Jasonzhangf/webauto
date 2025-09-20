// 结束节点
import BaseNode from './BaseNode.js';

class EndNode extends BaseNode {
    constructor() {
        super();
        this.name = 'EndNode';
        this.description = '工作流结束节点';
    }

    async execute(context) {
        const { config, logger, browser, variables } = context;

        try {
            logger.info('🏁 工作流结束');

            // 设置结束时间
            variables.set('endTime', new Date().toISOString());

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
                    executionTime: this.calculateExecutionTime(variables)
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
                saveLogs: {
                    type: 'boolean',
                    description: '是否保存日志',
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
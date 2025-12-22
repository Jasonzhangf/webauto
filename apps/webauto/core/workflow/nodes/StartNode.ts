// 开始节点
import BaseNode from './BaseNode';

class StartNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

    constructor(nodeId: string, config: any) {
        super();
        this.name = 'StartNode';
        this.description = '工作流开始节点';
    }

    async execute(context: any, params: any): Promise<any> {
        context.logger.info('🚀 工作流开始执行');

        return {
            success: true,
            message: '工作流开始',
            variables: {
                workflowStarted: true,
                startTime: new Date().toISOString()
            }
        };
    }

    getConfigSchema() {
        return {
            type: 'object',
            properties: {},
            required: []
        };
    }

    getInputs() {
        return [];
    }

    getOutputs() {
        return [
            {
                name: 'workflowStarted',
                type: 'boolean',
                description: '工作流已开始标志'
            },
            {
                name: 'startTime',
                type: 'string',
                description: '开始时间'
            }
        ];
    }
}

export default StartNode;
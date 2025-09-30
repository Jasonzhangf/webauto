/**
 * 工作流引擎
 * 基于事件驱动的容器编排和任务调度系统
 */
export class WorkflowEngine {
    constructor(eventBus) {
        this.rules = new Map();
        this.instances = new Map();
        this.taskQueue = [];
        this.ruleEvaluations = [];
        this.isRunning = false;
        this.eventBus = eventBus;
        this.setupEventListeners();
    }
    /**
     * 添加工作流规则
     */
    addRule(rule) {
        this.rules.set(rule.id, { ...rule, enabled: rule.enabled ?? true });
        this.setupRuleListeners(this.rules.get(rule.id));
        this.logEvent('rule:added', {
            ruleId: rule.id,
            ruleName: rule.name,
            events: Array.isArray(rule.when) ? rule.when : [rule.when]
        });
    }
    /**
     * 移除工作流规则
     */
    removeRule(ruleId) {
        const rule = this.rules.get(ruleId);
        if (rule) {
            this.rules.delete(ruleId);
            this.cleanupRuleListeners(rule);
            this.logEvent('rule:removed', {
                ruleId: rule.id,
                ruleName: rule.name
            });
        }
    }
    /**
     * 创建工作流实例
     */
    createWorkflow(name, tasks, metadata) {
        const instance = {
            id: this.generateId(),
            name,
            status: 'pending',
            tasks,
            metadata
        };
        this.instances.set(instance.id, instance);
        this.logEvent('workflow:created', {
            workflowId: instance.id,
            workflowName: name,
            taskCount: tasks.length
        });
        return instance;
    }
    /**
     * 启动工作流实例
     */
    async startWorkflow(workflowId) {
        const instance = this.instances.get(workflowId);
        if (!instance) {
            throw new Error(`Workflow instance not found: ${workflowId}`);
        }
        if (instance.status !== 'pending') {
            throw new Error(`Workflow cannot be started in status: ${instance.status}`);
        }
        instance.status = 'running';
        instance.startTime = Date.now();
        this.logEvent('workflow:started', {
            workflowId: instance.id,
            workflowName: instance.name,
            startTime: instance.startTime
        });
        // 将任务添加到队列
        instance.tasks.forEach(task => {
            this.taskQueue.push({
                ...task,
                id: `${instance.id}_${task.id}`
            });
        });
        // 启动任务处理器
        this.startTaskProcessor();
    }
    /**
     * 取消工作流实例
     */
    async cancelWorkflow(workflowId, reason) {
        const instance = this.instances.get(workflowId);
        if (!instance) {
            throw new Error(`Workflow instance not found: ${workflowId}`);
        }
        instance.status = 'cancelled';
        instance.endTime = Date.now();
        instance.error = reason;
        this.logEvent('workflow:cancelled', {
            workflowId: instance.id,
            workflowName: instance.name,
            reason
        });
    }
    /**
     * 获取工作流实例
     */
    getWorkflow(workflowId) {
        return this.instances.get(workflowId);
    }
    /**
     * 获取所有工作流实例
     */
    getWorkflows(filter) {
        let workflows = Array.from(this.instances.values());
        if (filter) {
            if (filter.status) {
                workflows = workflows.filter(w => w.status === filter.status);
            }
            if (filter.name) {
                workflows = workflows.filter(w => w.name.includes(filter.name));
            }
        }
        return workflows;
    }
    /**
     * 获取规则评估历史
     */
    getRuleEvaluations(filter) {
        let evaluations = [...this.ruleEvaluations];
        if (filter) {
            if (filter.eventType) {
                const eventTypes = Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType];
                evaluations = evaluations.filter(e => eventTypes.includes(e.event));
            }
            if (filter.timeRange) {
                evaluations = evaluations.filter(e => e.evaluationTime >= filter.timeRange.start &&
                    e.evaluationTime <= filter.timeRange.end);
            }
        }
        return evaluations;
    }
    /**
     * 获取任务队列状态
     */
    getTaskQueueStatus() {
        const tasks = Array.from(this.instances.values()).flatMap(i => i.tasks);
        return {
            pending: tasks.filter(t => t.status === 'pending').length,
            processing: tasks.filter(t => t.status === 'processing').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => t.status === 'failed').length
        };
    }
    /**
     * 启动引擎
     */
    start() {
        this.isRunning = true;
        this.startTaskProcessor();
        this.logEvent('workflow:engine:started', {});
    }
    /**
     * 停止引擎
     */
    stop() {
        this.isRunning = false;
        this.stopTaskProcessor();
        this.logEvent('workflow:engine:stopped', {});
    }
    /**
     * 设置规则监听器
     */
    setupRuleListeners(rule) {
        const eventTypes = Array.isArray(rule.when) ? rule.when : [rule.when];
        eventTypes.forEach(eventType => {
            const handler = async (data) => {
                if (!rule.enabled)
                    return;
                await this.evaluateRule(rule, eventType, data);
            };
            this.eventBus.on(eventType, handler);
        });
    }
    /**
     * 清理规则监听器
     */
    cleanupRuleListeners(rule) {
        // 在实际实现中，需要存储处理器引用以便清理
        // 这里简化处理
    }
    /**
     * 评估规则
     */
    async evaluateRule(rule, event, data) {
        const startTime = Date.now();
        let conditionMet = false;
        let success = false;
        let error;
        try {
            // 检查条件
            if (rule.condition) {
                conditionMet = await rule.condition(data);
            }
            else {
                conditionMet = true;
            }
            const evaluation = {
                ruleId: rule.id,
                ruleName: rule.name,
                event,
                eventData: data,
                conditionMet,
                evaluationTime: startTime
            };
            this.ruleEvaluations.push(evaluation);
            this.logEvent('workflow:rule:evaluated', {
                ruleId: rule.id,
                ruleName: rule.name,
                event,
                conditionMet,
                evaluationTime: startTime
            });
            // 如果条件满足，执行规则
            if (conditionMet) {
                const executionStart = Date.now();
                // 执行 then() 回调
                if (rule.then) {
                    await rule.then(data);
                }
                // 执行 actions 数组
                if (rule.actions && rule.actions.length > 0) {
                    for (const action of rule.actions) {
                        await this.executeAction(action, data);
                    }
                }
                evaluation.executionTime = Date.now() - executionStart;
                evaluation.success = true;
                success = true;
                this.logEvent('workflow:condition:met', {
                    ruleId: rule.id,
                    ruleName: rule.name,
                    event,
                    executionTime: evaluation.executionTime
                });
            }
        }
        catch (err) {
            error = err instanceof Error ? err.message : String(err);
            success = false;
            this.logEvent('workflow:rule:error', {
                ruleId: rule.id,
                ruleName: rule.name,
                event,
                error
            });
        }
    }
    /**
     * 执行工作流动作
     */
    async executeAction(action, data) {
        switch (action.type) {
            case 'emit':
                if (action.event) {
                    await this.eventBus.emit(action.event, action.data || data, 'workflow-engine');
                }
                break;
            case 'delay':
                if (action.delay) {
                    await new Promise(resolve => setTimeout(resolve, action.delay));
                }
                break;
            case 'custom':
                if (action.handler) {
                    await action.handler(data);
                }
                break;
            default:
                console.warn(`[WorkflowEngine] 未知动作类型: ${action.type}`);
        }
    }
    /**
     * 启动任务处理器
     */
    startTaskProcessor() {
        if (this.taskProcessorInterval)
            return;
        this.taskProcessorInterval = setInterval(async () => {
            await this.processTaskQueue();
        }, 100);
    }
    /**
     * 停止任务处理器
     */
    stopTaskProcessor() {
        if (this.taskProcessorInterval) {
            clearInterval(this.taskProcessorInterval);
            this.taskProcessorInterval = undefined;
        }
    }
    /**
     * 处理任务队列
     */
    async processTaskQueue() {
        if (this.taskQueue.length === 0)
            return;
        const task = this.taskQueue.shift();
        if (!task)
            return;
        try {
            await this.executeTask(task);
        }
        catch (error) {
            this.logEvent('workflow:task:error', {
                taskId: task.id,
                taskName: task.name,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    /**
     * 执行任务
     */
    async executeTask(task) {
        this.logEvent('workflow:task:started', {
            taskId: task.id,
            taskName: task.name,
            taskType: task.type,
            target: task.target
        });
        // 根据任务类型执行不同的逻辑
        switch (task.type) {
            case 'container':
                await this.executeContainerTask(task);
                break;
            case 'system':
                await this.executeSystemTask(task);
                break;
            case 'custom':
                await this.executeCustomTask(task);
                break;
            default:
                throw new Error(`Unknown task type: ${task.type}`);
        }
        this.logEvent('workflow:task:completed', {
            taskId: task.id,
            taskName: task.name,
            executionTime: Date.now()
        });
    }
    /**
     * 执行容器任务
     */
    async executeContainerTask(task) {
        // 触发容器相关事件
        await this.eventBus.emit('workflow:task:ready', {
            taskId: task.id,
            taskName: task.name,
            priority: task.priority,
            target: task.target,
            action: task.action,
            parameters: task.parameters
        });
    }
    /**
     * 执行系统任务
     */
    async executeSystemTask(task) {
        // 执行系统级任务
        switch (task.action) {
            case 'delay':
                await new Promise(resolve => setTimeout(resolve, task.parameters?.delay || 1000));
                break;
            case 'log':
                console.log(`[Workflow] ${task.parameters?.message || 'System task'}`);
                break;
            default:
                throw new Error(`Unknown system action: ${task.action}`);
        }
    }
    /**
     * 执行自定义任务
     */
    async executeCustomTask(task) {
        // 执行自定义任务逻辑
        if (task.parameters?.handler) {
            await task.parameters.handler(task);
        }
        else {
            throw new Error('Custom task requires handler parameter');
        }
    }
    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 监听任务完成事件
        this.eventBus.on('workflow:task:completed', (data) => {
            this.checkWorkflowCompletion();
        });
        // 监听任务失败事件
        this.eventBus.on('workflow:task:error', (data) => {
            this.handleTaskFailure(data);
        });
    }
    /**
     * 检查工作流完成
     */
    checkWorkflowCompletion() {
        for (const instance of this.instances.values()) {
            if (instance.status === 'running') {
                const allTasksCompleted = instance.tasks.every(task => task.status === 'completed');
                const hasFailedTasks = instance.tasks.some(task => task.status === 'failed');
                if (allTasksCompleted) {
                    instance.status = 'completed';
                    instance.endTime = Date.now();
                    this.logEvent('workflow:completed', {
                        workflowId: instance.id,
                        workflowName: instance.name,
                        executionTime: instance.endTime - instance.startTime
                    });
                }
                else if (hasFailedTasks) {
                    instance.status = 'failed';
                    instance.endTime = Date.now();
                    this.logEvent('workflow:failed', {
                        workflowId: instance.id,
                        workflowName: instance.name,
                        error: 'Some tasks failed'
                    });
                }
            }
        }
    }
    /**
     * 处理任务失败
     */
    handleTaskFailure(data) {
        // 实现重试逻辑
        const taskId = data.taskId;
        const task = this.findTaskById(taskId);
        if (task && task.retryCount && task.retryCount > 0) {
            task.retryCount--;
            this.taskQueue.push(task); // 重新加入队列
            this.logEvent('workflow:task:retry', {
                taskId: task.id,
                taskName: task.name,
                remainingRetries: task.retryCount
            });
        }
    }
    /**
     * 根据ID查找任务
     */
    findTaskById(taskId) {
        for (const instance of this.instances.values()) {
            const task = instance.tasks.find(t => t.id === taskId);
            if (task)
                return task;
        }
        return undefined;
    }
    /**
     * 生成唯一ID
     */
    generateId() {
        return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * 记录事件
     */
    async logEvent(event, data) {
        await this.eventBus.emit(event, data, 'workflow-engine');
    }
    /**
     * 销毁工作流引擎
     */
    destroy() {
        this.stop();
        this.rules.clear();
        this.instances.clear();
        this.taskQueue = [];
        this.ruleEvaluations = [];
    }
}
//# sourceMappingURL=WorkflowEngine.js.map
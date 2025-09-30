/**
 * WebAuto Workflow Engine - Workflow Context Manager
 * @package @webauto/workflow-engine
 */
import { EventEmitter } from 'events';
export class WorkflowContext extends EventEmitter {
    constructor(workflowId, initialVariables = {}) {
        super();
        this._executionStack = [];
        this._sharedData = new Map();
        this._stepResults = new Map();
        this._logs = [];
        this._context = {
            id: `${workflowId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            workflowId,
            state: 'pending',
            startTime: Date.now(),
            variables: { ...initialVariables },
            currentStep: 0,
            steps: []
        };
    }
    // Getters
    get id() { return this._context.id; }
    get workflowId() { return this._context.workflowId; }
    get state() { return this._context.state; }
    get startTime() { return this._context.startTime; }
    get endTime() { return this._context.endTime; }
    get variables() { return { ...this._context.variables }; }
    get currentStep() { return this._context.currentStep; }
    get steps() { return [...this._context.steps]; }
    get error() { return this._context.error; }
    get executionStack() { return [...this._executionStack]; }
    get sharedData() { return new Map(this._sharedData); }
    get stepResults() { return new Map(this._stepResults); }
    get logs() {
        return [...this._logs];
    }
    // State management
    setState(state) {
        const previousState = this._context.state;
        this._context.state = state;
        this.log('info', `Context state changed: ${previousState} -> ${state}`);
        // Emit state change events
        this.emit('stateChanged', { context: this, previousState, newState: state });
        switch (state) {
            case 'running':
                this.emit('started', this);
                break;
            case 'completed':
                this._context.endTime = Date.now();
                this.emit('completed', this);
                break;
            case 'error':
                this._context.endTime = Date.now();
                this.emit('error', this);
                break;
            case 'paused':
                this.emit('paused', this);
                break;
        }
    }
    // Variable management
    setVariable(key, value) {
        this._context.variables[key] = value;
        this.log('debug', `Variable set: ${key} = ${JSON.stringify(value)}`);
        this.emit('variableChanged', { context: this, key, value });
    }
    getVariable(key) {
        return this._context.variables[key];
    }
    hasVariable(key) {
        return key in this._context.variables;
    }
    deleteVariable(key) {
        const exists = key in this._context.variables;
        if (exists) {
            delete this._context.variables[key];
            this.log('debug', `Variable deleted: ${key}`);
            this.emit('variableDeleted', { context: this, key });
        }
        return exists;
    }
    // Shared data management
    setSharedData(key, value) {
        this._sharedData.set(key, value);
        this.log('debug', `Shared data set: ${key} = ${JSON.stringify(value)}`);
        this.emit('sharedDataChanged', { context: this, key, value });
    }
    getSharedData(key) {
        return this._sharedData.get(key);
    }
    hasSharedData(key) {
        return this._sharedData.has(key);
    }
    deleteSharedData(key) {
        const exists = this._sharedData.has(key);
        if (exists) {
            this._sharedData.delete(key);
            this.log('debug', `Shared data deleted: ${key}`);
            this.emit('sharedDataDeleted', { context: this, key });
        }
        return exists;
    }
    // Step result management
    addStepResult(stepId, result) {
        this._stepResults.set(stepId, result);
        this.log('debug', `Step result added: ${stepId} - ${result.success ? 'success' : 'failed'}`);
        this.emit('stepResultAdded', { context: this, stepId, result });
    }
    getStepResult(stepId) {
        return this._stepResults.get(stepId);
    }
    hasStepResult(stepId) {
        return this._stepResults.has(stepId);
    }
    // Step management
    addStepExecution(step) {
        this._context.steps.push(step);
        this._executionStack.push(step.stepId);
        this.log('info', `Step execution added: ${step.stepName} (${step.stepId})`);
        this.emit('stepAdded', { context: this, step });
    }
    updateCurrentStep(stepIndex) {
        this._context.currentStep = stepIndex;
        this.log('debug', `Current step updated to: ${stepIndex}`);
        this.emit('currentStepChanged', { context: this, stepIndex });
    }
    // Execution stack management
    pushToStack(stepId) {
        this._executionStack.push(stepId);
        this.log('debug', `Step pushed to stack: ${stepId}`);
    }
    popFromStack() {
        const stepId = this._executionStack.pop();
        if (stepId) {
            this.log('debug', `Step popped from stack: ${stepId}`);
        }
        return stepId;
    }
    clearStack() {
        this._executionStack = [];
        this.log('debug', 'Execution stack cleared');
    }
    // Error handling
    setError(error) {
        this._context.error = error;
        this.setState('error');
        this.log('error', `Error set: ${error}`);
        this.emit('errorOccurred', { context: this, error });
    }
    clearError() {
        const previousError = this._context.error;
        this._context.error = undefined;
        this.log('debug', `Error cleared: ${previousError}`);
        this.emit('errorCleared', { context: this, previousError });
    }
    // Variable resolution
    resolveVariables(text) {
        return text.replace(/\$\{([^}]+)\}/g, (match, key) => {
            const value = this.getVariable(key);
            return value !== undefined ? String(value) : match;
        });
    }
    resolveObject(obj) {
        if (typeof obj === 'string') {
            return this.resolveVariables(obj);
        }
        else if (Array.isArray(obj)) {
            return obj.map(item => this.resolveObject(item));
        }
        else if (typeof obj === 'object' && obj !== null) {
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.resolveObject(value);
            }
            return result;
        }
        return obj;
    }
    // Logging
    log(level, message, stepId) {
        const logEntry = {
            timestamp: Date.now(),
            level,
            message,
            stepId
        };
        this._logs.push(logEntry);
        this.emit('log', { context: this, ...logEntry });
        // Also emit specific level events
        this.emit(`log:${level}`, { context: this, ...logEntry });
    }
    // Context information
    getExecutionTime() {
        const endTime = this._context.endTime || Date.now();
        return endTime - this._context.startTime;
    }
    getStepCount() {
        return this._context.steps.length;
    }
    getSuccessfulSteps() {
        return this._context.steps.filter(step => step.result.success).length;
    }
    getFailedSteps() {
        return this._context.steps.filter(step => !step.result.success).length;
    }
    getProgress() {
        const totalSteps = this._context.steps.length;
        if (totalSteps === 0)
            return 0;
        return (this._context.currentStep / totalSteps) * 100;
    }
    // Utility methods
    clone() {
        const cloned = new WorkflowContext(this.workflowId, this.variables);
        cloned._context = { ...this._context };
        cloned._executionStack = [...this._executionStack];
        cloned._sharedData = new Map(this._sharedData);
        cloned._stepResults = new Map(this._stepResults);
        cloned._logs = [...this._logs];
        return cloned;
    }
    toJSON() {
        return {
            ...this._context,
            steps: this._context.steps.map(step => ({
                ...step,
                result: { ...step.result } // Deep clone result
            }))
        };
    }
    // Cleanup
    destroy() {
        this.clearStack();
        this._sharedData.clear();
        this._stepResults.clear();
        this._logs.length = 0;
        this.removeAllListeners();
    }
}
//# sourceMappingURL=WorkflowContext.js.map
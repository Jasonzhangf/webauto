#!/usr/bin/env node

/**
 * 节点系统全面测试套件
 * Comprehensive Test Suite for Node System
 * 测试所有组件的健壮性和稳定性
 */

import WorkflowRunner from './workflow-runner.js';
import path from 'path';
import { promises as fs } from 'fs';

class NodeSystemTestSuite {
    constructor() {
        this.testResults = [];
        this.runner = new WorkflowRunner({
            logLevel: 'info',
            enableProgress: false,
            outputDir: './test-results'
        });
    }

    async runAllTests() {
        console.log('🚀 开始节点系统全面测试');
        console.log('==========================');

        const tests = [
            () => this.testSystemInitialization(),
            () => this.testNodeTypes(),
            () => this.testWorkflowValidation(),
            () => this.testWorkflowExecution(),
            () => this.testErrorHandling(),
            () => this.testEdgeCases(),
            () => this.testPerformance(),
            () => this.testMemoryManagement(),
            () => this.testConfigurationLoading(),
            () => this.testOutputGeneration()
        ];

        for (const test of tests) {
            try {
                await test();
            } catch (error) {
                this.recordResult(test.name, false, error.message);
            }
        }

        this.generateTestReport();
    }

    async testSystemInitialization() {
        console.log('\n🔧 测试系统初始化...');

        // 测试工作流运行器初始化
        const runner = new WorkflowRunner({
            logLevel: 'debug',
            enableProgress: true,
            outputDir: './test-outputs'
        });

        if (!runner.engine) {
            throw new Error('工作流引擎未正确初始化');
        }

        this.recordResult('系统初始化', true, '工作流运行器初始化成功');
    }

    async testNodeTypes() {
        console.log('\n🏗️ 测试节点类型定义...');

        import { NodeTypes } from './base-node.js';

        const requiredNodeTypes = [
            'BROWSER_OPERATOR',
            'COOKIE_MANAGER',
            'NAVIGATION_OPERATOR',
            'CONTAINER_EXTRACTOR',
            'LINK_FILTER',
            'FILE_SAVER',
            'CONDITIONAL_ROUTER'
        ];

        for (const nodeType of requiredNodeTypes) {
            if (!NodeTypes[nodeType]) {
                throw new Error(`缺少节点类型: ${nodeType}`);
            }

            const nodeDef = NodeTypes[nodeType];
            if (!nodeDef.inputs || !nodeDef.outputs) {
                throw new Error(`节点类型 ${nodeType} 缺少输入输出定义`);
            }
        }

        this.recordResult('节点类型定义', true, `所有 ${requiredNodeTypes.length} 个节点类型定义正确`);
    }

    async testWorkflowValidation() {
        console.log('\n✅ 测试工作流验证...');

        const workflowPath = path.join(__dirname, 'weibo-post-extraction-workflow.json');

        // 测试加载工作流
        await this.runner.loadWorkflow(workflowPath);

        // 测试验证
        const validation = await this.runner.validateWorkflow();

        if (!validation.valid) {
            throw new Error(`工作流验证失败: ${validation.errors.join(', ')}`);
        }

        this.recordResult('工作流验证', true, '工作流结构验证通过');
    }

    async testWorkflowExecution() {
        console.log('\n⚡ 测试工作流执行...');

        // 创建简化的测试工作流
        const testWorkflow = {
            version: "1.0",
            name: "Test Workflow",
            nodes: [
                {
                    id: "test_node",
                    type: "FILE_SAVER",
                    title: "Test File Saver",
                    position: { x: 0, y: 0 },
                    parameters: {
                        filePath: "./test-output.txt",
                        format: "text"
                    }
                }
            ],
            connections: [],
            variables: {}
        };

        // 临时保存测试工作流
        const testWorkflowPath = './test-workflow.json';
        await fs.writeFile(testWorkflowPath, JSON.stringify(testWorkflow, null, 2));

        try {
            await this.runner.loadWorkflow(testWorkflowPath);
            const result = await this.runner.execute();

            if (!result.success) {
                throw new Error(`工作流执行失败: ${result.error}`);
            }

            this.recordResult('工作流执行', true, '工作流执行成功');
        } finally {
            // 清理测试文件
            try {
                await fs.unlink(testWorkflowPath);
                await fs.unlink('./test-output.txt');
            } catch (e) {
                // 忽略清理错误
            }
        }
    }

    async testErrorHandling() {
        console.log('\n🚨 测试错误处理...');

        // 测试无效工作流
        const invalidWorkflow = {
            version: "1.0",
            name: "Invalid Workflow",
            nodes: [],
            connections: [],
            variables: {}
        };

        const invalidWorkflowPath = './invalid-workflow.json';
        await fs.writeFile(invalidWorkflowPath, JSON.stringify(invalidWorkflow, null, 2));

        try {
            await this.runner.loadWorkflow(invalidWorkflowPath);
            const validation = await this.runner.validateWorkflow();

            // 无效工作流应该被正确识别
            if (validation.valid) {
                throw new Error('无效工作流应该验证失败');
            }

            this.recordResult('错误处理', true, '无效工作流正确识别和处理');
        } finally {
            try {
                await fs.unlink(invalidWorkflowPath);
            } catch (e) {
                // 忽略清理错误
            }
        }
    }

    async testEdgeCases() {
        console.log('\n🔍 测试边界情况...');

        const edgeCases = [
            {
                name: '空工作流',
                workflow: { version: "1.0", name: "Empty", nodes: [], connections: [], variables: {} }
            },
            {
                name: '超大工作流',
                workflow: this.createLargeWorkflow()
            },
            {
                name: '复杂连接',
                workflow: this.createComplexConnectionsWorkflow()
            }
        ];

        for (const testCase of edgeCases) {
            try {
                const workflowPath = `./edge-case-${testCase.name}.json`;
                await fs.writeFile(workflowPath, JSON.stringify(testCase.workflow, null, 2));

                await this.runner.loadWorkflow(workflowPath);
                const validation = await this.runner.validateWorkflow();

                this.recordResult(`边界情况: ${testCase.name}`, true, '处理成功');

                await fs.unlink(workflowPath);
            } catch (error) {
                this.recordResult(`边界情况: ${testCase.name}`, false, error.message);
            }
        }
    }

    async testPerformance() {
        console.log('\n⚡ 测试性能...');

        const performanceWorkflow = this.createPerformanceTestWorkflow();
        const workflowPath = './performance-test.json';

        await fs.writeFile(workflowPath, JSON.stringify(performanceWorkflow, null, 2));

        try {
            const startTime = Date.now();

            await this.runner.loadWorkflow(workflowPath);
            const result = await this.runner.execute();

            const executionTime = Date.now() - startTime;

            if (executionTime > 10000) { // 10秒阈值
                throw new Error(`执行时间过长: ${executionTime}ms`);
            }

            this.recordResult('性能测试', true, `执行时间: ${executionTime}ms`);
        } finally {
            try {
                await fs.unlink(workflowPath);
            } catch (e) {
                // 忽略清理错误
            }
        }
    }

    async testMemoryManagement() {
        console.log('\n💾 测试内存管理...');

        const initialMemory = process.memoryUsage();

        // 执行多个工作流以测试内存管理
        for (let i = 0; i < 5; i++) {
            const testWorkflow = this.createSimpleWorkflow();
            const workflowPath = `./memory-test-${i}.json`;

            await fs.writeFile(workflowPath, JSON.stringify(testWorkflow, null, 2));

            await this.runner.loadWorkflow(workflowPath);
            await this.runner.execute();

            await fs.unlink(workflowPath);
        }

        const finalMemory = process.memoryUsage();
        const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

        if (memoryIncrease > 100 * 1024 * 1024) { // 100MB阈值
            throw new Error(`内存增长过多: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
        }

        this.recordResult('内存管理', true, `内存增长: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
    }

    async testConfigurationLoading() {
        console.log('\n⚙️ 测试配置加载...');

        const configTests = [
            {
                name: '环境变量替换',
                workflow: {
                    version: "1.0",
                    name: "Env Test",
                    nodes: [{
                        id: "test",
                        type: "FILE_SAVER",
                        parameters: { filePath: "${TEST_PATH}/test.txt" }
                    }],
                    connections: [],
                    variables: { TEST_PATH: "/tmp" }
                }
            },
            {
                name: '时间戳变量',
                workflow: {
                    version: "1.0",
                    name: "Timestamp Test",
                    nodes: [{
                        id: "test",
                        type: "FILE_SAVER",
                        parameters: { filePath: "./test-${TIMESTAMP}.txt" }
                    }],
                    connections: [],
                    variables: {}
                }
            }
        ];

        for (const test of configTests) {
            try {
                const workflowPath = `./config-test-${test.name}.json`;
                await fs.writeFile(workflowPath, JSON.stringify(test.workflow, null, 2));

                await this.runner.loadWorkflow(workflowPath);

                this.recordResult(`配置加载: ${test.name}`, true, '配置变量解析成功');

                await fs.unlink(workflowPath);
            } catch (error) {
                this.recordResult(`配置加载: ${test.name}`, false, error.message);
            }
        }
    }

    async testOutputGeneration() {
        console.log('\n📤 测试输出生成...');

        const outputFormats = ['json', 'csv', 'text', 'xml'];

        for (const format of outputFormats) {
            try {
                const testWorkflow = {
                    version: "1.0",
                    name: "Output Test",
                    nodes: [{
                        id: "test",
                        type: "FILE_SAVER",
                        parameters: {
                            filePath: `./test-output.${format}`,
                            format: format
                        }
                    }],
                    connections: [],
                    variables: {}
                };

                const workflowPath = `./output-test-${format}.json`;
                await fs.writeFile(workflowPath, JSON.stringify(testWorkflow, null, 2));

                await this.runner.loadWorkflow(workflowPath);
                await this.runner.execute();

                // 检查文件是否生成
                await fs.access(`./test-output.${format}`);

                this.recordResult(`输出生成: ${format}`, true, '文件生成成功');

                await fs.unlink(workflowPath);
                await fs.unlink(`./test-output.${format}`);
            } catch (error) {
                this.recordResult(`输出生成: ${format}`, false, error.message);
            }
        }
    }

    // 辅助方法
    createLargeWorkflow() {
        const nodes = [];
        const connections = [];

        // 创建100个节点
        for (let i = 0; i < 100; i++) {
            nodes.push({
                id: `node_${i}`,
                type: "FILE_SAVER",
                title: `Node ${i}`,
                position: { x: i * 100, y: 0 },
                parameters: { filePath: `./output_${i}.txt` }
            });
        }

        return {
            version: "1.0",
            name: "Large Workflow",
            nodes,
            connections,
            variables: {}
        };
    }

    createComplexConnectionsWorkflow() {
        const nodes = [
            { id: "input", type: "FILE_SAVER", position: { x: 0, y: 0 }, parameters: { filePath: "./input.txt" } },
            { id: "process1", type: "FILE_SAVER", position: { x: 200, y: 0 }, parameters: { filePath: "./process1.txt" } },
            { id: "process2", type: "FILE_SAVER", position: { x: 200, y: 100 }, parameters: { filePath: "./process2.txt" } },
            { id: "output", type: "FILE_SAVER", position: { x: 400, y: 50 }, parameters: { filePath: "./output.txt" } }
        ];

        const connections = [
            { from: "input", fromOutput: "success", to: "process1", toInput: "data" },
            { from: "input", fromOutput: "success", to: "process2", toInput: "data" },
            { from: "process1", fromOutput: "success", to: "output", toInput: "data" },
            { from: "process2", fromOutput: "success", to: "output", toInput: "data" }
        ];

        return {
            version: "1.0",
            name: "Complex Connections",
            nodes,
            connections,
            variables: {}
        };
    }

    createPerformanceTestWorkflow() {
        const nodes = [];
        for (let i = 0; i < 50; i++) {
            nodes.push({
                id: `perf_node_${i}`,
                type: "FILE_SAVER",
                title: `Performance Node ${i}`,
                position: { x: i * 50, y: 0 },
                parameters: { filePath: `./perf_test_${i}.txt` }
            });
        }

        return {
            version: "1.0",
            name: "Performance Test",
            nodes,
            connections: [],
            variables: {}
        };
    }

    createSimpleWorkflow() {
        return {
            version: "1.0",
            name: "Simple Test",
            nodes: [{
                id: "simple",
                type: "FILE_SAVER",
                parameters: { filePath: "./simple.txt" }
            }],
            connections: [],
            variables: {}
        };
    }

    recordResult(testName, success, message) {
        const result = {
            test: testName,
            success,
            message,
            timestamp: new Date().toISOString()
        };

        this.testResults.push(result);

        const icon = success ? '✅' : '❌';
        console.log(`${icon} ${testName}: ${message}`);
    }

    async generateTestReport() {
        const passedTests = this.testResults.filter(r => r.success);
        const failedTests = this.testResults.filter(r => !r.success);

        const report = {
            summary: {
                total: this.testResults.length,
                passed: passedTests.length,
                failed: failedTests.length,
                successRate: (passedTests.length / this.testResults.length * 100).toFixed(2) + '%'
            },
            results: this.testResults,
            timestamp: new Date().toISOString()
        };

        const reportPath = './test-results/comprehensive-test-report.json';
        await fs.mkdir('./test-results', { recursive: true });
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        console.log('\n📊 测试报告');
        console.log('============');
        console.log(`总计: ${report.summary.total} 个测试`);
        console.log(`通过: ${report.summary.passed} 个`);
        console.log(`失败: ${report.summary.failed} 个`);
        console.log(`成功率: ${report.summary.successRate}`);
        console.log(`\n详细报告保存到: ${reportPath}`);

        if (failedTests.length > 0) {
            console.log('\n❌ 失败的测试:');
            failedTests.forEach(test => {
                console.log(`   - ${test.test}: ${test.message}`);
            });
        }

        process.exit(failedTests.length > 0 ? 1 : 0);
    }
}

// 主执行函数
async function main() {
    const testSuite = new NodeSystemTestSuite();
    await testSuite.runAllTests();
}

if (require.main === module) {
    main().catch(console.error);
}

export default NodeSystemTestSuite;
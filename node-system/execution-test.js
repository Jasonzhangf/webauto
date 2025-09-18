#!/usr/bin/env node

/**
 * Execution test for node system
 * Tests actual workflow execution with the simple workflow
 */

import WorkflowRunner from './workflow-runner.js';

async function executionTest() {
    console.log('🚀 Node System Execution Test');
    console.log('=================================');

    try {
        const runner = new WorkflowRunner({
            logLevel: 'info',
            enableProgress: true,
            outputDir: './test-outputs'
        });

        // Load and validate workflow
        console.log('\n📋 Loading workflow...');
        await runner.loadWorkflow('./simple-test-workflow.json');

        console.log('\n🔍 Validating workflow...');
        const validation = await runner.validateWorkflow();

        if (!validation.valid) {
            console.log('❌ Workflow validation failed');
            return;
        }

        console.log('\n🎯 Starting workflow execution...');
        const result = await runner.execute();

        console.log('\n📊 Execution Results:');
        console.log(`✅ Success: ${result.success}`);
        console.log(`⏱️  Execution Time: ${result.executionTime}ms`);

        if (result.stats) {
            console.log(`📈 Statistics:`);
            console.log(`   Total Nodes: ${result.stats.totalNodes}`);
            console.log(`   Completed: ${result.stats.completedNodes}`);
            console.log(`   Failed: ${result.stats.failedNodes}`);
        }

        console.log('\n🎉 Execution test completed successfully!');

    } catch (error) {
        console.error('\n❌ Execution test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    executionTest().catch(console.error);
}

export { executionTest };
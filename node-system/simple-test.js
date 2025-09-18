#!/usr/bin/env node

/**
 * Simple test for node system
 * Tests basic node loading and workflow functionality
 */

import WorkflowRunner from './workflow-runner.js';

async function simpleTest() {
    console.log('🧪 Simple Node System Test');
    console.log('============================');

    try {
        const runner = new WorkflowRunner({
            logLevel: 'info'
        });

        // Test 1: Load simple workflow
        console.log('\n📋 Test 1: Loading simple workflow...');
        await runner.loadWorkflow('./simple-test-workflow.json');

        // Test 2: Validate workflow
        console.log('\n🔍 Test 2: Validating workflow...');
        const validation = await runner.validateWorkflow();

        if (validation.valid) {
            console.log('✅ Workflow validation passed');
        } else {
            console.log('❌ Workflow validation failed:');
            validation.errors.forEach(error => {
                console.log(`   - ${error}`);
            });
            return;
        }

        // Test 3: Get workflow status
        console.log('\n📊 Test 3: Getting workflow status...');
        const status = await runner.getWorkflowStatus();
        console.log(`✅ Workflow status: ${status.nodes.length} nodes, ${status.connections.length} connections`);

        // Test 4: Visualize workflow (simplified)
        console.log('\n👁️  Test 4: Workflow structure...');
        console.log('Nodes:');
        status.nodes.forEach(node => {
            console.log(`  - ${node.title} (${node.type})`);
        });

        console.log('\nConnections:');
        status.connections.forEach((conn, index) => {
            console.log(`  ${index + 1}. ${conn.from} → ${conn.to}`);
        });

        console.log('\n🎉 All basic tests passed!');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    simpleTest().catch(console.error);
}

export { simpleTest };
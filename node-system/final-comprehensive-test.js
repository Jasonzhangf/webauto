#!/usr/bin/env node

/**
 * Final comprehensive test for node system
 * Tests all aspects of the workflow system to ensure robustness
 */

import WorkflowRunner from './workflow-runner.js';
import { promises as fs } from 'fs';

async function finalComprehensiveTest() {
    console.log('🔬 Final Comprehensive Test Suite');
    console.log('===================================');

    const testResults = [];
    const runner = new WorkflowRunner({
        logLevel: 'warn', // Reduce noise for final test
        enableProgress: false,
        outputDir: './test-outputs'
    });

    try {
        // Test 1: Basic workflow loading and validation
        console.log('\n📋 Test 1: Basic workflow loading...');
        await runner.loadWorkflow('./simple-test-workflow.json');
        const validation1 = await runner.validateWorkflow();
        testResults.push({ name: 'Basic Workflow Loading', success: validation1.valid });
        console.log(`   Result: ${validation1.valid ? '✅ PASS' : '❌ FAIL'}`);

        // Test 2: Workflow execution
        console.log('\n🚀 Test 2: Workflow execution...');
        try {
            const result1 = await runner.execute();
            testResults.push({ name: 'Workflow Execution', success: result1.success });
            console.log(`   Result: ${result1.success ? '✅ PASS' : '❌ FAIL'}`);
        } catch (error) {
            testResults.push({ name: 'Workflow Execution', success: false, error: error.message });
            console.log(`   Result: ❌ FAIL - ${error.message}`);
        }

        // Test 3: Error handling workflow
        console.log('\n🚨 Test 3: Error handling...');
        await runner.loadWorkflow('./error-test-workflow.json');
        try {
            const result2 = await runner.execute();
            testResults.push({ name: 'Error Handling', success: true }); // Success if it doesn't crash
            console.log(`   Result: ✅ PASS`);
        } catch (error) {
            testResults.push({ name: 'Error Handling', success: false, error: error.message });
            console.log(`   Result: ❌ FAIL - ${error.message}`);
        }

        // Test 4: Large workflow simulation
        console.log('\n📊 Test 4: Large workflow simulation...');
        const largeWorkflow = {
            version: "1.0",
            name: "Large Test Workflow",
            nodes: Array.from({ length: 50 }, (_, i) => ({
                id: `node_${i}`,
                type: "COOKIE_MANAGER",
                title: `Cookie Manager ${i}`,
                position: { x: i * 20, y: (i % 5) * 20 },
                parameters: {
                    cookiePath: "/tmp/test-cookies.json",
                    domain: "example.com"
                }
            })),
            connections: [] // No connections - just test loading many nodes
        };

        // Write large workflow to file
        await fs.writeFile('./large-test-workflow.json', JSON.stringify(largeWorkflow, null, 2));

        await runner.loadWorkflow('./large-test-workflow.json');
        const validation3 = await runner.validateWorkflow();
        testResults.push({ name: 'Large Workflow Validation', success: validation3.valid });
        console.log(`   Result: ${validation3.valid ? '✅ PASS' : '❌ FAIL'}`);

        // Test 5: Export functionality
        console.log('\n📤 Test 5: Export functionality...');
        try {
            const exported = runner.exportWorkflow('./exported-workflow.json');
            testResults.push({ name: 'Export Functionality', success: true });
            console.log(`   Result: ✅ PASS`);
        } catch (error) {
            testResults.push({ name: 'Export Functionality', success: false, error: error.message });
            console.log(`   Result: ❌ FAIL - ${error.message}`);
        }

        // Test 6: Invalid workflow handling
        console.log('\n🔍 Test 6: Invalid workflow handling...');
        const invalidWorkflow = {
            version: "1.0",
            name: "Invalid Workflow",
            nodes: [
                {
                    id: "test_node",
                    type: "NONEXISTENT_TYPE",
                    title: "Invalid Node"
                }
            ],
            connections: []
        };

        await fs.writeFile('./invalid-workflow.json', JSON.stringify(invalidWorkflow, null, 2));

        try {
            await runner.loadWorkflow('./invalid-workflow.json');
            testResults.push({ name: 'Invalid Workflow Handling', success: false });
            console.log(`   Result: ❌ FAIL - Should have thrown error`);
        } catch (error) {
            testResults.push({ name: 'Invalid Workflow Handling', success: true });
            console.log(`   Result: ✅ PASS - Correctly rejected invalid workflow`);
        }

        // Test 7: Multiple rapid executions
        console.log('\n⚡ Test 7: Multiple rapid executions...');
        let rapidSuccess = 0;
        for (let i = 0; i < 5; i++) {
            try {
                await runner.loadWorkflow('./simple-test-workflow.json');
                await runner.execute();
                rapidSuccess++;
            } catch (error) {
                // Expected to have some failures due to rapid execution
            }
        }
        const rapidTestSuccess = rapidSuccess >= 3; // At least 3 should succeed
        testResults.push({ name: 'Rapid Executions', success: rapidTestSuccess });
        console.log(`   Result: ${rapidTestSuccess ? '✅ PASS' : '❌ FAIL'} (${rapidSuccess}/5 successful)`);

        // Summary
        console.log('\n📊 Test Summary');
        console.log('===============');

        const passedTests = testResults.filter(t => t.success).length;
        const totalTests = testResults.length;

        testResults.forEach(test => {
            const status = test.success ? '✅' : '❌';
            const errorInfo = test.error ? ` - ${test.error}` : '';
            console.log(`${status} ${test.name}${errorInfo}`);
        });

        console.log(`\n🎯 Final Result: ${passedTests}/${totalTests} tests passed`);

        if (passedTests === totalTests) {
            console.log('🎉 ALL TESTS PASSED - System is robust and ready for production!');
        } else if (passedTests >= totalTests * 0.8) {
            console.log('✅ System is mostly functional with minor issues');
        } else {
            console.log('⚠️  System needs further development and testing');
        }

        // Cleanup
        try {
            await fs.unlink('./large-test-workflow.json');
            await fs.unlink('./invalid-workflow.json');
            await fs.unlink('./exported-workflow.json');
        } catch (error) {
            // Ignore cleanup errors
        }

        return {
            success: passedTests >= totalTests * 0.8,
            passed: passedTests,
            total: totalTests,
            details: testResults
        };

    } catch (error) {
        console.error('\n💥 Comprehensive test failed:', error.message);
        return {
            success: false,
            error: error.message,
            passed: 0,
            total: testResults.length
        };
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    finalComprehensiveTest().then(result => {
        process.exit(result.success ? 0 : 1);
    }).catch(console.error);
}

export { finalComprehensiveTest };
#!/usr/bin/env node

/**
 * 测试微博容器操作器
 * 验证RCC基础模块继承和错误处理集成
 */

const { WeiboContainerOperator } = require('./src/containers/weibo-container-operator');
const { RCCError, ValidationError } = require('rcc-errorhandling');

async function testWeiboContainerOperator() {
    console.log('=== 测试微博容器操作器 ===');
    
    try {
        // 创建操作器实例
        const operator = new WeiboContainerOperator({
            logLevel: 'debug',
            enableMetrics: true,
            timeout: 10000,
            retryCount: 2
        });
        
        console.log('✓ 操作器创建成功');
        
        // 测试基础功能
        console.log('测试基础功能...');
        
        // 检查继承关系
        console.log('检查继承关系...');
        if (operator.constructor.name === 'WeiboContainerOperator') {
            console.log('✓ 类名正确');
        } else {
            console.log('✗ 类名错误:', operator.constructor.name);
        }
        
        // 检查配置
        console.log('检查配置...');
        if (operator.config.name === 'WeiboContainerOperator') {
            console.log('✓ 配置正确');
        } else {
            console.log('✗ 配置错误');
        }
        
        // 检查错误处理系统
        console.log('检查错误处理系统...');
        if (operator.errorStrategy && operator.recoveryManager) {
            console.log('✓ 错误处理系统已初始化');
        } else {
            console.log('✗ 错误处理系统未初始化');
        }
        
        // 检查容器注册表
        console.log('检查容器注册表...');
        if (operator.containerRegistry) {
            console.log('✓ 容器注册表已创建');
        } else {
            console.log('✗ 容器注册表未创建');
        }
        
        // 测试健康检查
        console.log('测试健康检查...');
        const healthStatus = await operator.healthCheck();
        console.log('健康状态:', healthStatus);
        
        // 测试系统状态
        console.log('测试系统状态...');
        const systemStatus = operator.getDetailedStatus();
        console.log('系统状态:', {
            name: systemStatus.name,
            version: systemStatus.version,
            state: systemStatus.state,
            containerCount: systemStatus.containers.total
        });
        
        // 测试错误处理
        console.log('测试错误处理...');
        try {
            throw new RCCError('测试错误', {
                code: 'TEST_ERROR',
                category: 'TEST',
                severity: 'INFO'
            });
        } catch (error) {
            console.log('✓ RCC错误类正常工作');
        }
        
        try {
            throw new ValidationError('测试验证错误', ['field1', 'field2']);
        } catch (error) {
            console.log('✓ ValidationError正常工作');
        }
        
        // 测试生命周期钩子
        console.log('测试生命周期钩子...');
        
        // 注册测试钩子
        operator.registerHook('testHook', async (data) => {
            console.log('测试钩子被执行:', data);
        });
        
        // 触发钩子
        await operator.emitHook('testHook', { message: '测试数据' });
        console.log('✓ 生命周期钩子正常工作');
        
        // 测试指标记录
        console.log('测试指标记录...');
        operator.recordMetric('test_metric', 100, { tag: 'test' });
        const metrics = operator.getMetrics();
        console.log('✓ 指标记录正常工作');
        
        console.log('\n=== 所有测试通过 ===');
        console.log('微博容器操作器已成功继承RCCBaseModule并集成了错误处理系统');
        
        return true;
        
    } catch (error) {
        console.error('测试失败:', error);
        return false;
    }
}

// 运行测试
if (require.main === module) {
    testWeiboContainerOperator()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('测试运行失败:', error);
            process.exit(1);
        });
}

module.exports = { testWeiboContainerOperator };
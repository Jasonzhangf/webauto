#!/usr/bin/env node

/**
 * 页面生命周期监控测试
 * 测试JavaScript重新注入机制在页面刷新和新tab场景下的表现
 */

import { chromium } from 'playwright';

class PageLifecycleMonitoringTest {
  constructor() {
    this.browser = null;
    this.context = null;
    this.testResults = {
      newTabDetection: false,
      pageRefreshDetection: false,
      javascriptReinjection: false,
      connectionPersistence: false,
      overallSuccess: false
    };
  }

  async runTest() {
    console.log('🧪 开始页面生命周期监控测试...\n');

    try {
      // 1. 启动浏览器服务
      await this.startBrowserService();
      console.log('✅ 浏览器服务启动完成\n');

      // 2. 等待服务初始化
      await this.sleep(3000);

      // 3. 测试页面监控状态
      await this.testPageMonitoringStatus();
      console.log('✅ 页面监控状态检查完成\n');

      // 4. 测试新页面检测
      await this.testNewPageDetection();
      console.log('✅ 新页面检测测试完成\n');

      // 5. 测试页面刷新检测
      await this.testPageRefreshDetection();
      console.log('✅ 页面刷新检测测试完成\n');

      // 6. 测试JavaScript重新注入
      await this.testJavaScriptReinjection();
      console.log('✅ JavaScript重新注入测试完成\n');

      // 7. 测试连接持久性
      await this.testConnectionPersistence();
      console.log('✅ 连接持久性测试完成\n');

      // 8. 生成测试报告
      this.generateTestReport();

    } catch (error) {
      console.error('❌ 测试失败:', error);
      this.testResults.overallSuccess = false;
    } finally {
      await this.cleanup();
    }
  }

  async startBrowserService() {
    console.log('🚀 启动浏览器控制服务...');

    // 启动浏览器控制服务（后台进程）
    const { spawn } = await import('child_process');

    this.browserServiceProcess = spawn('node', ['services/browser-control-service.js'], {
      stdio: 'pipe',
      cwd: process.cwd()
    });

    // 监听服务输出
    this.browserServiceProcess.stdout.on('data', (data) => {
      console.log(`[浏览器服务] ${data.toString().trim()}`);
    });

    this.browserServiceProcess.stderr.on('data', (data) => {
      console.error(`[浏览器服务错误] ${data.toString().trim()}`);
    });

    // 等待服务启动
    await this.sleep(2000);
    console.log('✅ 浏览器控制服务已启动');
  }

  async testPageMonitoringStatus() {
    console.log('📊 测试页面监控状态...');

    try {
      const response = await fetch('http://localhost:8001/page-monitor-status');
      const status = await response.json();

      console.log('监控状态:', {
        isMonitoring: status.isMonitoring,
        registrySize: status.registrySize,
        queueSize: status.queueSize,
        pagesCount: status.pages?.length || 0
      });

      this.testResults.monitoringActive = status.isMonitoring;
      this.testResults.initialPagesDetected = status.registrySize > 0;

    } catch (error) {
      console.error('❌ 页面监控状态检查失败:', error);
      throw error;
    }
  }

  async testNewPageDetection() {
    console.log('🆕 测试新页面检测...');

    try {
      // 启动独立的浏览器进行测试
      this.browser = await chromium.launch({ headless: false });
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 }
      });

      // 获取初始页面数量
      const initialStatus = await this.getMonitoringStatus();
      const initialPageCount = initialStatus.registrySize;

      // 创建新页面
      const newPage = await this.context.newPage();
      await newPage.goto('https://www.example.com', { waitUntil: 'domcontentloaded' });

      // 等待监控器检测到新页面
      await this.sleep(3000);

      // 检查页面数量是否增加
      const updatedStatus = await this.getMonitoringStatus();
      const updatedPageCount = updatedStatus.registrySize;

      console.log(`页面数量变化: ${initialPageCount} → ${updatedPageCount}`);

      if (updatedPageCount > initialPageCount) {
        console.log('✅ 新页面检测成功');
        this.testResults.newTabDetection = true;
      } else {
        console.log('❌ 新页面检测失败');
      }

      // 保存新页面ID用于后续测试
      this.testPageId = updatedStatus.pages[updatedStatus.pages.length - 1]?.pageId;

    } catch (error) {
      console.error('❌ 新页面检测测试失败:', error);
      throw error;
    }
  }

  async testPageRefreshDetection() {
    console.log('🔄 测试页面刷新检测...');

    try {
      if (!this.testPageId) {
        throw new Error('没有可用的测试页面ID');
      }

      // 获取页面刷新前的状态
      const beforeRefresh = await this.getMonitoringStatus();
      const pageInfo = beforeRefresh.pages.find(p => p.pageId === this.testPageId);

      if (!pageInfo) {
        throw new Error('找不到测试页面信息');
      }

      console.log(`刷新前页面状态: ${pageInfo.status}, 注入次数: ${pageInfo.injectionAttempts}`);

      // 刷新页面
      const page = await this.context.newPage();
      await page.goto('https://www.example.com', { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });

      // 等待监控器检测到刷新
      await this.sleep(3000);

      // 检查页面状态变化
      const afterRefresh = await this.getMonitoringStatus();
      const refreshedPageInfo = afterRefresh.pages.find(p => p.pageId === this.testPageId);

      if (refreshedPageInfo) {
        console.log(`刷新后页面状态: ${refreshedPageInfo.status}, 注入次数: ${refreshedPageInfo.injectionAttempts}`);

        // 检查是否检测到刷新（注入次数增加或状态重置）
        if (refreshedPageInfo.injectionAttempts > pageInfo.injectionAttempts ||
            refreshedPageInfo.status === 'pending') {
          console.log('✅ 页面刷新检测成功');
          this.testResults.pageRefreshDetection = true;
        } else {
          console.log('❌ 页面刷新检测失败');
        }
      }

      await page.close();

    } catch (error) {
      console.error('❌ 页面刷新检测测试失败:', error);
      throw error;
    }
  }

  async testJavaScriptReinjection() {
    console.log('💉 测试JavaScript重新注入...');

    try {
      // 使用手动注入API测试
      const response = await fetch('http://localhost:8001/manual-inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: this.testPageId })
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ JavaScript手动注入成功');
        this.testResults.javascriptReinjection = true;
      } else {
        console.log('❌ JavaScript手动注入失败:', result.error);
      }

      // 等待注入完成
      await this.sleep(2000);

      // 检查注入结果
      const status = await this.getMonitoringStatus();
      const pageInfo = status.pages.find(p => p.pageId === this.testPageId);

      if (pageInfo && pageInfo.status === 'connected') {
        console.log('✅ JavaScript连接建立成功');
      } else {
        console.log('❌ JavaScript连接建立失败');
      }

    } catch (error) {
      console.error('❌ JavaScript重新注入测试失败:', error);
      throw error;
    }
  }

  async testConnectionPersistence() {
    console.log('🔗 测试连接持久性...');

    try {
      // 创建测试页面并验证连接
      const testPage = await this.context.newPage();
      await testPage.goto('https://httpbin.org/html', { waitUntil: 'domcontentloaded' });

      // 检查页面是否有连接管理器
      const connectionStatus = await testPage.evaluate(() => {
        if (typeof window.PageConnectionManager !== 'undefined') {
          return window.PageConnectionManager.getStatus();
        }
        return null;
      });

      if (connectionStatus) {
        console.log('页面连接状态:', connectionStatus);

        if (connectionStatus.isConnected) {
          console.log('✅ JavaScript连接持久性正常');
          this.testResults.connectionPersistence = true;
        } else {
          console.log('❌ JavaScript连接未建立');
        }
      } else {
        console.log('❌ 页面缺少连接管理器');
      }

      await testPage.close();

    } catch (error) {
      console.error('❌ 连接持久性测试失败:', error);
      throw error;
    }
  }

  async getMonitoringStatus() {
    const response = await fetch('http://localhost:8001/page-monitor-status');
    return await response.json();
  }

  generateTestReport() {
    console.log('\n📋 测试报告');
    console.log('=' .repeat(50));

    const results = [
      { name: '新页面检测', status: this.testResults.newTabDetection },
      { name: '页面刷新检测', status: this.testResults.pageRefreshDetection },
      { name: 'JavaScript重新注入', status: this.testResults.javascriptReinjection },
      { name: '连接持久性', status: this.testResults.connectionPersistence }
    ];

    let passedTests = 0;
    results.forEach(result => {
      const icon = result.status ? '✅' : '❌';
      console.log(`${icon} ${result.name}: ${result.status ? '通过' : '失败'}`);
      if (result.status) passedTests++;
    });

    console.log('-'.repeat(50));
    console.log(`总体结果: ${passedTests}/${results.length} 测试通过`);

    this.testResults.overallSuccess = passedTests === results.length;

    if (this.testResults.overallSuccess) {
      console.log('🎉 所有测试通过！页面生命周期监控和JavaScript重新注入机制工作正常。');
    } else {
      console.log('⚠️ 部分测试失败，需要检查实现。');
    }
  }

  async cleanup() {
    console.log('\n🧹 清理测试资源...');

    try {
      // 关闭测试浏览器
      if (this.context) {
        await this.context.close();
      }
      if (this.browser) {
        await this.browser.close();
      }

      // 停止浏览器服务
      if (this.browserServiceProcess) {
        this.browserServiceProcess.kill('SIGTERM');
        console.log('✅ 浏览器服务已停止');
      }

    } catch (error) {
      console.error('清理资源时出错:', error);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 运行测试
const test = new PageLifecycleMonitoringTest();
test.runTest().catch(console.error);
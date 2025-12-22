
/**
 * 测试现有截图的UI识别脚本
 * 直接对已有截图进行识别并生成标注图片
 */

import fs from 'fs';
import path from 'path';

class ExistingScreenshotTester {
  constructor() {
    this.testImage = '/tmp/current-page-screenshot.png';
    this.uiServiceUrl = 'http://localhost:8898';
    this.testPrompts = [
      '识别搜索结果容器和第一个商品的坐标，以JSON格式返回',
      '识别页面中的所有按钮元素',
      '识别登录表单的位置和输入框',
      '识别导航菜单和主要链接'
    ];
  }

  log(message) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 检查UI识别服务状态
   */
  async checkUIService() {
    try {
      const response = await fetch(`${this.uiServiceUrl}/health`, {
        method: 'GET',
        timeout: 5000
      });

      if (!response.ok) {
        throw new Error(`服务不健康: ${response.status}`);
      }

      const health = await response.json();
      this.log(`✅ UI识别服务状态: ${health.status}, 模型已加载: ${health.model_loaded}`);
      return true;
    } catch (error) {
      this.log(`❌ UI识别服务检查失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 执行UI识别
   */
  async performUIRecognition(imagePath, prompt, testName) {
    try {
      this.log(`🧠 执行UI识别: ${testName}`);

      // 读取图片并转换为base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

      const requestData = {
        request_id: Date.now(),
        image: base64Image,
        query: prompt,
        scope: "full",
        parameters: {
          max_tokens: 4096,
          temperature: 0.1
        }
      };

      const startTime = Date.now();

      const response = await fetch(`${this.uiServiceUrl}/recognize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const endTime = Date.now();
      const processingTime = (endTime - startTime) / 1000;

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      this.log(`✅ 识别完成，耗时: ${processingTime.toFixed(2)}秒`);
      this.log(`📍 识别精度: 找到 ${result.elements?.length || 0} 个元素，置信度 ${(result.confidence || 0).toFixed(2)}`);

      return {
        success: result.success,
        processingTime,
        elementsFound: result.elements?.length || 0,
        confidence: result.confidence || 0,
        elements: result.elements || [],
        error: result.error
      };
    } catch (error) {
      this.log(`❌ UI识别失败: ${error.message}`);
      return {
        success: false,
        processingTime: 0,
        elementsFound: 0,
        confidence: 0,
        elements: [],
        error: error.message
      };
    }
  }

  /**
   * 生成标注图片
   */
  generateAnnotatedImage(originalPath, elements, testName, processingTime) {
    try {
      // 创建简单的HTML标注页面
      const htmlContent = this.generateAnnotationHTML(originalPath, elements, testName, processingTime);
      const htmlPath = `/tmp/ui-recognition-annotation-${Date.now()}.html`;

      fs.writeFileSync(htmlPath, htmlContent);
      this.log(`📄 标注页面已生成: ${htmlPath}`);

      return htmlPath;
    } catch (error) {
      this.log(`❌ 生成标注图片失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 生成HTML标注页面
   */
  generateAnnotationHTML(imagePath, elements, testName, processingTime) {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

    const elementsHTML = elements.map((el, index) => {
      if (el.bbox && Array.isArray(el.bbox) && el.bbox.length === 4) {
        const [x1, y1, x2, y2] = el.bbox;
        const width = x2 - x1;
        const height = y2 - y1;

        return `
          <div class="element-box" style="
            left: ${x1}px;
            top: ${y1}px;
            width: ${width}px;
            height: ${height}px;
            border: 2px solid ${this.getColorForIndex(index)};
            position: absolute;
            box-sizing: border-box;
          ">
            <div class="element-label" style="
              position: absolute;
              top: -25px;
              left: 0;
              background: ${this.getColorForIndex(index)};
              color: white;
              padding: 2px 6px;
              font-size: 12px;
              border-radius: 3px;
              white-space: nowrap;
            ">
              ${index + 1}: ${el.type || 'unknown'}
            </div>
          </div>
        `;
      }
      return '';
    }).join('');

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UI识别结果 - ${testName}</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
        }
        .image-container {
            position: relative;
            display: inline-block;
            margin: 20px 0;
            border: 1px solid #ddd;
        }
        .screenshot {
            display: block;
            max-width: 100%;
            height: auto;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #007bff;
        }
        .stat-label {
            font-size: 12px;
            color: #666;
            margin-bottom: 5px;
        }
        .stat-value {
            font-size: 18px;
            font-weight: bold;
            color: #333;
        }
        .elements-list {
            margin-top: 20px;
        }
        .element-item {
            background: #f8f9fa;
            padding: 10px;
            margin: 5px 0;
            border-radius: 4px;
            border-left: 3px solid #007bff;
        }
        .element-index {
            display: inline-block;
            width: 30px;
            height: 30px;
            line-height: 30px;
            text-align: center;
            border-radius: 50%;
            color: white;
            font-weight: bold;
            margin-right: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>UI识别结果分析</h1>
            <p><strong>测试名称:</strong> ${testName}</p>
            <p><strong>处理时间:</strong> ${processingTime.toFixed(2)}秒</p>
        </div>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-label">识别元素数量</div>
                <div class="stat-value">${elements.length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">平均置信度</div>
                <div class="stat-value">${elements.length > 0 ? (elements.reduce((sum, el) => sum + (el.confidence || 0), 0) / elements.length).toFixed(2) : '0.00'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">有坐标的元素</div>
                <div class="stat-value">${elements.filter(el => el.bbox && Array.isArray(el.bbox) && el.bbox.length === 4).length}</div>
            </div>
        </div>

        <div class="image-container">
            <img src="${base64Image}" alt="截图" class="screenshot">
            ${elementsHTML}
        </div>

        <div class="elements-list">
            <h3>识别元素详情</h3>
            ${elements.map((el, index) => `
                <div class="element-item">
                    <span class="element-index" style="background: ${this.getColorForIndex(index)}">${index + 1}</span>
                    <strong>${el.type || 'unknown'}</strong> - ${el.text || '无文本'}
                    ${el.bbox ? `<br><small>坐标: [${el.bbox.join(', ')}]</small>` : ''}
                    ${el.confidence ? `<br><small>置信度: ${(el.confidence * 100).toFixed(1)}%</small>` : ''}
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * 获取颜色
   */
  getColorForIndex(index) {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    return colors[index % colors.length];
  }

  /**
   * 运行测试
   */
  async runTest() {
    this.log('🚀 开始测试现有截图的UI识别...');

    // 检查截图文件是否存在
    if (!fs.existsSync(this.testImage)) {
      this.log(`❌ 截图文件不存在: ${this.testImage}`);
      return;
    }

    this.log(`📸 使用截图文件: ${this.testImage}`);

    // 检查UI识别服务
    if (!(await this.checkUIService())) {
      this.log('❌ UI识别服务不可用，测试终止');
      return;
    }

    const results = [];

    // 对每个提示词进行测试
    for (let i = 0; i < this.testPrompts.length; i++) {
      const prompt = this.testPrompts[i];
      const testName = `测试${i + 1}: ${prompt.substring(0, 30)}...`;

      this.log(`\n🔍 执行测试: ${testName}`);

      const result = await this.performUIRecognition(this.testImage, prompt, testName);

      if (result.success && result.elements.length > 0) {
        // 生成标注图片
        const annotationFile = this.generateAnnotatedImage(
          this.testImage,
          result.elements,
          testName,
          result.processingTime
        );

        results.push({
          testName,
          prompt,
          ...result,
          annotationFile
        });
      } else {
        results.push({
          testName,
          prompt,
          ...result,
          annotationFile: null
        });
      }

      // 测试间隔
      await this.sleep(2000);
    }

    // 生成总结报告
    this.generateSummaryReport(results);
  }

  /**
   * 生成总结报告
   */
  generateSummaryReport(results) {
    this.log('\n📋 生成测试总结报告...\n');

    console.log('='.repeat(80));
    console.log('UI识别测试总结报告');
    console.log('='.repeat(80));
    console.log(`测试时间: ${new Date().toLocaleString()}`);
    console.log(`测试图片: ${this.testImage}`);
    console.log(`测试数量: ${results.length}`);
    console.log('');

    let totalElements = 0;
    let successfulTests = 0;
    let avgProcessingTime = 0;

    results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} 测试${index + 1}: ${result.testName}`);
      console.log(`   处理时间: ${result.processingTime.toFixed(2)}秒`);
      console.log(`   识别元素: ${result.elementsFound}个`);
      console.log(`   置信度: ${result.confidence.toFixed(2)}`);

      if (result.annotationFile) {
        console.log(`   标注文件: ${result.annotationFile}`);
      }

      if (result.error) {
        console.log(`   错误: ${result.error}`);
      }

      console.log('');

      if (result.success) {
        successfulTests++;
        totalElements += result.elementsFound;
        avgProcessingTime += result.processingTime;
      }
    });

    console.log('📊 统计信息:');
    console.log(`   成功率: ${successfulTests}/${results.length} (${(successfulTests/results.length*100).toFixed(1)}%)`);
    console.log(`   总识别元素: ${totalElements}个`);
    console.log(`   平均处理时间: ${successfulTests > 0 ? (avgProcessingTime/successfulTests).toFixed(2) : 0}秒`);

    // 保存结果到JSON文件
    const reportData = {
      timestamp: new Date().toISOString(),
      testImage: this.testImage,
      results: results
    };

    const reportPath = `/tmp/ui-recognition-test-report-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));

    console.log(`\n📄 详细报告已保存: ${reportPath}`);
    console.log('\n🎉 测试完成！请查看生成的HTML标注文件以验证识别结果的准确性。');
  }
}

// 主执行函数
async function main(): Promise<any> {
  const tester = new ExistingScreenshotTester();

  try {
    await tester.runTest();
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

// 执行测试
main();
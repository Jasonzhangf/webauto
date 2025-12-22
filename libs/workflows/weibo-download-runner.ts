
// 微博下载工作流运行器
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WorkflowEngine from './engine/WorkflowEngine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runDownloadWorkflow(): Promise<any> {
    try {
        // 检查命令行参数
        const args = process.argv.slice(2);
        if (args.length < 1) {
            console.log('使用方法: node weibo-download-runner.js <链接文件路径> [下载目录]');
            console.log('示例: node weibo-download-runner.js ~/.webauto/weibo/weibo-links-homepage-2023-01-01.json');
            process.exit(1);
        }

        const inputFile = args[0];
        const downloadDir = args[1] || '~/.webauto/weibo/downloads';

        console.log('🚀 启动微博内容下载工作流...');
        console.log(`📄 输入文件: ${inputFile}`);
        console.log(`📂 下载目录: ${downloadDir}`);

        // 读取工作流配置
        const workflowPath = join(__dirname, 'weibo-download-workflow.json');
        const workflowConfig = JSON.parse(await readFile(workflowPath, 'utf8'));

        // 创建工作流引擎
        const engine = new WorkflowEngine();

        // 设置参数
        const parameters = {
            inputFile: inputFile,
            downloadDir: downloadDir
        };

        // 执行工作流
        const result = await engine.executeWorkflow(workflowConfig, parameters);

        if (result.success) {
            console.log('✅ 工作流执行成功!');
            console.log(`📊 下载统计: 总计 ${result.results.summary?.total || 0}, 成功 ${result.results.summary?.success || 0}, 失败 ${result.results.summary?.failed || 0}`);
            console.log(`📁 结果文件: ${result.variables.downloadResultFilePath || '未知'}`);
        } else {
            console.log('❌ 工作流执行失败!');
            console.log(`错误信息: ${result.error}`);
        }

        process.exit(result.success ? 0 : 1);
    } catch (error) {
        console.error('💥 运行下载工作流时发生错误:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本，则执行下载工作流
if (import.meta.url === `file://${process.argv[1]}`) {
    runDownloadWorkflow();
}

export default runDownloadWorkflow;
// 微博工作流管理器
import WeiboHomepageWorkflow from './weibo-homepage-workflow';
import WeiboSearchWorkflow from './weibo-search-workflow';
import WeiboProfileWorkflow from './weibo-profile-workflow';

class WorkflowManager {
    constructor() {
        this.workflows = {
            homepage: new WeiboHomepageWorkflow(),
            search: new WeiboSearchWorkflow(),
            profile: new WeiboProfileWorkflow()
        };
    }

    async executeWorkflow(type, params = {}) {
        console.log(`🚀 启动工作流: ${type}`);

        switch (type) {
            case 'homepage':
                return await this.workflows.homepage.execute();

            case 'search':
                if (!params.searchTerm) {
                    throw new Error('搜索工作流需要提供 searchTerm 参数');
                }
                return await this.workflows.search.execute(params.searchTerm);

            case 'profile':
                if (!params.profileId) {
                    throw new Error('个人主页工作流需要提供 profileId 参数');
                }
                return await this.workflows.profile.execute(params.profileId);

            default:
                throw new Error(`未知的工作流类型: ${type}`);
        }
    }

    showHelp() {
        console.log(`
🎯 微博链接捕获工作流管理器

使用方法:
  node workflows/workflow-manager.js <workflow-type> [参数]

工作流类型:
  homepage                    主页链接捕获
  search <search-term>        搜索页链接捕获
  profile <profile-id>        个人主页链接捕获

示例:
  node workflows/workflow-manager.js homepage
  node workflows/workflow-manager.js search 查理柯克
  node workflows/workflow-manager.js profile 2192828333

支持的参数:
  -h, --help                  显示帮助信息
        `);
    }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
        const manager = new WorkflowManager();
        manager.showHelp();
        process.exit(0);
    }

    const workflowType = args[0];
    const params = {};

    if (workflowType === 'search' && args[1]) {
        params.searchTerm = args[1];
    } else if (workflowType === 'profile' && args[1]) {
        params.profileId = args[1];
    }

    const manager = new WorkflowManager();

    manager.executeWorkflow(workflowType, params)
        .then(result => {
            console.log('\n🎉 工作流执行完成!');
            console.log(`📊 结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
            console.log(`📈 捕获链接数: ${result.actual}`);
            if (result.searchTerm) {
                console.log(`🔍 搜索关键词: ${result.searchTerm}`);
            }
            if (result.profileId) {
                console.log(`👤 用户ID: ${result.profileId}`);
            }
            if (result.savedFile) {
                console.log(`📄 结果文件: ${result.savedFile}`);
            }
        })
        .catch(error => {
            console.error('💥 执行失败:', error.message);
            process.exit(1);
        });
}

export default WorkflowManager;
/**
 * 更新 Camoufox 版本
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

function getCurrentVersion() {
    try {
        const result = execSync('npm ls camoufox', { encoding: 'utf8' });
        const versionMatch = result.match(/camoufox@([\d.]+\.[\d.]+(?:[a-z].*)/)?/);
        return versionMatch ? versionMatch[1] : 'unknown';
    } catch (error) {
        console.error('获取版本信息失败:', error.message);
        return 'unknown';
    }
}

function updateCamoufox() {
    console.log('🔄 开始更新 Camoufox...');
    
    try {
        // 卸载当前版本
        const currentVersion = getCurrentVersion();
        console.log(`当前版本: ${currentVersion}`);
        
        // 检查最新版本
        console.log('检查最新版本...');
        
        // 这里可以连接到 npm registry 检查最新版本
        
        // 卸载最新版本
        console.log('安装最新版本...');
        const { stdout, stderr, error } = execSync(
            'npm install camoufox@latest',
            { encoding: 'utf8', stdio: 'inherit' }
        );
        
        const newVersion = getCurrentVersion();
        console.log(`新版本: ${newVersion}`);
        
        if (currentVersion !== newVersion) {
            console.log('✅ Camoufox 更新成功');
        } else {
            console.log('✅ Camoufox 已是最新版本');
  
        }
    
    } catch (error) {
        console.error('❌ 更新失败:', error.message);
        return false;
    }
}
    
    return true;
}

// 检查版本兼容性
function checkCompatibility() {
    try {
        console.log('🔍 检查版本兼容性...');
        
        // 检查Camoufox是否与Playwright兼容
        const camoufoxVersion = getCurrentVersion();
        console.log(`Camoufox版本: ${camoufoxVersion}`);
        
        // 检查Playwright版本
        const playwrightVersion = execSync('npx playwright --version', { encoding: 'utf-8' });
        console.log(`Playwright版本: ${playwrightVersion.trim()}`);
        
        // 检查node版本兼容性
        const nodeVersion = process.version;
        console.log(`Node.js版本: ${nodeVersion}`);
        
        return {
            camoufox: camoufoxVersion,
            playwright: playwrightVersion.trim(),
            node: nodeVersion
        };
    } catch (error) {
 console.error('❌ 兼容性检查失败:', error.message);
        return { camoufox: 'unknown' };
    }
}

// 主函数
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('🔍 Camoufox 版本管理工具');
    
    const compatibility = checkCompatibility();
    const success = updateCamoufox();
    
    if (success) {
        console.log('\n🎉 可以尝试重新测试浏览器功能');
        console.log('\n使用命令:');
        console.log('npm run browser:oneclick --url https://www.baidu.com');
        console.log('或直接使用前台浏览器：');
        console.log('node start_browser_foreground.cjs');
    } else {
        console.log('\n❌ 更新失败，使用当前版本');
 }
}

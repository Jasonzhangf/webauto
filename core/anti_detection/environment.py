"""
环境检测器
检测和清理自动化痕迹，维护浏览器环境的真实性
"""

import asyncio
import random
import string
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

from .strategy import ThreatLevel


class DetectionType(Enum):
    """检测类型"""
    WEBDRIVER = "webdriver"
    USER_AGENT = "user_agent"
    BROWSER_FEATURES = "browser_features"
    SCREEN_PROPERTIES = "screen_properties"
    TIMING_ATTACKS = "timing_attacks"
    FINGERPRINTING = "fingerprinting"


@dataclass
class EnvironmentSignal:
    """环境检测信号"""
    detection_type: DetectionType
    severity: str  # low, medium, high, critical
    indicator: str
    value: Any
    description: str
    remediation: str


class EnvironmentDetector:
    """环境检测器"""

    def __init__(self, config):
        self.config = config
        self.logger = None
        self.browser_session = None

        # 检测脚本库
        self.detection_scripts = self._initialize_detection_scripts()

        # 清理脚本库
        self.cleanup_scripts = self._initialize_cleanup_scripts()

        # 指纹库
        self.fingerprint_database = self._initialize_fingerprint_database()

        # 当前指纹
        self.current_fingerprint: Optional[Dict[str, Any]] = None

    async def initialize(self, browser_session):
        """初始化环境检测器"""
        self.browser_session = browser_session

        # 生成初始指纹
        await self._generate_fingerprint()

    def _initialize_detection_scripts(self) -> Dict[DetectionType, str]:
        """初始化检测脚本"""
        return {
            DetectionType.WEBDRIVER: """
                () => {
                    const signals = [];

                    // WebDriver检测
                    if (window.navigator.webdriver) {
                        signals.push({
                            indicator: 'navigator.webdriver',
                            value: true,
                            severity: 'critical',
                            description: 'WebDriver属性存在'
                        });
                    }

                    // Chrome自动化扩展检测
                    if (window.chrome && window.chrome.runtime) {
                        try {
                            const context = window.chrome.runtime.onConnect;
                            if (context) {
                                signals.push({
                                    indicator: 'chrome.runtime.onConnect',
                                    value: 'present',
                                    severity: 'high',
                                    description: 'Chrome自动化扩展检测'
                                });
                            }
                        } catch (e) {}
                    }

                    // PhantomJS检测
                    if (window.callPhantom || window._phantom) {
                        signals.push({
                            indicator: 'phantomJS',
                            value: true,
                            severity: 'critical',
                            description: 'PhantomJS检测'
                        });
                    }

                    // Selenium检测
                    if (document.$cdc_asdjflasutopfhvcZLmcfl_ !== undefined) {
                        signals.push({
                            indicator: 'selenium_marker',
                            value: true,
                            severity: 'critical',
                            description: 'Selenium检测标记'
                        });
                    }

                    return signals;
                }
            """,

            DetectionType.USER_AGENT: """
                () => {
                    const signals = [];
                    const ua = navigator.userAgent;

                    // 检查常见自动化工具的User-Agent特征
                    const automationPatterns = [
                        /HeadlessChrome/,
                        /PhantomJS/,
                        /SlimerJS/,
                        / WebDriver/,
                        /selenium/i
                    ];

                    for (const pattern of automationPatterns) {
                        if (pattern.test(ua)) {
                            signals.push({
                                indicator: 'user_agent_pattern',
                                value: pattern.toString(),
                                severity: 'high',
                                description: 'User-Agent包含自动化工具标识'
                            });
                        }
                    }

                    // 检查User-Agent真实性
                    const realChromePattern = /Chrome\/\\d+\\.\\d+\\.\\d+/;
                    const realFirefoxPattern = /Firefox\/\\d+\\.\\d+/;

                    if (!realChromePattern.test(ua) && !realFirefoxPattern.test(ua)) {
                        signals.push({
                            indicator: 'user_agent_format',
                            value: 'invalid_format',
                            severity: 'medium',
                            description: 'User-Agent格式不标准'
                        });
                    }

                    return signals;
                }
            """,

            DetectionType.BROWSER_FEATURES: """
                () => {
                    const signals = [];

                    // 检查插件数量（真实浏览器通常有多个插件）
                    const plugins = navigator.plugins;
                    if (plugins.length === 0) {
                        signals.push({
                            indicator: 'no_plugins',
                            value: 0,
                            severity: 'medium',
                            description: '无浏览器插件'
                        });
                    }

                    // 检查语言设置
                    const languages = navigator.languages;
                    if (languages.length === 0 || languages[0] === 'en-US') {
                        signals.push({
                            indicator: 'language_settings',
                            value: languages,
                            severity: 'low',
                            description: '语言设置可能是默认值'
                        });
                    }

                    // 检查硬件信息
                    const hardware = navigator.hardwareConcurrency;
                    if (!hardware || hardware < 2) {
                        signals.push({
                            indicator: 'hardware_info',
                            value: hardware,
                            severity: 'medium',
                            description: '硬件信息不完整'
                        });
                    }

                    // 检查Permissions API
                    if (navigator.permissions && navigator.permissions.query) {
                        try {
                            const notification = await navigator.permissions.query({name: 'notifications'});
                            if (notification.state === 'prompt') {
                                signals.push({
                                    indicator: 'permissions_api',
                                    value: 'default_prompt',
                                    severity: 'low',
                                    description: '权限API使用默认状态'
                                });
                            }
                        } catch (e) {}
                    }

                    return signals;
                }
            """,

            DetectionType.SCREEN_PROPERTIES: """
                () => {
                    const signals = [];

                    // 检查屏幕分辨率
                    const width = screen.width;
                    const height = screen.height;
                    const colorDepth = screen.colorDepth;
                    const pixelDepth = screen.pixelDepth;

                    // 常见可疑分辨率
                    const suspiciousResolutions = [
                        [0, 0],
                        [1024, 768],  // 常见虚拟机分辨率
                        [800, 600],
                        [1366, 768]  // 常见默认分辨率
                    ];

                    for (const [w, h] of suspiciousResolutions) {
                        if (width === w && height === h) {
                            signals.push({
                                indicator: 'suspicious_resolution',
                                value: `${width}x${height}`,
                                severity: 'medium',
                                description: '可疑的屏幕分辨率'
                            });
                        }
                    }

                    // 检查颜色深度
                    if (colorDepth !== 24 && colorDepth !== 32) {
                        signals.push({
                            indicator: 'color_depth',
                            value: colorDepth,
                            severity: 'low',
                            description: '非标准的颜色深度'
                        });
                    }

                    // 检查设备像素比
                    const devicePixelRatio = window.devicePixelRatio;
                    if (devicePixelRatio === 1 && width >= 1920) {
                        signals.push({
                            indicator: 'device_pixel_ratio',
                            value: devicePixelRatio,
                            severity: 'low',
                            description: '高分辨率设备的设备像素比可能异常'
                        });
                    }

                    return signals;
                }
            """
        }

    def _initialize_cleanup_scripts(self) -> Dict[str, str]:
        """初始化清理脚本"""
        return {
            'webdriver_cleanup': """
                () => {
                    // 移除WebDriver属性
                    delete navigator.__proto__.webdriver;

                    // 移除Chrome自动化标记
                    if (window.chrome && window.chrome.runtime) {
                        delete window.chrome.runtime.onConnect;
                    }

                    // 移除PhantomJS标记
                    delete window.callPhantom;
                    delete window._phantom;

                    // 移除Selenium标记
                    delete document.$cdc_asdjflasutopfhvcZLmcfl_;

                    // 重新定义Object.defineProperty以防止检测
                    const originalDefineProperty = Object.defineProperty;
                    Object.defineProperty = function(obj, prop, descriptor) {
                        if (prop === 'webdriver' && obj === navigator) {
                            return obj;
                        }
                        return originalDefineProperty.call(this, obj, prop, descriptor);
                    };

                    return 'WebDriver cleanup completed';
                }
            """,

            'user_agent_spoofer': """
                (newUA) => {
                    // 使用Object.defineProperty设置User-Agent
                    Object.defineProperty(navigator, 'userAgent', {
                        get: function() { return newUA; },
                        configurable: true
                    });

                    // 同时设置相关属性
                    Object.defineProperty(navigator, 'appVersion', {
                        get: function() { return newUA.replace(/^Mozilla\\//, ''); },
                        configurable: true
                    });

                    return 'User-Agent spoofed';
                }
            """,

            'plugin_injection': """
                (plugins) => {
                    // 清除现有插件
                    const originalPlugins = navigator.plugins;

                    // 创建假的插件对象
                    const mockPlugins = {
                        length: plugins.length,
                        item: function(index) {
                            return plugins[index] || null;
                        },
                        namedItem: function(name) {
                            for (let plugin of plugins) {
                                if (plugin.name === name) return plugin;
                            }
                            return null;
                        }
                    };

                    // 重新定义plugins属性
                    Object.defineProperty(navigator, 'plugins', {
                        get: function() { return mockPlugins; },
                        configurable: true
                    });

                    return 'Plugins injected';
                }
            """,

            'language_randomizer': """
                (languages) => {
                    Object.defineProperty(navigator, 'language', {
                        get: function() { return languages[0]; },
                        configurable: true
                    });

                    Object.defineProperty(navigator, 'languages', {
                        get: function() { return languages; },
                        configurable: true
                    });

                    return 'Language settings randomized';
                }
            """
        }

    def _initialize_fingerprint_database(self) -> List[Dict[str, Any]]:
        """初始化指纹数据库"""
        return [
            {
                'name': 'Windows Chrome',
                'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'screen_resolution': [1920, 1080],
                'color_depth': 24,
                'plugins': ['Chrome PDF Plugin', 'Chrome PDF Viewer', 'Native Client'],
                'languages': ['en-US', 'en'],
                'timezone': 'America/New_York'
            },
            {
                'name': 'MacOS Chrome',
                'user_agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'screen_resolution': [1440, 900],
                'color_depth': 24,
                'plugins': ['Chrome PDF Plugin', 'Chrome PDF Viewer', 'Native Client'],
                'languages': ['en-US', 'en'],
                'timezone': 'America/Los_Angeles'
            },
            {
                'name': 'Windows Firefox',
                'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
                'screen_resolution': [1366, 768],
                'color_depth': 32,
                'plugins': ['PDF Viewer', 'Firefox PDF Plugin'],
                'languages': ['en-US', 'en'],
                'timezone': 'America/Chicago'
            }
        ]

    async def check_webdriver(self) -> List[EnvironmentSignal]:
        """检查WebDriver痕迹"""
        try:
            script = self.detection_scripts[DetectionType.WEBDRIVER]
            signals = await self.browser_session.evaluate(script)

            return [
                EnvironmentSignal(
                    detection_type=DetectionType.WEBDRIVER,
                    severity=signal['severity'],
                    indicator=signal['indicator'],
                    value=signal['value'],
                    description=signal['description'],
                    remediation=self._get_webdriver_remediation(signal['indicator'])
                )
                for signal in signals
            ]

        except Exception as error:
            if self.logger:
                self.logger.error(f"WebDriver check failed: {error}")
            return []

    async def check_user_agent(self) -> List[EnvironmentSignal]:
        """检查User-Agent"""
        try:
            script = self.detection_scripts[DetectionType.USER_AGENT]
            signals = await self.browser_session.evaluate(script)

            return [
                EnvironmentSignal(
                    detection_type=DetectionType.USER_AGENT,
                    severity=signal['severity'],
                    indicator=signal['indicator'],
                    value=signal['value'],
                    description=signal['description'],
                    remediation=self._get_user_agent_remediation(signal['indicator'])
                )
                for signal in signals
            ]

        except Exception as error:
            if self.logger:
                self.logger.error(f"User-Agent check failed: {error}")
            return []

    async def check_screen_properties(self) -> List[EnvironmentSignal]:
        """检查屏幕属性"""
        try:
            script = self.detection_scripts[DetectionType.SCREEN_PROPERTIES]
            signals = await self.browser_session.evaluate(script)

            return [
                EnvironmentSignal(
                    detection_type=DetectionType.SCREEN_PROPERTIES,
                    severity=signal['severity'],
                    indicator=signal['indicator'],
                    value=signal['value'],
                    description=signal['description'],
                    remediation=self._get_screen_remediation(signal['indicator'])
                )
                for signal in signals
            ]

        except Exception as error:
            if self.logger:
                self.logger.error(f"Screen properties check failed: {error}")
            return []

    async def check_browser_features(self) -> List[EnvironmentSignal]:
        """检查浏览器功能"""
        try:
            script = self.detection_scripts[DetectionType.BROWSER_FEATURES]
            signals = await self.browser_session.evaluate(script)

            return [
                EnvironmentSignal(
                    detection_type=DetectionType.BROWSER_FEATURES,
                    severity=signal['severity'],
                    indicator=signal['indicator'],
                    value=signal['value'],
                    description=signal['description'],
                    remediation=self._get_browser_features_remediation(signal['indicator'])
                )
                for signal in signals
            ]

        except Exception as error:
            if self.logger:
                self.logger.error(f"Browser features check failed: {error}")
            return []

    async def cleanup_environment(self) -> bool:
        """清理环境痕迹"""
        try:
            # 执行WebDriver清理
            await self.browser_session.evaluate(self.cleanup_scripts['webdriver_cleanup'])

            # 应用指纹
            if self.current_fingerprint:
                await self._apply_fingerprint()

            if self.logger:
                self.logger.info("Environment cleanup completed")

            return True

        except Exception as error:
            if self.logger:
                self.logger.error(f"Environment cleanup failed: {error}")
            return False

    async def change_fingerprint(self) -> bool:
        """更换指纹"""
        try:
            await self._generate_fingerprint()
            await self._apply_fingerprint()

            if self.logger:
                self.logger.info(f"Fingerprint changed to: {self.current_fingerprint['name']}")

            return True

        except Exception as error:
            if self.logger:
                self.logger.error(f"Fingerprint change failed: {error}")
            return False

    async def _generate_fingerprint(self):
        """生成新的浏览器指纹"""
        try:
            # 从数据库随机选择一个指纹
            base_fingerprint = random.choice(self.fingerprint_database)

            # 添加随机变化
            fingerprint = base_fingerprint.copy()
            fingerprint['screen_resolution'] = [
                base_fingerprint['screen_resolution'][0] + random.randint(-100, 100),
                base_fingerprint['screen_resolution'][1] + random.randint(-50, 50)
            ]

            # 生成随机的插件列表
            fingerprint['plugins'] = self._generate_realistic_plugins()

            # 随机化语言设置
            fingerprint['languages'] = self._generate_realistic_languages()

            self.current_fingerprint = fingerprint

        except Exception as error:
            if self.logger:
                self.logger.error(f"Fingerprint generation failed: {error}")

    def _generate_realistic_plugins(self) -> List[str]:
        """生成真实的插件列表"""
        all_plugins = [
            'Chrome PDF Plugin',
            'Chrome PDF Viewer',
            'Native Client',
            'Adobe Flash Player',
            'Java Deployment Toolkit',
            'Google Update',
            'Microsoft Office',
            'Google Talk Plugin',
            'Google Earth Plugin',
            'Widevine Content Decryption Module'
        ]

        # 随机选择3-8个插件
        num_plugins = random.randint(3, 8)
        selected_plugins = random.sample(all_plugins, num_plugins)

        return selected_plugins

    def _generate_realistic_languages(self) -> List[str]:
        """生成真实的语言设置"""
        language_sets = [
            ['en-US', 'en'],
            ['zh-CN', 'zh', 'en'],
            ['en-GB', 'en'],
            ['ja-JP', 'ja', 'en'],
            ['de-DE', 'de', 'en'],
            ['fr-FR', 'fr', 'en']
        ]

        return random.choice(language_sets)

    async def _apply_fingerprint(self):
        """应用当前指纹"""
        if not self.current_fingerprint:
            return

        try:
            # 设置User-Agent
            await self.browser_session.evaluate(
                self.cleanup_scripts['user_agent_spoofer'],
                self.current_fingerprint['user_agent']
            )

            # 设置插件
            await self.browser_session.evaluate(
                self.cleanup_scripts['plugin_injection'],
                self.current_fingerprint['plugins']
            )

            # 设置语言
            await self.browser_session.evaluate(
                self.cleanup_scripts['language_randomizer'],
                self.current_fingerprint['languages']
            )

        except Exception as error:
            if self.logger:
                self.logger.error(f"Fingerprint application failed: {error}")

    def _get_webdriver_remediation(self, indicator: str) -> str:
        """获取WebDriver修复方法"""
        remediation_map = {
            'navigator.webdriver': '执行WebDriver清理脚本',
            'chrome.runtime.onConnect': '移除Chrome自动化扩展标记',
            'phantomJS': '移除PhantomJS特定标记',
            'selenium_marker': '清理Selenium注入的元素'
        }
        return remediation_map.get(indicator, '执行通用环境清理')

    def _get_user_agent_remediation(self, indicator: str) -> str:
        """获取User-Agent修复方法"""
        remediation_map = {
            'user_agent_pattern': '使用真实浏览器User-Agent',
            'user_agent_format': '使用标准格式的User-Agent'
        }
        return remediation_map.get(indicator, '更换User-Agent为真实格式')

    def _get_screen_remediation(self, indicator: str) -> str:
        """获取屏幕属性修复方法"""
        remediation_map = {
            'suspicious_resolution': '使用常见的真实屏幕分辨率',
            'color_depth': '设置标准的颜色深度（24或32位）',
            'device_pixel_ratio': '调整设备像素比以匹配屏幕类型'
        }
        return remediation_map.get(indicator, '使用真实屏幕属性配置')

    def _get_browser_features_remediation(self, indicator: str) -> str:
        """获取浏览器功能修复方法"""
        remediation_map = {
            'no_plugins': '注入真实的浏览器插件',
            'language_settings': '设置非默认的语言偏好',
            'hardware_info': '添加真实的硬件信息',
            'permissions_api': '设置非默认的权限状态'
        }
        return remediation_map.get(indicator, '配置真实的浏览器功能')

    def get_current_fingerprint_info(self) -> Dict[str, Any]:
        """获取当前指纹信息"""
        return {
            'name': self.current_fingerprint.get('name', 'Unknown'),
            'user_agent': self.current_fingerprint.get('user_agent', ''),
            'screen_resolution': self.current_fingerprint.get('screen_resolution', []),
            'color_depth': self.current_fingerprint.get('color_depth', 24),
            'plugins_count': len(self.current_fingerprint.get('plugins', [])),
            'languages': self.current_fingerprint.get('languages', []),
            'timezone': self.current_fingerprint.get('timezone', 'UTC')
        }

    async def cleanup(self):
        """清理资源"""
        self.current_fingerprint = None
        self.browser_session = None
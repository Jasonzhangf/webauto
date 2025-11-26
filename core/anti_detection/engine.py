"""
反检测引擎主模块
提供人类行为模拟、环境检测和反爬虫对抗策略
"""

import asyncio
import random
import time
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, timedelta

from .human_behavior import HumanBehaviorSimulator
from .biometric import BiometricSimulator
from .environment import EnvironmentDetector
from .strategy import DetectionStrategy, ThreatLevel


class DetectionStatus(Enum):
    """检测状态"""
    SAFE = "safe"
    WARNING = "warning"
    DETECTED = "detected"
    BLOCKED = "blocked"


@dataclass
class DetectionReport:
    """检测报告"""
    status: DetectionStatus
    threat_level: ThreatLevel
    signals: List[Dict[str, Any]] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    next_check_interval: int = 30  # 秒


@dataclass
class AntiDetectionConfig:
    """反检测配置"""
    enabled: bool = True
    threat_level: ThreatLevel = ThreatLevel.LOW
    human_simulation: bool = True
    environment_cleanup: bool = True
    strategy_adaptation: bool = True
    monitoring_interval: int = 10  # 秒
    auto_recovery: bool = True

    # 人类行为参数
    typing_speed_variation: float = 0.3
    mouse_move_delay: Tuple[float, float] = (0.1, 0.8)
    click_delay_range: Tuple[float, float] = (0.2, 1.5)
    scroll_speed_variation: float = 0.4

    # 环境检测参数
    check_webdriver: bool = True
    check_user_agent: bool = True
    check_screen_props: bool = True
    check_browser_features: bool = True

    # 策略参数
    max_retry_attempts: int = 3
    escalation_threshold: int = 5
    recovery_timeout: int = 300  # 秒


class AntiDetectionEngine:
    """反检测引擎主类"""

    def __init__(self, config: Optional[AntiDetectionConfig] = None):
        self.config = config or AntiDetectionConfig()
        self.logger = None

        # 初始化组件
        self.human_simulator = HumanBehaviorSimulator(self.config)
        self.biometric_simulator = BiometricSimulator(self.config)
        self.environment_detector = EnvironmentDetector(self.config)
        self.strategy = DetectionStrategy(self.config)

        # 状态管理
        self.current_threat_level = ThreatLevel.LOW
        self.detection_count = 0
        self.last_detection_time: Optional[datetime] = None
        self.is_active = False
        self.browser_session = None

        # 监控任务
        self.monitoring_task: Optional[asyncio.Task] = None

        # 事件回调
        self.detection_callbacks: List[callable] = []

    async def initialize(self, browser_session) -> bool:
        """初始化反检测引擎"""
        try:
            self.browser_session = browser_session

            # 初始化环境检测器
            await self.environment_detector.initialize(browser_session)

            # 初始化人类行为模拟器
            await self.human_simulator.initialize(browser_session)

            # 初始化生物特征模拟器
            await self.biometric_simulator.initialize(browser_session)

            # 执行初始环境清理
            if self.config.environment_cleanup:
                await self.environment_detector.cleanup_environment()

            # 启动监控任务
            if self.config.enabled:
                await self.start_monitoring()

            self.is_active = True

            if self.logger:
                self.logger.info("Anti-detection engine initialized")

            return True

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to initialize anti-detection engine: {error}")
            return False

    async def start_monitoring(self):
        """启动检测监控"""
        if self.monitoring_task and not self.monitoring_task.done():
            return

        self.monitoring_task = asyncio.create_task(self._monitoring_loop())

    async def stop_monitoring(self):
        """停止检测监控"""
        if self.monitoring_task:
            self.monitoring_task.cancel()
            try:
                await self.monitoring_task
            except asyncio.CancelledError:
                pass

    async def _monitoring_loop(self):
        """监控循环"""
        while self.is_active and self.config.enabled:
            try:
                # 执行检测扫描
                detection_report = await self.scan_for_detection()

                # 处理检测结果
                if detection_report.status != DetectionStatus.SAFE:
                    await self._handle_detection(detection_report)

                # 更新威胁等级
                if detection_report.threat_level != self.current_threat_level:
                    await self._update_threat_level(detection_report.threat_level)

                # 等待下次检测
                await asyncio.sleep(detection_report.next_check_interval)

            except asyncio.CancelledError:
                break
            except Exception as error:
                if self.logger:
                    self.logger.error(f"Monitoring loop error: {error}")
                await asyncio.sleep(self.config.monitoring_interval)

    async def scan_for_detection(self) -> DetectionReport:
        """扫描检测信号"""
        try:
            signals = []
            threat_level = ThreatLevel.LOW
            status = DetectionStatus.SAFE
            recommendations = []

            # 环境检测
            if self.config.check_webdriver:
                webdriver_signals = await self.environment_detector.check_webdriver()
                signals.extend(webdriver_signals)

            if self.config.check_user_agent:
                ua_signals = await self.environment_detector.check_user_agent()
                signals.extend(ua_signals)

            if self.config.check_screen_props:
                screen_signals = await self.environment_detector.check_screen_properties()
                signals.extend(screen_signals)

            if self.config.check_browser_features:
                feature_signals = await self.environment_detector.check_browser_features()
                signals.extend(feature_signals)

            # 分析威胁等级
            if signals:
                high_threat_count = sum(1 for s in signals if s.get('severity') == 'high')
                medium_threat_count = sum(1 for s in signals if s.get('severity') == 'medium')

                if high_threat_count >= 2:
                    threat_level = ThreatLevel.HIGH
                    status = DetectionStatus.DETECTED
                    recommendations.append("Immediate action required - high threat detected")
                elif high_threat_count >= 1 or medium_threat_count >= 3:
                    threat_level = ThreatLevel.MEDIUM
                    status = DetectionStatus.WARNING
                    recommendations.append("Increase stealth measures")
                elif medium_threat_count >= 1:
                    threat_level = ThreatLevel.LOW
                    status = DetectionStatus.WARNING
                    recommendations.append("Monitor closely")

                # 根据信号调整检测间隔
                next_check_interval = max(5, 30 - len(signals) * 2)
            else:
                next_check_interval = 60  # 安全状态下降低检测频率

            return DetectionReport(
                status=status,
                threat_level=threat_level,
                signals=signals,
                recommendations=recommendations,
                next_check_interval=next_check_interval
            )

        except Exception as error:
            if self.logger:
                self.logger.error(f"Detection scan failed: {error}")

            return DetectionReport(
                status=DetectionStatus.WARNING,
                threat_level=ThreatLevel.MEDIUM,
                signals=[{'type': 'scan_error', 'error': str(error)}],
                recommendations=['Retry scan'],
                next_check_interval=30
            )

    async def _handle_detection(self, detection_report: DetectionReport):
        """处理检测事件"""
        try:
            self.detection_count += 1
            self.last_detection_time = datetime.utcnow()

            # 触发检测回调
            for callback in self.detection_callbacks:
                try:
                    await callback(detection_report)
                except Exception as error:
                    if self.logger:
                        self.logger.error(f"Detection callback failed: {error}")

            # 执行自动恢复策略
            if self.config.auto_recovery:
                await self._execute_recovery_strategy(detection_report)

            if self.logger:
                self.logger.warning(
                    f"Detection handled: {detection_report.status.value}, "
                    f"threat level: {detection_report.threat_level.value}"
                )

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to handle detection: {error}")

    async def _execute_recovery_strategy(self, detection_report: DetectionReport):
        """执行恢复策略"""
        try:
            # 获取恢复策略
            recovery_actions = await self.strategy.get_recovery_actions(detection_report)

            # 执行恢复动作
            for action in recovery_actions:
                try:
                    if action['type'] == 'environment_cleanup':
                        await self.environment_detector.cleanup_environment()
                    elif action['type'] == 'randomize_behavior':
                        await self.human_simulator.randomize_parameters()
                    elif action['type'] == 'delay_action':
                        await asyncio.sleep(action['duration'])
                    elif action['type'] == 'change_fingerprint':
                        await self.environment_detector.change_fingerprint()

                    if self.logger:
                        self.logger.info(f"Executed recovery action: {action['type']}")

                except Exception as error:
                    if self.logger:
                        self.logger.error(f"Recovery action failed: {action['type']}, error: {error}")

        except Exception as error:
            if self.logger:
                self.logger.error(f"Recovery strategy execution failed: {error}")

    async def _update_threat_level(self, new_threat_level: ThreatLevel):
        """更新威胁等级"""
        try:
            old_level = self.current_threat_level
            self.current_threat_level = new_threat_level

            # 更新配置参数
            await self.strategy.adapt_to_threat_level(new_threat_level)

            # 更新人类行为模拟参数
            await self.human_simulator.adapt_to_threat_level(new_threat_level)

            if self.logger:
                self.logger.info(f"Threat level updated: {old_level.value} -> {new_threat_level.value}")

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to update threat level: {error}")

    async def simulate_click(self, selector: str, **kwargs) -> bool:
        """模拟点击行为"""
        try:
            if self.config.human_simulation:
                return await self.human_simulator.simulate_click(selector, **kwargs)
            else:
                # 直接点击
                element = await self.browser_session.query_selector(selector)
                if element:
                    await element.click()
                    return True
                return False

        except Exception as error:
            if self.logger:
                self.logger.error(f"Click simulation failed: {error}")
            return False

    async def simulate_typing(self, selector: str, text: str, **kwargs) -> bool:
        """模拟打字行为"""
        try:
            if self.config.human_simulation:
                return await self.human_simulator.simulate_typing(selector, text, **kwargs)
            else:
                # 直接填充
                element = await self.browser_session.query_selector(selector)
                if element:
                    await element.fill(text)
                    return True
                return False

        except Exception as error:
            if self.logger:
                self.logger.error(f"Typing simulation failed: {error}")
            return False

    async def simulate_mouse_movement(self, target_selector: str, **kwargs) -> bool:
        """模拟鼠标移动"""
        try:
            if self.config.human_simulation:
                return await self.human_simulator.simulate_mouse_movement(target_selector, **kwargs)
            else:
                # 直接移动
                element = await self.browser_session.query_selector(target_selector)
                if element:
                    await element.hover()
                    return True
                return False

        except Exception as error:
            if self.logger:
                self.logger.error(f"Mouse movement simulation failed: {error}")
            return False

    async def add_detection_callback(self, callback: callable):
        """添加检测回调"""
        if callback not in self.detection_callbacks:
            self.detection_callbacks.append(callback)

    async def remove_detection_callback(self, callback: callable):
        """移除检测回调"""
        if callback in self.detection_callbacks:
            self.detection_callbacks.remove(callback)

    def get_status(self) -> Dict[str, Any]:
        """获取引擎状态"""
        return {
            'is_active': self.is_active,
            'current_threat_level': self.current_threat_level.value,
            'detection_count': self.detection_count,
            'last_detection_time': self.last_detection_time.isoformat() if self.last_detection_time else None,
            'monitoring_active': self.monitoring_task is not None and not self.monitoring_task.done(),
            'config': {
                'enabled': self.config.enabled,
                'human_simulation': self.config.human_simulation,
                'environment_cleanup': self.config.environment_cleanup,
                'strategy_adaptation': self.config.strategy_adaptation
            }
        }

    async def cleanup(self):
        """清理引擎资源"""
        try:
            self.is_active = False

            # 停止监控
            await self.stop_monitoring()

            # 清理组件
            if self.human_simulator:
                await self.human_simulator.cleanup()

            if self.environment_detector:
                await self.environment_detector.cleanup()

            if self.biometric_simulator:
                await self.biometric_simulator.cleanup()

            if self.logger:
                self.logger.info("Anti-detection engine cleaned up")

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to cleanup anti-detection engine: {error}")
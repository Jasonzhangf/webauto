"""
反检测策略管理
动态调整检测应对策略和威胁等级
"""

import asyncio
import random
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum


class ThreatLevel(Enum):
    """威胁等级"""
    LOW = "low"          # 低威胁：正常模式
    MEDIUM = "medium"    # 中等威胁：谨慎模式
    HIGH = "high"        # 高威胁：隐匿模式
    CRITICAL = "critical"  # 严重威胁：停止模式


class StrategyType(Enum):
    """策略类型"""
    PREVENTIVE = "preventive"      # 预防性策略
    REACTIVE = "reactive"          # 反应性策略
    ADAPTIVE = "adaptive"          # 自适应策略
    ESCALATION = "escalation"      # 升级策略


@dataclass
class StrategyAction:
    """策略动作"""
    action_type: str
    parameters: Dict[str, Any]
    priority: int = 1
    duration: Optional[int] = None  # 持续时间（秒）
    conditions: List[str] = None  # 执行条件


@dataclass
class DetectionSignal:
    """检测信号"""
    signal_type: str
    severity: str  # low, medium, high, critical
    source: str
    timestamp: float
    details: Dict[str, Any]


class DetectionStrategy:
    """检测策略管理器"""

    def __init__(self, config):
        self.config = config
        self.logger = None
        self.current_threat_level = ThreatLevel.LOW
        self.strategy_history: List[Dict[str, Any]] = []

        # 策略库
        self.strategy_library = self._initialize_strategy_library()

        # 威胁等级阈值
        self.threat_thresholds = {
            'detection_count_per_minute': {
                ThreatLevel.LOW: 0,
                ThreatLevel.MEDIUM: 2,
                ThreatLevel.HIGH: 5,
                ThreatLevel.CRITICAL: 10
            },
            'high_severity_signals': {
                ThreatLevel.LOW: 0,
                ThreatLevel.MEDIUM: 1,
                ThreatLevel.HIGH: 3,
                ThreatLevel.CRITICAL: 5
            }
        }

        # 自适应参数
        self.adaptation_rate = 0.1
        self.learning_enabled = True

    def _initialize_strategy_library(self) -> Dict[ThreatLevel, Dict[StrategyType, List[StrategyAction]]]:
        """初始化策略库"""
        return {
            ThreatLevel.LOW: {
                StrategyType.PREVENTIVE: [
                    StrategyAction("random_delays", {"min": 0.1, "max": 0.5}, priority=1),
                    StrategyAction("basic_user_agent", {}, priority=1),
                    StrategyAction("mouse_movement", {"curve": True}, priority=2)
                ],
                StrategyType.ADAPTIVE: [
                    StrategyAction("monitor_performance", {}, priority=1),
                    StrategyAction("collect_metrics", {}, priority=2)
                ]
            },
            ThreatLevel.MEDIUM: {
                StrategyType.PREVENTIVE: [
                    StrategyAction("random_delays", {"min": 0.3, "max": 1.0}, priority=1),
                    StrategyAction("enhanced_user_agent", {}, priority=1),
                    StrategyAction("fingerprint_rotation", {"frequency": 300}, priority=2),
                    StrategyAction("proxy_rotation", {"frequency": 600}, priority=3)
                ],
                StrategyType.REACTIVE: [
                    StrategyAction("pause_on_detection", {"duration": 30}, priority=1),
                    StrategyAction("reduce_speed", {"factor": 0.7}, priority=2)
                ],
                StrategyType.ADAPTIVE: [
                    StrategyAction("analyze_patterns", {}, priority=1),
                    StrategyAction("adjust_behavior", {}, priority=2)
                ]
            },
            ThreatLevel.HIGH: {
                StrategyType.PREVENTIVE: [
                    StrategyAction("random_delays", {"min": 0.5, "max": 2.0}, priority=1),
                    StrategyAction("advanced_user_agent", {}, priority=1),
                    StrategyAction("fingerprint_rotation", {"frequency": 120}, priority=1),
                    StrategyAction("proxy_rotation", {"frequency": 180}, priority=1),
                    StrategyAction("request_throttling", {"rps": 2}, priority=2)
                ],
                StrategyType.REACTIVE: [
                    StrategyAction("pause_on_detection", {"duration": 120}, priority=1),
                    StrategyAction("reduce_speed", {"factor": 0.5}, priority=1),
                    StrategyAction("reset_session", {"probability": 0.3}, priority=2),
                    StrategyAction("ip_change", {"probability": 0.2}, priority=3)
                ],
                StrategyType.ESCALATION: [
                    StrategyAction("increase_monitoring", {"interval": 5}, priority=1),
                    StrategyAction("emergency_protocols", {}, priority=2)
                ]
            },
            ThreatLevel.CRITICAL: {
                StrategyType.PREVENTIVE: [
                    StrategyAction("max_random_delays", {"min": 1.0, "max": 5.0}, priority=1),
                    StrategyAction("stealth_mode", {}, priority=1),
                    StrategyAction("fingerprint_rotation", {"frequency": 60}, priority=1),
                    StrategyAction("proxy_rotation", {"frequency": 90}, priority=1),
                    StrategyAction("request_throttling", {"rps": 1}, priority=1)
                ],
                StrategyType.REACTIVE: [
                    StrategyAction("immediate_pause", {"duration": 300}, priority=1),
                    StrategyAction("session_abandon", {}, priority=1),
                    StrategyAction("emergency_restart", {}, priority=2)
                ],
                StrategyType.ESCALATION: [
                    StrategyAction("alert_admin", {}, priority=1),
                    StrategyAction("log_all_activities", {}, priority=1),
                    StrategyAction("activate_contingency", {}, priority=2)
                ]
            }
        }

    async def analyze_detection_signals(self, signals: List[DetectionSignal]) -> ThreatLevel:
        """分析检测信号，确定威胁等级"""
        try:
            if not signals:
                return ThreatLevel.LOW

            # 计算信号统计
            recent_signals = [s for s in signals if time.time() - s.timestamp < 60]  # 最近1分钟
            high_severity_count = sum(1 for s in recent_signals if s.severity in ['high', 'critical'])
            critical_count = sum(1 for s in recent_signals if s.severity == 'critical')

            # 确定威胁等级
            if critical_count >= 3 or high_severity_count >= 5:
                return ThreatLevel.CRITICAL
            elif high_severity_count >= 2 or len(recent_signals) >= 5:
                return ThreatLevel.HIGH
            elif high_severity_count >= 1 or len(recent_signals) >= 2:
                return ThreatLevel.MEDIUM
            else:
                return ThreatLevel.LOW

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to analyze detection signals: {error}")
            return ThreatLevel.MEDIUM  # 默认中等威胁

    async def get_recovery_actions(self, detection_report) -> List[StrategyAction]:
        """获取恢复策略动作"""
        try:
            threat_level = detection_report.threat_level
            actions = []

            # 获取反应性策略
            reactive_strategies = self.strategy_library[threat_level].get(StrategyType.REACTIVE, [])
            actions.extend(reactive_strategies)

            # 获取升级策略
            escalation_strategies = self.strategy_library[threat_level].get(StrategyType.ESCALATION, [])
            actions.extend(escalation_strategies)

            # 根据具体信号调整动作
            for signal in detection_report.signals:
                signal_actions = await self._get_signal_specific_actions(signal)
                actions.extend(signal_actions)

            # 按优先级排序
            actions.sort(key=lambda x: x.priority)

            return actions

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to get recovery actions: {error}")
            return []

    async def _get_signal_specific_actions(self, signal: DetectionSignal) -> List[StrategyAction]:
        """获取信号特定的策略动作"""
        actions = []

        if signal.signal_type == "webdriver_detected":
            actions.append(StrategyAction("cleanup_webdriver", {}, priority=1))
            actions.append(StrategyAction("inject_anti_detection_script", {}, priority=1))

        elif signal.signal_type == "suspicious_user_agent":
            actions.append(StrategyAction("rotate_user_agent", {}, priority=1))
            actions.append(StrategyAction("add_realistic_headers", {}, priority=2))

        elif signal.signal_type == "automated_behavior":
            actions.append(StrategyAction("randomize_timing", {}, priority=1))
            actions.append(StrategyAction("add_human_errors", {}, priority=2))

        elif signal.signal_type == "rate_limited":
            actions.append(StrategyAction("increase_delays", {"multiplier": 2.0}, priority=1))
            actions.append(StrategyAction("reduce_frequency", {}, priority=1))

        return actions

    async def adapt_to_threat_level(self, new_threat_level: ThreatLevel):
        """自适应到新的威胁等级"""
        try:
            if new_threat_level == self.current_threat_level:
                return

            old_level = self.current_threat_level
            self.current_threat_level = new_threat_level

            # 记录策略变化
            self._record_strategy_change(old_level, new_threat_level, "threat_level_change")

            # 获取新等级的预防性策略
            preventive_strategies = self.strategy_library[new_threat_level].get(StrategyType.PREVENTIVE, [])

            # 执行预防性策略
            for action in preventive_strategies:
                await self._execute_strategy_action(action)

            if self.logger:
                self.logger.info(f"Adapted strategy to threat level: {old_level.value} -> {new_threat_level.value}")

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to adapt to threat level: {error}")

    async def _execute_strategy_action(self, action: StrategyAction):
        """执行策略动作"""
        try:
            if self.logger:
                self.logger.debug(f"Executing strategy action: {action.action_type}")

            # 记录动作执行
            self._record_action_execution(action)

            # 根据动作类型执行具体逻辑
            # 这里需要与实际的执行系统集成

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to execute strategy action {action.action_type}: {error}")

    def _record_strategy_change(self, old_level: ThreatLevel, new_level: ThreatLevel, reason: str):
        """记录策略变化"""
        self.strategy_history.append({
            'type': 'threat_level_change',
            'old_level': old_level.value,
            'new_level': new_level.value,
            'reason': reason,
            'timestamp': time.time()
        })

    def _record_action_execution(self, action: StrategyAction):
        """记录动作执行"""
        self.strategy_history.append({
            'type': 'action_execution',
            'action_type': action.action_type,
            'priority': action.priority,
            'parameters': action.parameters,
            'timestamp': time.time()
        })

    def get_current_strategy_status(self) -> Dict[str, Any]:
        """获取当前策略状态"""
        current_strategies = self.strategy_library[self.current_threat_level]

        return {
            'current_threat_level': self.current_threat_level.value,
            'active_strategies': {
                strategy_type.value: [action.action_type for action in actions]
                for strategy_type, actions in current_strategies.items()
            },
            'strategy_changes_count': len([h for h in self.strategy_history if h['type'] == 'threat_level_change']),
            'actions_executed_count': len([h for h in self.strategy_history if h['type'] == 'action_execution']),
            'recent_actions': [
                action for action in reversed(self.strategy_history[-10:])
                if action['type'] == 'action_execution'
            ]
        }

    def get_strategy_recommendations(self, signals: List[DetectionSignal]) -> List[str]:
        """获取策略建议"""
        recommendations = []

        if not signals:
            return ["当前无检测信号，维持标准预防策略"]

        # 分析信号模式
        signal_types = [s.signal_type for s in signals]
        signal_severities = [s.severity for s in signals]

        if 'webdriver_detected' in signal_types:
            recommendations.append("建议：立即清理WebDriver痕迹，注入反检测脚本")

        if 'suspicious_user_agent' in signal_types:
            recommendations.append("建议：轮换User-Agent，添加更多真实浏览器特征")

        if 'automated_behavior' in signal_types:
            recommendations.append("建议：增加操作延迟，模拟人类行为模式")

        if 'rate_limited' in signal_types:
            recommendations.append("建议：降低操作频率，增加随机延迟")

        if 'critical' in signal_severities:
            recommendations.append("警告：检测到严重威胁，建议立即停止并重新评估策略")

        return recommendations

    async def learn_from_patterns(self, successful_interactions: List[Dict], failed_interactions: List[Dict]):
        """从交互模式中学习"""
        try:
            if not self.learning_enabled:
                return

            # 分析成功和失败的模式差异
            success_patterns = self._extract_patterns(successful_interactions)
            failure_patterns = self._extract_patterns(failed_interactions)

            # 调整策略参数
            await self._adjust_strategy_parameters(success_patterns, failure_patterns)

            if self.logger:
                self.logger.info("Strategy learning completed")

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to learn from patterns: {error}")

    def _extract_patterns(self, interactions: List[Dict]) -> Dict[str, Any]:
        """提取交互模式"""
        if not interactions:
            return {}

        patterns = {
            'avg_delay': 0,
            'avg_speed': 0,
            'error_rate': 0,
            'signal_types': {},
            'time_patterns': []
        }

        total_delay = 0
        total_speed = 0
        total_errors = 0

        for interaction in interactions:
            total_delay += interaction.get('delay', 0)
            total_speed += interaction.get('speed', 0)
            total_errors += 1 if interaction.get('has_error', False) else 0

            # 统计信号类型
            for signal in interaction.get('signals', []):
                signal_type = signal.get('type')
                patterns['signal_types'][signal_type] = patterns['signal_types'].get(signal_type, 0) + 1

        if interactions:
            patterns['avg_delay'] = total_delay / len(interactions)
            patterns['avg_speed'] = total_speed / len(interactions)
            patterns['error_rate'] = total_errors / len(interactions)

        return patterns

    async def _adjust_strategy_parameters(self, success_patterns: Dict, failure_patterns: Dict):
        """调整策略参数"""
        try:
            # 基于失败模式增加保守性
            if failure_patterns.get('error_rate', 0) > success_patterns.get('error_rate', 0):
                self.adaptation_rate *= 0.9  # 降低适应性变化率

            # 基于延迟模式调整
            if failure_patterns.get('avg_delay', 0) < success_patterns.get('avg_delay', 0):
                # 失败时延迟较短，需要增加延迟
                for strategies in self.strategy_library.values():
                    for strategy_actions in strategies.values():
                        for action in strategy_actions:
                            if action.action_type == "random_delays":
                                current_min = action.parameters.get('min', 0.1)
                                current_max = action.parameters.get('max', 0.5)
                                action.parameters['min'] = current_min * 1.2
                                action.parameters['max'] = current_max * 1.2

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to adjust strategy parameters: {error}")


# 添加时间模块导入
import time
"""
生物特征模拟器
模拟打字节奏、键盘模式、操作习惯等生物特征
"""

import asyncio
import random
import time
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

from .strategy import ThreatLevel


class TypingPattern(Enum):
    """打字模式"""
    HUNT_AND_PECK = "hunt_and_peck"      # 两指找键
    TOUCH_TYPING = "touch_typing"         # 触摸打字
    HYBRID = "hybrid"                      # 混合模式
    THUMB_TYPING = "thumb_typing"          # 拇指打字（移动端）


class HandPreference(Enum):
    """手部偏好"""
    RIGHT_HANDED = "right_handed"
    LEFT_HANDED = "left_handed"
    AMBIDEXTROUS = "ambidextrous"


@dataclass
class KeystrokeProfile:
    """击键特征"""
    character: str
    press_duration: float  # 按键持续时间
    release_delay: float   # 释放延迟
    next_key_delay: float  # 到下一个键的延迟
    pressure_level: int    # 按键力度（模拟）


class BiometricSimulator:
    """生物特征模拟器"""

    def __init__(self, config):
        self.config = config
        self.logger = None
        self.browser_session = None

        # 生物特征参数
        self.typing_pattern = random.choice(list(TypingPattern))
        self.hand_preference = random.choice(list(HandPreference))
        self.typing_speed_base = 100  # 字符/分钟
        self.speed_variance = 0.3
        self.error_rate = 0.02  # 打字错误率
        self.correction_delay = (0.3, 0.8)  # 纠正延迟

        # 节奏参数
        self.rhythm_patterns = {
            TypingPattern.HUNT_AND_PECK: {
                'base_speed': (60, 80),      # 慢速
                'variance': 0.5,             # 高变化性
                'pause_frequency': 0.3,      # 频繁暂停
                'look_away_rate': 0.1        # 看键盘频率
            },
            TypingPattern.TOUCH_TYPING: {
                'base_speed': (90, 120),     # 快速
                'variance': 0.2,             # 低变化性
                'pause_frequency': 0.1,      # 较少暂停
                'look_away_rate': 0.02       # 很少看键盘
            },
            TypingPattern.HYBRID: {
                'base_speed': (70, 100),     # 中速
                'variance': 0.3,             # 中等变化性
                'pause_frequency': 0.15,     # 中等暂停
                'look_away_rate': 0.05       # 偶尔看键盘
            },
            TypingPattern.THUMB_TYPING: {
                'base_speed': (40, 70),      # 较慢（移动端）
                'variance': 0.4,             # 高变化性
                'pause_frequency': 0.25,     # 频繁暂停
                'look_away_rate': 0.15       # 经常看屏幕
            }
        }

        # 手指力量特征
        self.finger_strength_map = self._generate_finger_strength_map()

        # 打字历史
        self.typing_history: List[Dict[str, Any]] = []

    async def initialize(self, browser_session):
        """初始化生物特征模拟器"""
        self.browser_session = browser_session
        await self._randomize_biometric_parameters()

    def _generate_finger_strength_map(self) -> Dict[str, float]:
        """生成手指力量映射"""
        strength_map = {}

        # 基础力量（0.1-1.0）
        if self.hand_preference == HandPreference.RIGHT_HANDED:
            # 右手更强
            strength_map.update({
                'q': 0.6, 'w': 0.7, 'e': 0.8, 'r': 0.8, 't': 0.7,
                'a': 0.7, 's': 0.8, 'd': 0.9, 'f': 0.9, 'g': 0.8,
                'z': 0.5, 'x': 0.6, 'c': 0.7, 'v': 0.7, 'b': 0.6
            })
            strength_map.update({
                'y': 0.9, 'u': 0.9, 'i': 0.8, 'o': 0.8, 'p': 0.7,
                'h': 0.9, 'j': 1.0, 'k': 0.9, 'l': 0.8,
                'n': 0.8, 'm': 0.7
            })
        elif self.hand_preference == HandPreference.LEFT_HANDED:
            # 左手更强
            strength_map.update({
                'q': 0.9, 'w': 0.9, 'e': 0.8, 'r': 0.8, 't': 0.7,
                'a': 0.9, 's': 1.0, 'd': 0.9, 'f': 0.9, 'g': 0.8,
                'z': 0.8, 'x': 0.8, 'c': 0.7, 'v': 0.7, 'b': 0.6
            })
            strength_map.update({
                'y': 0.7, 'u': 0.7, 'i': 0.6, 'o': 0.6, 'p': 0.5,
                'h': 0.7, 'j': 0.7, 'k': 0.6, 'l': 0.6,
                'n': 0.6, 'm': 0.5
            })
        else:  # AMBIDEXTROUS
            # 均衡力量
            for char in 'qwertyuiopasdfghjklzxcvbnm':
                strength_map[char] = random.uniform(0.6, 0.9)

        return strength_map

    async def _randomize_biometric_parameters(self):
        """随机化生物特征参数"""
        # 重新选择打字模式（有一定概率保持当前模式）
        if random.random() < 0.3:  # 30% 概率改变模式
            self.typing_pattern = random.choice(list(TypingPattern))

        # 更新速度参数
        pattern_config = self.rhythm_patterns[self.typing_pattern]
        speed_range = pattern_config['base_speed']
        self.typing_speed_base = random.randint(*speed_range)
        self.speed_variance = pattern_config['variance']

        # 更新其他参数
        self.error_rate = random.uniform(0.01, 0.05)
        self.correction_delay = (
            random.uniform(0.2, 0.6),
            random.uniform(0.5, 1.2)
        )

        # 重新生成手指力量映射
        self.finger_strength_map = self._generate_finger_strength_map()

    async def simulate_typing(self, selector: str, text: str, **kwargs) -> bool:
        """模拟具有生物特征的打字"""
        try:
            element = await self.browser_session.query_selector(selector)
            if not element:
                return False

            # 先点击输入框
            await element.click()

            # 预处理文本（根据打字模式调整）
            processed_text = self._preprocess_text(text)

            # 逐字符输入
            for i, char in enumerate(processed_text):
                keystroke_profile = await self._generate_keystroke_profile(char, i)
                await self._execute_keystroke(element, keystroke_profile)

                # 模拟看键盘行为
                await self._simulate_look_away_behavior(i, len(processed_text))

                # 模拟思考暂停
                await self._simulate_thinking_pause(i, len(processed_text))

            # 记录打字行为
            self._record_typing_behavior(selector, text)

            return True

        except Exception as error:
            if self.logger:
                self.logger.error(f"Biometric typing simulation failed: {error}")
            return False

    def _preprocess_text(self, text: str) -> str:
        """根据打字模式预处理文本"""
        if self.typing_pattern == TypingPattern.HUNT_AND_PECK:
            # 两指打字模式：大小写可能不准确
            processed = []
            for char in text:
                if char.isalpha() and random.random() < 0.05:  # 5% 概率大小写错误
                    processed.append(char.swapcase())
                else:
                    processed.append(char)
            return ''.join(processed)
        else:
            return text

    async def _generate_keystroke_profile(self, char: str, position: int) -> KeystrokeProfile:
        """生成击键特征"""
        # 基础延迟（基于速度）
        base_delay = 60.0 / self.typing_speed_base

        # 应用变化性
        variance = random.uniform(-self.speed_variance, self.speed_variance)
        delay = max(0.05, base_delay * (1 + variance))

        # 字符特定延迟
        char_lower = char.lower()
        if char_lower in self.finger_strength_map:
            strength_factor = 1.0 / self.finger_strength_map[char_lower]
            delay *= strength_factor

        # 位置特定延迟
        if position == 0:  # 首字符通常较慢
            delay *= random.uniform(1.2, 1.8)
        elif char in ' .!?,;:':  # 标点符号后通常有停顿
            delay *= random.uniform(1.5, 2.5)

        # 按键持续时间
        press_duration = random.uniform(0.05, 0.15)

        # 释放延迟
        release_delay = random.uniform(0.02, 0.08)

        # 压力级别（模拟）
        pressure_level = int(self.finger_strength_map.get(char_lower, 0.7) * 10)

        return KeystrokeProfile(
            character=char,
            press_duration=press_duration,
            release_delay=release_delay,
            next_key_delay=delay,
            pressure_level=pressure_level
        )

    async def _execute_keystroke(self, element, profile: KeystrokeProfile):
        """执行单个击键"""
        try:
            # 模拟按键按下
            await element.press(profile.character, delay=profile.press_duration)

            # 等待释放
            await asyncio.sleep(profile.release_delay)

            # 等待到下一个键
            await asyncio.sleep(profile.next_key_delay)

            # 模拟打字错误
            if random.random() < self.error_rate:
                await self._simulate_typing_error(element, profile.character)

        except Exception as error:
            if self.logger:
                self.logger.error(f"Keystroke execution failed: {error}")

    async def _simulate_typing_error(self, element, correct_char: str):
        """模拟打字错误和纠正"""
        try:
            # 生成一个相似的错误字符
            if correct_char.isalpha():
                # 字母错误
                wrong_char = chr(ord(correct_char) + random.choice([-1, 1]))
                if not wrong_char.isalpha():
                    wrong_char = random.choice('abcdefghijklmnopqrstuvwxyz')
            else:
                # 其他字符错误
                wrong_chars = list('`~!@#$%^&*()_+-=[]{}|;:",.<>?/')
                wrong_char = random.choice(wrong_chars)

            # 输入错误字符
            await element.type(wrong_char)
            await asyncio.sleep(random.uniform(0.1, 0.3))

            # 发现错误并删除
            await asyncio.sleep(random.uniform(0.2, 0.6))  # 意识到错误的延迟
            await element.press('Backspace')
            await asyncio.sleep(random.uniform(*self.correction_delay))

            # 输入正确字符
            await element.type(correct_char)

        except Exception as error:
            if self.logger:
                self.logger.error(f"Typing error simulation failed: {error}")

    async def _simulate_look_away_behavior(self, position: int, total_length: int):
        """模拟看键盘的行为"""
        pattern_config = self.rhythm_patterns[self.typing_pattern]
        look_away_rate = pattern_config['look_away_rate']

        if random.random() < look_away_rate:
            # 模拟看键盘的延迟
            look_away_duration = random.uniform(0.3, 1.0)
            await asyncio.sleep(look_away_duration)

    async def _simulate_thinking_pause(self, position: int, total_length: int):
        """模拟思考暂停"""
        pattern_config = self.rhythm_patterns[self.typing_pattern]
        pause_frequency = pattern_config['pause_frequency']

        if random.random() < pause_frequency:
            # 思考暂停
            pause_duration = random.uniform(0.5, 2.0)
            await asyncio.sleep(pause_duration)

    def _record_typing_behavior(self, selector: str, text: str):
        """记录打字行为"""
        self.typing_history.append({
            'selector': selector,
            'text_length': len(text),
            'pattern': self.typing_pattern.value,
            'speed': self.typing_speed_base,
            'hand_preference': self.hand_preference.value,
            'timestamp': time.time()
        })

        # 限制历史记录
        if len(self.typing_history) > 100:
            self.typing_history = self.typing_history[-50:]

    async def adapt_to_threat_level(self, threat_level: ThreatLevel):
        """根据威胁等级调整生物特征"""
        try:
            if threat_level == ThreatLevel.HIGH:
                # 高威胁：增加自然性，减少规律性
                self.error_rate = random.uniform(0.03, 0.08)
                self.speed_variance = random.uniform(0.4, 0.7)
                self.correction_delay = (0.4, 1.5)

                # 可能切换到更自然的打字模式
                if self.typing_pattern == TypingPattern.TOUCH_TYPING:
                    self.typing_pattern = TypingPattern.HYBRID

            elif threat_level == ThreatLevel.MEDIUM:
                # 中等威胁：适度调整
                self.error_rate = random.uniform(0.02, 0.05)
                self.speed_variance = random.uniform(0.3, 0.5)
                self.correction_delay = (0.3, 1.0)

            else:  # LOW
                # 低威胁：保持相对准确但仍有变化
                self.error_rate = random.uniform(0.01, 0.03)
                self.speed_variance = random.uniform(0.2, 0.4)
                self.correction_delay = (0.2, 0.8)

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to adapt biometrics to threat level: {error}")

    def get_biometric_profile(self) -> Dict[str, Any]:
        """获取生物特征档案"""
        if not self.typing_history:
            return self._get_initial_profile()

        # 分析最近的打字行为
        recent_behaviors = self.typing_history[-20:]

        avg_speed = sum(b['speed'] for b in recent_behaviors) / len(recent_behaviors)
        avg_text_length = sum(b['text_length'] for b in recent_behaviors) / len(recent_behaviors)

        pattern_counts = {}
        for behavior in recent_behaviors:
            pattern = behavior['pattern']
            pattern_counts[pattern] = pattern_counts.get(pattern, 0) + 1

        dominant_pattern = max(pattern_counts.keys(), key=pattern_counts.get)

        return {
            'typing_pattern': dominant_pattern,
            'hand_preference': self.hand_preference.value,
            'average_speed': avg_speed,
            'average_text_length': avg_text_length,
            'error_rate': self.error_rate,
            'speed_variance': self.speed_variance,
            'pattern_distribution': pattern_counts,
            'sample_size': len(recent_behaviors)
        }

    def _get_initial_profile(self) -> Dict[str, Any]:
        """获取初始生物特征档案"""
        return {
            'typing_pattern': self.typing_pattern.value,
            'hand_preference': self.hand_preference.value,
            'average_speed': self.typing_speed_base,
            'average_text_length': 0,
            'error_rate': self.error_rate,
            'speed_variance': self.speed_variance,
            'pattern_distribution': {},
            'sample_size': 0
        }

    async def cleanup(self):
        """清理资源"""
        self.typing_history.clear()
        self.browser_session = None
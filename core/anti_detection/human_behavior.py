"""
人类行为模拟器
模拟鼠标移动、点击、滚动等人类行为特征
"""

import asyncio
import random
import math
import time
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

from .strategy import ThreatLevel


class BehaviorType(Enum):
    """行为类型"""
    CLICK = "click"
    HOVER = "hover"
    SCROLL = "scroll"
    DRAG = "drag"
    TYPE = "type"
    NAVIGATE = "navigate"


@dataclass
class MouseTrajectoryPoint:
    """鼠标轨迹点"""
    x: float
    y: float
    timestamp: float
    velocity: float = 0.0


class HumanBehaviorSimulator:
    """人类行为模拟器"""

    def __init__(self, config):
        self.config = config
        self.logger = None
        self.browser_session = None
        self.behavior_history: List[Dict[str, Any]] = []

        # 行为参数
        self.typing_speed = 100  # 字符/分钟
        self.typing_variance = 0.3
        self.mouse_speed_base = 200  # 像素/秒
        self.mouse_variance = 0.4
        self.pause_probability = 0.15
        self.pause_duration = (0.5, 2.0)

        # 贝塞尔曲线参数
        self.curve_intensity = 0.3
        self.deviation_range = 50

    async def initialize(self, browser_session):
        """初始化模拟器"""
        self.browser_session = browser_session

        # 初始化人类行为参数
        await self._randomize_behavior_parameters()

    async def _randomize_behavior_parameters(self):
        """随机化行为参数"""
        self.typing_speed = random.randint(80, 120)  # 80-120 字符/分钟
        self.typing_variance = random.uniform(0.2, 0.5)
        self.mouse_speed_base = random.randint(150, 300)  # 150-300 像素/秒
        self.mouse_variance = random.uniform(0.3, 0.6)
        self.curve_intensity = random.uniform(0.2, 0.5)
        self.deviation_range = random.randint(20, 80)

    async def simulate_click(self, selector: str, **kwargs) -> bool:
        """模拟点击行为"""
        try:
            # 使用locator而不是固定element handles
            element_locator = self.browser_session.locator(selector).first
            if await element_locator.count() == 0:
                return False

            # 获取元素位置
            element = await element_locator.element_handle()
            box = await element.bounding_box()
            if not box:
                return False

            # 获取当前鼠标位置
            current_pos = await self._get_current_mouse_position()

            # 生成鼠标轨迹
            trajectory = self._generate_mouse_trajectory(
                current_pos['x'], current_pos['y'],
                box['x'] + box['width'] / 2,
                box['y'] + box['height'] / 2
            )

            # 执行鼠标移动
            await self._execute_mouse_movement(trajectory)

            # 添加随机延迟
            if hasattr(self.config, 'click_delay_range') and self.config.click_delay_range:
                await self._random_delay(*self.config.click_delay_range)
            else:
                await self._random_delay(0.2, 0.8)

            # 执行点击
            await element_locator.click()

            # 记录行为
            self._record_behavior(BehaviorType.CLICK, {
                'selector': selector,
                'position': {'x': box['x'], 'y': box['y']},
                'trajectory_length': len(trajectory)
            })

            return True

        except Exception as error:
            if self.logger:
                self.logger.error(f"Click simulation failed: {error}")
            return False

    async def simulate_typing(self, selector: str, text: str, **kwargs) -> bool:
        """模拟打字行为"""
        try:
            # 使用locator而不是固定element handles
            element_locator = self.browser_session.locator(selector).first
            if await element_locator.count() == 0:
                return False

            # 先点击输入框获得焦点
            if not await self.simulate_click(selector):
                return False

            # 清空现有内容（如果配置要求）
            if kwargs.get('clear_first', False):
                await element_locator.fill('')

            # 逐字符输入
            for i, char in enumerate(text):
                # 添加打字延迟
                base_delay = 60.0 / self.typing_speed  # 每个字符的基础延迟（秒）
                variance = random.uniform(-self.typing_variance, self.typing_variance)
                delay = max(0.05, base_delay * (1 + variance))

                await asyncio.sleep(delay)

                # 模拟打字错误和修正
                if random.random() < 0.02:  # 2% 概率打错字
                    wrong_char = chr(ord(char) + random.randint(-5, 5))
                    if wrong_char.isprintable():
                        await element_locator.type(wrong_char)
                        await asyncio.sleep(random.uniform(0.1, 0.3))
                        await element_locator.press('Backspace')
                        await asyncio.sleep(random.uniform(0.1, 0.2))

                # 输入正确字符
                await element_locator.type(char)

                # 随机暂停（思考时间）
                if random.random() < self.pause_probability and i < len(text) - 1:
                    pause_time = random.uniform(*self.pause_duration)
                    await asyncio.sleep(pause_time)

            # 记录行为
            self._record_behavior(BehaviorType.TYPE, {
                'selector': selector,
                'text_length': len(text),
                'typing_speed': self.typing_speed
            })

            return True

        except Exception as error:
            if self.logger:
                self.logger.error(f"Typing simulation failed: {error}")
            return False

    async def simulate_mouse_movement(self, target_selector: str, **kwargs) -> bool:
        """模拟鼠标移动"""
        try:
            # 使用locator而不是固定element handles
            element_locator = self.browser_session.locator(target_selector).first
            if await element_locator.count() == 0:
                return False

            # 获取元素位置
            element = await element_locator.element_handle()
            box = await element.bounding_box()
            if not box:
                return False

            # 获取当前鼠标位置
            current_pos = await self._get_current_mouse_position()

            # 生成移动轨迹
            trajectory = self._generate_mouse_trajectory(
                current_pos['x'], current_pos['y'],
                box['x'] + box['width'] / 2,
                box['y'] + box['height'] / 2
            )

            # 执行移动
            await self._execute_mouse_movement(trajectory)

            # 记录行为
            self._record_behavior(BehaviorType.HOVER, {
                'target': target_selector,
                'position': {'x': box['x'], 'y': box['y']},
                'trajectory_length': len(trajectory)
            })

            return True

        except Exception as error:
            if self.logger:
                self.logger.error(f"Mouse movement simulation failed: {error}")
            return False

    async def simulate_scroll(self, direction: str = 'down', distance: int = None, **kwargs) -> bool:
        """模拟滚动行为"""
        try:
            if distance is None:
                distance = random.randint(100, 500)

            # 生成滚动轨迹
            scroll_steps = []
            remaining_distance = distance
            step_count = random.randint(3, 8)

            for i in range(step_count):
                if i == step_count - 1:
                    # 最后一步滚动剩余距离
                    step_distance = remaining_distance
                else:
                    # 生成不均匀的滚动步长
                    step_distance = remaining_distance / (step_count - i)
                    step_distance *= random.uniform(0.5, 1.5)
                    remaining_distance -= step_distance

                scroll_steps.append(int(step_distance))

                # 随机延迟
                await self._random_delay(0.1, 0.5)

            # 执行滚动
            for step in scroll_steps:
                if direction == 'down':
                    await self.browser_session.evaluate(f"window.scrollBy(0, {step})")
                elif direction == 'up':
                    await self.browser_session.evaluate(f"window.scrollBy(0, -{step})")
                elif direction == 'left':
                    await self.browser_session.evaluate(f"window.scrollBy({-step}, 0)")
                elif direction == 'right':
                    await self.browser_session.evaluate(f"window.scrollBy({step}, 0)")

            # 记录行为
            self._record_behavior(BehaviorType.SCROLL, {
                'direction': direction,
                'distance': distance,
                'steps': len(scroll_steps)
            })

            return True

        except Exception as error:
            if self.logger:
                self.logger.error(f"Scroll simulation failed: {error}")
            return False

    async def _get_current_mouse_position(self) -> Dict[str, float]:
        """获取当前鼠标位置"""
        try:
            result = await self.browser_session.evaluate("""
                () => {
                    return {
                        x: window.mouseX || 0,
                        y: window.mouseY || 0
                    };
                }
            """)
            return result
        except:
            # 如果无法获取，返回屏幕中心
            return {'x': 400, 'y': 300}

    def _generate_mouse_trajectory(self, start_x: float, start_y: float,
                                   end_x: float, end_y: float) -> List[MouseTrajectoryPoint]:
        """生成鼠标轨迹（贝塞尔曲线）"""
        trajectory = []
        distance = math.sqrt((end_x - start_x) ** 2 + (end_y - start_y) ** 2)

        # 根据距离计算轨迹点数量
        num_points = max(5, int(distance / 20))

        # 生成控制点（贝塞尔曲线）
        control_offset = distance * self.curve_intensity
        control_x1 = start_x + random.uniform(-control_offset, control_offset)
        control_y1 = start_y + random.uniform(-control_offset, control_offset)
        control_x2 = end_x + random.uniform(-control_offset, control_offset)
        control_y2 = end_y + random.uniform(-control_offset, control_offset)

        for i in range(num_points + 1):
            t = i / num_points

            # 贝塞尔曲线计算
            x = (1-t)**3 * start_x + 3*(1-t)**2*t * control_x1 + \
                3*(1-t)*t**2 * control_x2 + t**3 * end_x
            y = (1-t)**3 * start_y + 3*(1-t)**2*t * control_y1 + \
                3*(1-t)*t**2 * control_y2 + t**3 * end_y

            # 添加随机偏差
            x += random.uniform(-self.deviation_range, self.deviation_range)
            y += random.uniform(-self.deviation_range, self.deviation_range)

            # 计算速度（基于相邻点）
            if i > 0:
                prev_point = trajectory[-1]
                dist = math.sqrt((x - prev_point.x) ** 2 + (y - prev_point.y) ** 2)
                velocity = dist * 60  # 像素/分钟
            else:
                velocity = self.mouse_speed_base

            trajectory.append(MouseTrajectoryPoint(x, y, time.time(), velocity))

        return trajectory

    async def _execute_mouse_movement(self, trajectory: List[MouseTrajectoryPoint]):
        """执行鼠标移动轨迹"""
        try:
            for i, point in enumerate(trajectory):
                if i == 0:
                    continue  # 跳过起始点

                # 执行鼠标移动
                await self.browser_session.evaluate(f"""
                    () => {{
                        const event = new MouseEvent('mousemove', {{
                            clientX: {point.x},
                            clientY: {point.y},
                            bubbles: true
                        }});
                        document.dispatchEvent(event);
                        window.mouseX = {point.x};
                        window.mouseY = {point.y};
                    }}
                """)

                # 根据速度计算延迟
                if i < len(trajectory) - 1:
                    next_point = trajectory[i + 1]
                    distance = math.sqrt(
                        (next_point.x - point.x) ** 2 +
                        (next_point.y - point.y) ** 2
                    )
                    delay = distance / point.velocity if point.velocity > 0 else 0.01
                    delay *= random.uniform(0.8, 1.2)  # 添加变化
                    await asyncio.sleep(max(0.005, min(0.1, delay)))

        except Exception as error:
            if self.logger:
                self.logger.error(f"Mouse trajectory execution failed: {error}")

    async def _random_delay(self, min_delay: float, max_delay: float):
        """随机延迟"""
        delay = random.uniform(min_delay, max_delay)
        await asyncio.sleep(delay)

    def _record_behavior(self, behavior_type: BehaviorType, details: Dict[str, Any]):
        """记录行为历史"""
        self.behavior_history.append({
            'type': behavior_type.value,
            'details': details,
            'timestamp': asyncio.get_event_loop().time()
        })

        # 限制历史记录数量
        if len(self.behavior_history) > 1000:
            self.behavior_history = self.behavior_history[-500:]

    async def adapt_to_threat_level(self, threat_level: ThreatLevel):
        """根据威胁等级调整行为参数"""
        try:
            if threat_level == ThreatLevel.HIGH:
                # 高威胁：增加随机性，降低速度
                self.typing_speed = random.randint(60, 90)
                self.mouse_speed_base = random.randint(100, 180)
                self.typing_variance = random.uniform(0.4, 0.7)
                self.pause_probability = 0.25
                self.curve_intensity = random.uniform(0.4, 0.7)

            elif threat_level == ThreatLevel.MEDIUM:
                # 中等威胁：适度调整
                self.typing_speed = random.randint(80, 110)
                self.mouse_speed_base = random.randint(130, 220)
                self.typing_variance = random.uniform(0.3, 0.5)
                self.pause_probability = 0.18
                self.curve_intensity = random.uniform(0.3, 0.5)

            else:  # LOW
                # 低威胁：轻微调整
                self.typing_speed = random.randint(90, 120)
                self.mouse_speed_base = random.randint(170, 280)
                self.typing_variance = random.uniform(0.2, 0.4)
                self.pause_probability = 0.12
                self.curve_intensity = random.uniform(0.2, 0.4)

        except Exception as error:
            if self.logger:
                self.logger.error(f"Failed to adapt behavior to threat level: {error}")

    async def randomize_parameters(self):
        """重新随机化行为参数"""
        await self._randomize_behavior_parameters()

    def get_behavior_stats(self) -> Dict[str, Any]:
        """获取行为统计"""
        if not self.behavior_history:
            return {}

        recent_behaviors = self.behavior_history[-100:]  # 最近100个行为

        type_counts = {}
        for behavior in recent_behaviors:
            behavior_type = behavior['type']
            type_counts[behavior_type] = type_counts.get(behavior_type, 0) + 1

        return {
            'total_behaviors': len(self.behavior_history),
            'recent_behaviors': len(recent_behaviors),
            'behavior_distribution': type_counts,
            'current_parameters': {
                'typing_speed': self.typing_speed,
                'mouse_speed_base': self.mouse_speed_base,
                'typing_variance': self.typing_variance,
                'pause_probability': self.pause_probability,
                'curve_intensity': self.curve_intensity
            }
        }

    async def cleanup(self):
        """清理资源"""
        self.behavior_history.clear()
        self.browser_session = None
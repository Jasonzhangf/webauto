"""
浏览器指纹管理和风控处理模块
提供自动指纹更新和风控规避功能
"""

import json
import time
import random
import hashlib
from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime

class FingerprintManager:
    """浏览器指纹管理器"""
    
    def __init__(self, fingerprint_dir: str = "./fingerprints"):
        self.fingerprint_dir = Path(fingerprint_dir)
        self.fingerprint_dir.mkdir(parents=True, exist_ok=True)
        
        # 指纹配置文件
        self.config_file = self.fingerprint_dir / "fingerprint_config.json"
        self.profiles_file = self.fingerprint_dir / "profiles.json"
        
        # 默认指纹配置
        self.default_config = {
            "auto_update": True,
            "update_interval": 3600,  # 1小时
            "anti_detection_level": "enhanced",
            "randomize_on_create": True,
            "preserve_session": True
        }
        
        # 浏览器指纹特征池
        self.user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0"
        ]
        
        self.languages = [
            ["zh-CN", "zh", "en-US", "en"],
            ["zh-CN", "zh"],
            ["zh-CN", "zh", "en-US", "en", "ja-JP", "ja"],
            ["en-US", "en", "zh-CN", "zh"]
        ]
        
        self.platforms = ["Win32", "MacIntel", "Linux x86_64"]
        self.hardware_concurrency = [4, 8, 16, 32]
        self.device_memory = [4, 8, 16, 32]
        
        # 屏幕分辨率池
        self.screen_resolutions = [
            {"width": 1920, "height": 1080},
            {"width": 1366, "height": 768},
            {"width": 1440, "height": 900},
            {"width": 1536, "height": 864},
            {"width": 2560, "height": 1440},
            {"width": 1680, "height": 1050}
        ]
        
        # 时区池
        self.timezones = [
            "Asia/Shanghai",
            "Asia/Chongqing",
            "Asia/Harbin",
            "Asia/Urumqi",
            "Asia/Hong_Kong",
            "Asia/Taipei"
        ]
    
    def generate_fingerprint(self, profile_id: str = "default", anti_detection_level: str = "enhanced") -> Dict[str, Any]:
        """生成浏览器指纹"""
        try:
            # 基于profile_id生成确定性但随机的指纹
            seed = hashlib.md5(f"{profile_id}_{int(time.time() / 3600)}".encode()).hexdigest()
            
            # 选择基础特征
            ua_index = int(seed[0:2], 16) % len(self.user_agents)
            lang_index = int(seed[2:4], 16) % len(self.languages)
            platform_index = int(seed[4:6], 16) % len(self.platforms)
            hw_index = int(seed[6:8], 16) % len(self.hardware_concurrency)
            mem_index = int(seed[8:10], 16) % len(self.device_memory)
            screen_index = int(seed[10:12], 16) % len(self.screen_resolutions)
            tz_index = int(seed[12:14], 16) % len(self.timezones)
            
            fingerprint = {
                "profile_id": profile_id,
                "user_agent": self.user_agents[ua_index],
                "languages": self.languages[lang_index],
                "platform": self.platforms[platform_index],
                "hardware_concurrency": self.hardware_concurrency[hw_index],
                "device_memory": self.device_memory[mem_index],
                "screen": self.screen_resolutions[screen_index].copy(),
                "timezone": self.timezones[tz_index],
                "created_at": datetime.now().isoformat(),
                "anti_detection_level": anti_detection_level,
                "version": "1.0"
            }
            
            # 根据反检测级别添加额外特征
            if anti_detection_level in ["enhanced", "maximum"]:
                fingerprint.update(self._generate_enhanced_features(seed))
            
            if anti_detection_level == "maximum":
                fingerprint.update(self._generate_maximum_features(seed))
            
            return fingerprint
            
        except Exception as e:
            print(f"生成指纹失败: {e}")
            return self._get_fallback_fingerprint(profile_id)
    
    def _generate_enhanced_features(self, seed: str) -> Dict[str, Any]:
        """生成增强特征"""
        return {
            "canvas_fingerprint": self._generate_canvas_fingerprint(seed),
            "webgl_fingerprint": self._generate_webgl_fingerprint(seed),
            "audio_fingerprint": self._generate_audio_fingerprint(seed),
            "fonts": self._generate_font_list(seed),
            "plugins": self._generate_plugin_list(seed),
            "webdriver_disabled": True,
            "chrome_runtime_disabled": True
        }
    
    def _generate_maximum_features(self, seed: str) -> Dict[str, Any]:
        """生成最高级别特征"""
        return {
            "random_mouse_movement": True,
            "scroll_jitter": True,
            "typing_delay": True,
            "viewport_randomization": True,
            "user_agent_rotation": True,
            "fingerprint_spoofing": True,
            "bot_mitigation": True
        }
    
    def _generate_canvas_fingerprint(self, seed: str) -> str:
        """生成Canvas指纹"""
        # 基于种子生成稳定的Canvas指纹
        import hashlib
        canvas_data = f"canvas_{seed}_webauto"
        return hashlib.md5(canvas_data.encode()).hexdigest()[:16]
    
    def _generate_webgl_fingerprint(self, seed: str) -> str:
        """生成WebGL指纹"""
        webgl_data = f"webgl_{seed}_browser"
        return hashlib.md5(webgl_data.encode()).hexdigest()[:16]
    
    def _generate_audio_fingerprint(self, seed: str) -> str:
        """生成音频指纹"""
        audio_data = f"audio_{seed}_fingerprint"
        return hashlib.md5(audio_data.encode()).hexdigest()[:16]
    
    def _generate_font_list(self, seed: str) -> List[str]:
        """生成字体列表"""
        base_fonts = [
            "Arial", "Helvetica", "Times New Roman", "Courier New",
            "Verdana", "Georgia", "Palatino", "Garamond", "Bookman",
            "Comic Sans MS", "Trebuchet MS", "Arial Black", "Impact"
        ]
        
        # 基于种子选择字体子集
        seed_int = int(seed[0:8], 16)
        selected_fonts = []
        for i, font in enumerate(base_fonts):
            if (seed_int >> (i % 8)) & 1:
                selected_fonts.append(font)
        
        return selected_fonts[:8]  # 最多8个字体
    
    def _generate_plugin_list(self, seed: str) -> List[Dict[str, Any]]:
        """生成插件列表"""
        base_plugins = [
            {"name": "PDF Viewer", "filename": "internal-pdf-viewer"},
            {"name": "Chrome PDF Viewer", "filename": "mhjfbmdgcfjbbpaeojofohoefgiehjai"},
            {"name": "Chrome PDF Viewer", "filename": "internal-pdf-viewer"},
            {"name": "Native Client", "filename": "internal-nacl-plugin"}
        ]
        
        # 基于种子选择插件
        seed_int = int(seed[8:16], 16)
        selected_plugins = []
        for i, plugin in enumerate(base_plugins):
            if (seed_int >> (i % 8)) & 1:
                selected_plugins.append(plugin)
        
        return selected_plugins
    
    def _get_fallback_fingerprint(self, profile_id: str) -> Dict[str, Any]:
        """获取备用指纹"""
        return {
            "profile_id": profile_id,
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "languages": ["zh-CN", "zh", "en-US", "en"],
            "platform": "Win32",
            "hardware_concurrency": 8,
            "device_memory": 8,
            "screen": {"width": 1920, "height": 1080},
            "timezone": "Asia/Shanghai",
            "created_at": datetime.now().isoformat(),
            "anti_detection_level": "basic",
            "version": "1.0"
        }
    
    def update_fingerprint(self, profile_id: str, anti_detection_level: str = "enhanced") -> Dict[str, Any]:
        """更新指纹（自动处理）"""
        try:
            # 生成新指纹
            new_fingerprint = self.generate_fingerprint(profile_id, anti_detection_level)
            
            # 保存指纹历史
            self._save_fingerprint_history(profile_id, new_fingerprint)
            
            # 保存当前指纹
            self._save_current_fingerprint(profile_id, new_fingerprint)
            
            return {
                "success": True,
                "fingerprint": new_fingerprint,
                "message": "指纹更新成功"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "指纹更新失败"
            }
    
    def _save_fingerprint_history(self, profile_id: str, fingerprint: Dict[str, Any]):
        """保存指纹历史"""
        try:
            history_file = self.fingerprint_dir / f"{profile_id}_history.json"
            
            # 读取现有历史
            history = []
            if history_file.exists():
                with open(history_file, 'r', encoding='utf-8') as f:
                    history = json.load(f)
            
            # 添加新指纹
            history.append({
                "timestamp": datetime.now().isoformat(),
                "fingerprint": fingerprint
            })
            
            # 保留最近10个指纹
            if len(history) > 10:
                history = history[-10:]
            
            # 保存历史
            with open(history_file, 'w', encoding='utf-8') as f:
                json.dump(history, f, ensure_ascii=False, indent=2)
                
        except Exception as e:
            print(f"保存指纹历史失败: {e}")
    
    def _save_current_fingerprint(self, profile_id: str, fingerprint: Dict[str, Any]):
        """保存当前指纹"""
        try:
            current_file = self.fingerprint_dir / f"{profile_id}_current.json"
            
            with open(current_file, 'w', encoding='utf-8') as f:
                json.dump(fingerprint, f, ensure_ascii=False, indent=2)
                
        except Exception as e:
            print(f"保存当前指纹失败: {e}")
    
    def get_current_fingerprint(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """获取当前指纹"""
        try:
            current_file = self.fingerprint_dir / f"{profile_id}_current.json"
            
            if current_file.exists():
                with open(current_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            
            return None
            
        except Exception as e:
            print(f"获取当前指纹失败: {e}")
            return None
    
    def should_update_fingerprint(self, profile_id: str) -> bool:
        """判断是否需要更新指纹"""
        try:
            current = self.get_current_fingerprint(profile_id)
            
            if not current:
                return True
            
            # 检查创建时间
            created_at = datetime.fromisoformat(current.get("created_at", ""))
            time_diff = (datetime.now() - created_at).total_seconds()
            
            # 超过1小时需要更新
            return time_diff > 3600
            
        except Exception as e:
            print(f"判断指纹更新需求失败: {e}")
            return True
    
    def apply_fingerprint_to_context(self, context, fingerprint: Dict[str, Any]) -> bool:
        """将指纹应用到浏览器上下文"""
        try:
            # 设置用户代理
            if "user_agent" in fingerprint:
                context.set_extra_http_headers({
                    "User-Agent": fingerprint["user_agent"]
                })
            
            # 设置语言
            if "languages" in fingerprint:
                context.set_extra_http_headers({
                    "Accept-Language": ",".join(fingerprint["languages"])
                })
            
            # 设置时区
            if "timezone" in fingerprint:
                context.timezone_id = fingerprint["timezone"]
            
            # 设置视口
            if "screen" in fingerprint:
                screen = fingerprint["screen"]
                context.viewport_size = {
                    "width": screen["width"],
                    "height": screen["height"]
                }
            
            # 注入反检测脚本
            anti_detection_script = self._generate_anti_detection_script(fingerprint)
            context.add_init_script(anti_detection_script)
            
            return True
            
        except Exception as e:
            print(f"应用指纹到上下文失败: {e}")
            return False
    
    def _generate_anti_detection_script(self, fingerprint: Dict[str, Any]) -> str:
        """生成反检测脚本"""
        script_parts = []
        
        # 基础反检测
        script_parts.append("""
            // 移除webdriver标识
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            // 移除自动化标识
            delete navigator.__proto__.webdriver;
        """)
        
        # 设置语言
        if "languages" in fingerprint:
            langs = json.dumps(fingerprint["languages"])
            script_parts.append(f"""
                Object.defineProperty(navigator, 'language', {{
                    get: () => '{fingerprint["languages"][0]}',
                }});
                
                Object.defineProperty(navigator, 'languages', {{
                    get: () => {langs},
                }});
            """)
        
        # 设置平台
        if "platform" in fingerprint:
            script_parts.append(f"""
                Object.defineProperty(navigator, 'platform', {{
                    get: () => '{fingerprint["platform"]}',
                }});
            """)
        
        # 设置硬件信息
        if "hardware_concurrency" in fingerprint:
            script_parts.append(f"""
                Object.defineProperty(navigator, 'hardwareConcurrency', {{
                    get: () => {fingerprint["hardware_concurrency"]},
                }});
            """)
        
        if "device_memory" in fingerprint:
            script_parts.append(f"""
                Object.defineProperty(navigator, 'deviceMemory', {{
                    get: () => {fingerprint["device_memory"]},
                }});
            """)
        
        # 高级反检测
        if "canvas_fingerprint" in fingerprint:
            script_parts.append(f"""
                // Canvas指纹保护
                const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
                HTMLCanvasElement.prototype.toDataURL = function() {{
                    // 添加微小扰动
                    const ctx = this.getContext('2d');
                    if (ctx) {{
                        ctx.fillStyle = '#f0f0f0';
                        ctx.fillRect(0, 0, 1, 1);
                    }}
                    return originalToDataURL.apply(this, arguments);
                }};
            """)
        
        return "\n".join(script_parts)

class AntiDetectionManager:
    """反检测管理器"""
    
    def __init__(self):
        self.risk_indicators = []
        self.behavior_patterns = []
        self.last_action_time = time.time()
        self.action_count = 0
    
    def assess_risk_level(self, page_content: str, response_headers: Dict[str, Any]) -> str:
        """评估风险级别"""
        risk_score = 0
        risk_factors = []
        
        # 检查页面内容中的风控指标
        risk_keywords = [
            "验证码", "captcha", "验证", "verification",
            "机器人", "bot", "自动化", "automated",
            "访问限制", "access restricted", "403", "429"
        ]
        
        for keyword in risk_keywords:
            if keyword.lower() in page_content.lower():
                risk_score += 10
                risk_factors.append(f"检测到关键词: {keyword}")
        
        # 检查响应头
        if response_headers.get('status') in [403, 429, 503]:
            risk_score += 20
            risk_factors.append(f"HTTP状态码: {response_headers.get('status')}")
        
        # 检查频率限制头
        rate_limit_headers = ['X-RateLimit-Remaining', 'Retry-After', 'X-RateLimit-Reset']
        for header in rate_limit_headers:
            if header in response_headers:
                risk_score += 15
                risk_factors.append(f"检测到频率限制头: {header}")
        
        # 确定风险级别
        if risk_score >= 30:
            return "high"
        elif risk_score >= 15:
            return "medium"
        elif risk_score > 0:
            return "low"
        else:
            return "safe"
    
    def apply_mitigation_measures(self, risk_level: str) -> Dict[str, Any]:
        """应用缓解措施"""
        measures = {
            "delay_range": (0, 0),
            "mouse_moves": 0,
            "scroll_actions": 0,
            "user_agent_rotation": False,
            "proxy_rotation": False,
            "session_reset": False
        }
        
        if risk_level == "high":
            measures.update({
                "delay_range": (5000, 15000),  # 5-15秒延迟
                "mouse_moves": 5,
                "scroll_actions": 3,
                "user_agent_rotation": True,
                "proxy_rotation": True,
                "session_reset": True
            })
        elif risk_level == "medium":
            measures.update({
                "delay_range": (2000, 8000),   # 2-8秒延迟
                "mouse_moves": 3,
                "scroll_actions": 2,
                "user_agent_rotation": True,
                "proxy_rotation": False,
                "session_reset": False
            })
        elif risk_level == "low":
            measures.update({
                "delay_range": (1000, 3000),   # 1-3秒延迟
                "mouse_moves": 1,
                "scroll_actions": 1,
                "user_agent_rotation": False,
                "proxy_rotation": False,
                "session_reset": False
            })
        
        return measures
    
    def simulate_human_behavior(self, measures: Dict[str, Any]) -> bool:
        """模拟人类行为"""
        try:
            # 应用延迟
            if measures["delay_range"] != (0, 0):
                delay = random.randint(*measures["delay_range"]) / 1000.0
                time.sleep(delay)
            
            # 这里可以添加鼠标移动、滚动等模拟行为
            # 具体实现需要与浏览器控制器集成
            
            return True
            
        except Exception as e:
            print(f"模拟人类行为失败: {e}")
            return False
    
    def should_rotate_fingerprint(self, session_duration: float, action_count: int) -> bool:
        """判断是否需要轮换指纹"""
        # 会话超过1小时或操作超过100次时轮换指纹
        return session_duration > 3600 or action_count > 100
    
    def monitor_session_health(self, session_data: Dict[str, Any]) -> Dict[str, Any]:
        """监控会话健康状态"""
        current_time = time.time()
        session_duration = current_time - session_data.get("start_time", current_time)
        action_count = session_data.get("action_count", 0)
        
        health_status = {
            "session_duration": session_duration,
            "action_count": action_count,
            "risk_level": "safe",
            "recommendations": []
        }
        
        # 检查会话时长
        if session_duration > 1800:  # 30分钟
            health_status["recommendations"].append("考虑轮换指纹")
        
        # 检查操作频率
        if action_count > 50:
            health_status["recommendations"].append("降低操作频率")
        
        # 检查是否需要休息
        if action_count > 200:
            health_status["recommendations"].append("建议暂停会话")
        
        return health_status
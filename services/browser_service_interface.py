"""
WebAuto 应用层浏览器服务抽象层
提供统一的浏览器服务接口，完全屏蔽底层实现
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List, Union
from dataclasses import dataclass
from enum import Enum

class BrowserActionType(Enum):
    """浏览器操作类型"""
    NAVIGATE = "navigate"
    CLICK = "click"
    INPUT = "input"
    KEY = "key"
    SCROLL = "scroll"
    WAIT = "wait"
    SCREENSHOT = "screenshot"
    EXTRACT = "extract"
    HIGHLIGHT = "highlight"

class AntiDetectionLevel(Enum):
    """反检测级别"""
    NONE = "none"
    BASIC = "basic"
    ENHANCED = "enhanced"
    MAXIMUM = "maximum"

@dataclass
class BrowserProfile:
    """浏览器配置文件"""
    profile_id: str
    user_agent: Optional[str] = None
    viewport: Optional[Dict[str, int]] = None
    timezone: Optional[str] = None
    locale: Optional[str] = None
    fingerprint: Optional[Dict[str, Any]] = None
    cookies_enabled: bool = True
    anti_detection_level: AntiDetectionLevel = AntiDetectionLevel.ENHANCED

@dataclass
class BrowserSession:
    """浏览器会话信息"""
    session_id: str
    profile: BrowserProfile
    status: str
    created_at: float
    last_activity: float
    page_count: int = 0
    cookie_count: int = 0

@dataclass
class PageAction:
    """页面操作指令"""
    action_type: BrowserActionType
    selector: Optional[str] = None
    value: Optional[str] = None
    coordinates: Optional[Dict[str, int]] = None
    wait_time: Optional[int] = None
    options: Optional[Dict[str, Any]] = None

@dataclass
class PageTemplate:
    """页面模板"""
    template_id: str
    name: str
    url_pattern: str
    selectors: Dict[str, str]
    actions: List[PageAction]
    metadata: Optional[Dict[str, Any]] = None

class AbstractBrowserService(ABC):
    """抽象浏览器服务接口"""
    
    @abstractmethod
    def start_service(self, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """启动浏览器服务"""
        pass
    
    @abstractmethod
    def stop_service(self) -> Dict[str, Any]:
        """停止浏览器服务"""
        pass
    
    @abstractmethod
    def create_session(self, profile: Optional[BrowserProfile] = None) -> str:
        """创建浏览器会话"""
        pass
    
    @abstractmethod
    def get_session(self, session_id: str) -> Optional[BrowserSession]:
        """获取会话信息"""
        pass
    
    @abstractmethod
    def close_session(self, session_id: str) -> Dict[str, Any]:
        """关闭浏览器会话"""
        pass
    
    @abstractmethod
    def execute_action(self, session_id: str, action: PageAction) -> Dict[str, Any]:
        """执行页面操作"""
        pass
    
    @abstractmethod
    def execute_template(self, session_id: str, template: PageTemplate, url: str) -> Dict[str, Any]:
        """执行页面模板"""
        pass
    
    @abstractmethod
    def load_cookies(self, session_id: str, cookie_source: str) -> Dict[str, Any]:
        """加载Cookie"""
        pass
    
    @abstractmethod
    def save_cookies(self, session_id: str, cookie_target: str) -> Dict[str, Any]:
        """保存Cookie"""
        pass
    
    @abstractmethod
    def update_fingerprint(self, session_id: str, fingerprint_config: Dict[str, Any]) -> Dict[str, Any]:
        """更新浏览器指纹"""
        pass
    
    @abstractmethod
    def get_service_status(self) -> Dict[str, Any]:
        """获取服务状态"""
        pass
    
    @abstractmethod
    def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """获取会话状态"""
        pass

class AbstractBrowserController(ABC):
    """抽象浏览器控制器接口"""
    
    @abstractmethod
    def navigate(self, url: str) -> Dict[str, Any]:
        """页面导航"""
        pass
    
    @abstractmethod
    def click(self, selector: Optional[str] = None, coordinates: Optional[Dict[str, int]] = None) -> Dict[str, Any]:
        """点击操作"""
        pass
    
    @abstractmethod
    def input_text(self, selector: str, text: str, mode: str = "fill") -> Dict[str, Any]:
        """
        输入文本

        mode 语义：
        - "fill"：直接设置 input 的 value（无键盘事件，适合稳定快速输入）；
        - "type"：模拟逐字键盘输入（触发 keydown/keyup，适合需要监听键盘事件的站点）。
        """
        pass

    @abstractmethod
    def press_key(self, key: str) -> Dict[str, Any]:
        """按下特殊按键（如 Enter / Esc 等）"""
        pass
    
    @abstractmethod
    def scroll(self, direction: str = "down", amount: Optional[int] = None) -> Dict[str, Any]:
        """滚动操作"""
        pass
    
    @abstractmethod
    def wait(self, milliseconds: int) -> Dict[str, Any]:
        """等待操作"""
        pass
    
    @abstractmethod
    def screenshot(self, options: Optional[Dict[str, Any]] = None) -> bytes:
        """截图操作"""
        pass
    
    @abstractmethod
    def highlight_element(self, selector: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """高亮元素"""
        pass
    
    @abstractmethod
    def extract_data(self, selectors: Dict[str, str]) -> Dict[str, Any]:
        """提取数据"""
        pass
    
    @abstractmethod
    def get_page_info(self) -> Dict[str, Any]:
        """获取页面信息"""
        pass

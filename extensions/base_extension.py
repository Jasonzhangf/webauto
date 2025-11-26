"""
扩展系统基类
提供网站特定的Dev模式功能扩展接口
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum


class ExtensionType(Enum):
    """扩展类型"""
    SITE_SPECIFIC = "site_specific"  # 网站特定
    FUNCTIONAL = "functional"       # 功能性
    ANALYTICAL = "analytical"       # 分析性


@dataclass
class ExtensionCapability:
    """扩展能力描述"""
    name: str
    description: str
    supported_actions: List[str]
    required_permissions: List[str]
    version: str = "1.0.0"


@dataclass
class NavigationResult:
    """导航结果"""
    success: bool
    url: Optional[str] = None
    message: str = ""
    next_actions: List[str] = None
    containers_found: List[str] = None


@dataclass
class LoginResult:
    """登录结果"""
    success: bool
    logged_in: bool = False
    method_used: Optional[str] = None
    message: str = ""
    requires_manual: bool = False
    next_steps: List[str] = None


class BaseExtension(ABC):
    """扩展基类"""

    def __init__(self, name: str, version: str = "1.0.0"):
        self.name = name
        self.version = version
        self.enabled = False
        self.config = {}
        self._capabilities = []

    @abstractmethod
    def get_extension_type(self) -> ExtensionType:
        """获取扩展类型"""
        pass

    @abstractmethod
    def get_site_patterns(self) -> List[str]:
        """获取支持的网站模式（URL模式）"""
        pass

    @abstractmethod
    def get_capabilities(self) -> List[ExtensionCapability]:
        """获取扩展能力列表"""
        pass

    @abstractmethod
    async def initialize(self, config: Dict[str, Any]) -> bool:
        """初始化扩展"""
        pass

    @abstractmethod
    async def cleanup(self) -> bool:
        """清理扩展资源"""
        pass

    async def can_handle_url(self, url: str) -> bool:
        """检查是否可以处理指定URL"""
        import re
        for pattern in self.get_site_patterns():
            if re.search(pattern, url):
                return True
        return False

    async def handle_navigation(self, url: str, browser_session) -> NavigationResult:
        """处理页面导航"""
        return NavigationResult(
            success=True,
            url=url,
            message="Navigation handled by base extension"
        )

    async def handle_login(self, url: str, browser_session, credentials: Optional[Dict] = None) -> LoginResult:
        """处理登录流程"""
        return LoginResult(
            success=True,
            logged_in=False,
            message="Login handling not implemented by base extension"
        )

    async def auto_register_containers(self, url: str, browser_session) -> List[Dict[str, Any]]:
        """自动注册容器"""
        return []

    async def get_workflow_suggestions(self, page_context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """获取工作流建议"""
        return []

    async def validate_configuration(self, config: Dict[str, Any]) -> List[str]:
        """验证配置，返回错误列表"""
        return []

    def get_extension_info(self) -> Dict[str, Any]:
        """获取扩展信息"""
        return {
            "name": self.name,
            "version": self.version,
            "type": self.get_extension_type().value,
            "enabled": self.enabled,
            "capabilities": [
                {
                    "name": cap.name,
                    "description": cap.description,
                    "supported_actions": cap.supported_actions,
                    "required_permissions": cap.required_permissions,
                    "version": cap.version
                }
                for cap in self.get_capabilities()
            ],
            "site_patterns": self.get_site_patterns()
        }


class SiteSpecificExtension(BaseExtension):
    """网站特定扩展基类"""

    def get_extension_type(self) -> ExtensionType:
        return ExtensionType.SITE_SPECIFIC

    @abstractmethod
    async def detect_page_type(self, browser_session) -> str:
        """检测页面类型（主页、详情页、登录页等）"""
        pass

    @abstractmethod
    async def get_dynamic_containers(self, browser_session) -> List[Dict[str, Any]]:
        """获取动态容器定义"""
        pass

    async def should_auto_login(self, url: str, browser_session) -> bool:
        """判断是否应该自动登录"""
        return False

    async def get_login_indicators(self) -> List[str]:
        """获取登录状态指示器选择器"""
        return []

    async def handle_post_login_actions(self, browser_session) -> bool:
        """处理登录后操作"""
        return True


class FunctionalExtension(BaseExtension):
    """功能性扩展基类"""

    def get_extension_type(self) -> ExtensionType:
        return ExtensionType.FUNCTIONAL

    @abstractmethod
    async def execute_function(self, function_name: str, parameters: Dict[str, Any], browser_session) -> Any:
        """执行特定功能"""
        pass


class AnalyticalExtension(BaseExtension):
    """分析性扩展基类"""

    def get_extension_type(self) -> ExtensionType:
        return ExtensionType.ANALYTICAL

    @abstractmethod
    async def analyze_page(self, browser_session, analysis_type: str = "auto") -> Dict[str, Any]:
        """分析页面"""
        pass

    @abstractmethod
    async def get_insights(self, page_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """获取页面洞察"""
        pass
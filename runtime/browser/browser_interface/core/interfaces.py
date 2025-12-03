"""
Core interfaces for browser modularization.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional


class IBrowserOrchestrator(ABC):
    """浏览器编排器接口 - 统一管理浏览器生命周期和操作"""

    @abstractmethod
    def create_session(self, profile: Dict[str, Any]) -> str:
        """创建浏览器会话，返回会话ID"""
        pass

    @abstractmethod
    def get_page(self, session_id: str) -> Any:
        """获取指定会话的页面对象"""
        pass

    @abstractmethod
    def close_session(self, session_id: str) -> bool:
        """关闭指定会话"""
        pass


class ISessionManager(ABC):
    """会话管理器接口 - 处理会话数据存储和恢复"""

    @abstractmethod
    def save_session(self, session_id: str, data: Dict[str, Any]) -> None:
        """保存会话数据"""
        pass

    @abstractmethod
    def load_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """加载会话数据"""
        pass

    @abstractmethod
    def delete_session(self, session_id: str) -> bool:
        """删除会话数据"""
        pass


class IOverlayManager(ABC):
    """Overlay管理器接口 - 管理页面覆盖层功能"""

    @abstractmethod
    def inject_overlay(self, page: Any, config: Dict[str, Any]) -> bool:
        """注入overlay到页面"""
        pass

    @abstractmethod
    def remove_overlay(self, page: Any) -> bool:
        """从页面移除overlay"""
        pass


class IConfigManager(ABC):
    """配置管理器接口 - 统一管理浏览器配置"""

    @abstractmethod
    def get_config(self, key: str, default: Any = None) -> Any:
        """获取配置值"""
        pass

    @abstractmethod
    def set_config(self, key: str, value: Any) -> None:
        """设置配置值"""
        pass


class IPageWrapper(ABC):
    """页面包装器接口 - 统一页面操作方法"""

    @abstractmethod
    def navigate(self, url: str) -> bool:
        """导航到指定URL"""
        pass

    @abstractmethod
    def screenshot(self, path: str) -> bool:
        """页面截图"""
        pass

    @abstractmethod
    def execute_script(self, script: str) -> Any:
        """执行JavaScript脚本"""
        pass

    @abstractmethod
    def query_selector(self, selector: str) -> list:
        """查询页面元素"""
        pass

    @abstractmethod
    def click_element(self, selector: str) -> bool:
        """点击页面元素"""
        pass

    @abstractmethod
    def fill_input(self, selector: str, value: str) -> bool:
        """填充输入框"""
        pass
"""
抽象浏览器接口定义
提供统一的浏览器操作接口，隐藏底层实现
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List

class AbstractBrowser(ABC):
    """抽象浏览器接口"""
    
    @abstractmethod
    def new_page(self) -> 'AbstractPage':
        """创建新页面"""
        pass
    
    @abstractmethod
    def goto(self, url: str) -> 'AbstractPage':
        """导航到URL并返回页面"""
        pass
    
    @abstractmethod
    def close(self) -> None:
        """关闭浏览器"""
        pass
    
    @abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """获取浏览器状态"""
        pass

class AbstractPage(ABC):
    """抽象页面接口"""
    
    @abstractmethod
    def goto(self, url: str) -> None:
        """导航到URL"""
        pass
    
    @abstractmethod
    def title(self) -> str:
        """获取页面标题"""
        pass
    
    @abstractmethod
    def url(self) -> str:
        """获取当前URL"""
        pass
    
    @abstractmethod
    def click(self, selector: str) -> None:
        """点击元素"""
        pass
    
    @abstractmethod
    def fill(self, selector: str, value: str) -> None:
        """填写输入框"""
        pass
    
    @abstractmethod
    def text_content(self, selector: str) -> str:
        """获取元素文本"""
        pass
    
    @abstractmethod
    def screenshot(self, filename: str = None, full_page: bool = False) -> bytes:
        """截图"""
        pass
    
    @abstractmethod
    def wait_for_selector(self, selector: str, timeout: int = 30000) -> None:
        """等待选择器"""
        pass
    
    @abstractmethod
    def close(self) -> None:
        """关闭页面"""
        pass

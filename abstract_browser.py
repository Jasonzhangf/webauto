"""
Abstract browser interfaces
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Union


class AbstractPage(ABC):
    """Abstract page interface"""

    @abstractmethod
    def click(self, selector: str, **kwargs) -> Any:
        """Click on element"""
        pass

    @abstractmethod
    def fill(self, selector: str, value: str, **kwargs) -> Any:
        """Fill form field"""
        pass

    @abstractmethod
    def query_selector_all(self, selector: str) -> List[Any]:
        """Query multiple elements"""
        pass

    @abstractmethod
    def title(self) -> str:
        """Get page title"""
        pass


class AbstractBrowser(ABC):
    """Abstract browser interface"""

    @abstractmethod
    def goto(self, url: str, **kwargs) -> AbstractPage:
        """Navigate to URL"""
        pass

    @abstractmethod
    def close(self) -> None:
        """Close browser"""
        pass
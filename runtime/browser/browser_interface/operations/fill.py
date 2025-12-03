"""
Fill/Type operation implementation
"""

from __future__ import annotations
from typing import Any, Dict, Optional
import time

from .base import BaseOperation, OperationType, OperationResult, OperationStatus


class FillOperation(BaseOperation):
    """Fill an input field with text"""
    
    def __init__(
        self,
        selector: str,
        text: str,
        op_id: Optional[str] = None,
        description: Optional[str] = None,
        clear_first: bool = True,
        wait_before: float = 0.0,
        wait_after: float = 0.5,
        timeout: float = 30.0,
        typing_delay: Optional[float] = None
    ):
        params = {
            "selector": selector,
            "text": text,
            "clear_first": clear_first,
            "wait_before": wait_before,
            "wait_after": wait_after,
            "timeout": timeout,
            "typing_delay": typing_delay
        }
        super().__init__(
            op_id=op_id,
            op_type=OperationType.FILL,
            params=params,
            description=description or f"Fill {selector} with '{text[:20]}...'"
        )
    
    def _get_type(self) -> OperationType:
        return OperationType.FILL
    
    def execute(self, page: Any, context: Optional[Dict[str, Any]] = None) -> OperationResult:
        """Execute fill operation"""
        start_time = time.time()
        selector = self.params["selector"]
        text = self.params["text"]
        clear_first = self.params.get("clear_first", True)
        wait_before = self.params.get("wait_before", 0.0)
        wait_after = self.params.get("wait_after", 0.5)
        timeout = self.params.get("timeout", 30.0)
        typing_delay = self.params.get("typing_delay")
        
        try:
            # Wait before filling
            if wait_before > 0:
                time.sleep(wait_before)
            
            # Clear the field first if requested
            if clear_first:
                page.fill(selector, "", timeout=timeout * 1000)
            
            # Fill with text
            if typing_delay is not None:
                # Type character by character with delay
                for char in text:
                    page.type(selector, char, delay=typing_delay * 1000)
            else:
                # Fill all at once
                page.fill(selector, text, timeout=timeout * 1000)
            
            # Wait after filling
            if wait_after > 0:
                time.sleep(wait_after)
            
            duration_ms = (time.time() - start_time) * 1000
            
            return OperationResult(
                status=OperationStatus.SUCCESS,
                data={"selector": selector, "text": text, "length": len(text)},
                duration_ms=duration_ms
            )
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return OperationResult(
                status=OperationStatus.FAILED,
                error=f"Fill failed on {selector}: {str(e)}",
                duration_ms=duration_ms
            )
    
    def validate(self) -> tuple[bool, Optional[str]]:
        """Validate fill operation parameters"""
        if not self.params.get("selector"):
            return False, "Selector is required"
        
        selector = self.params["selector"]
        if not isinstance(selector, str) or len(selector.strip()) == 0:
            return False, "Selector must be a non-empty string"
        
        if "text" not in self.params:
            return False, "Text is required"
        
        return True, None
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> FillOperation:
        """Create FillOperation from dictionary"""
        params = data.get("params", {})
        return cls(
            selector=params.get("selector", ""),
            text=params.get("text", ""),
            op_id=data.get("op_id"),
            description=data.get("description"),
            clear_first=params.get("clear_first", True),
            wait_before=params.get("wait_before", 0.0),
            wait_after=params.get("wait_after", 0.5),
            timeout=params.get("timeout", 30.0),
            typing_delay=params.get("typing_delay")
        )


__all__ = ["FillOperation"]

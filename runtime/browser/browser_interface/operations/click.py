"""
Click operation implementation
"""

from __future__ import annotations
from typing import Any, Dict, Optional
import time

from .base import BaseOperation, OperationType, OperationResult, OperationStatus


class ClickOperation(BaseOperation):
    """Click on an element"""
    
    def __init__(
        self,
        selector: str,
        op_id: Optional[str] = None,
        description: Optional[str] = None,
        wait_before: float = 0.0,
        wait_after: float = 0.5,
        timeout: float = 30.0
    ):
        params = {
            "selector": selector,
            "wait_before": wait_before,
            "wait_after": wait_after,
            "timeout": timeout
        }
        super().__init__(
            op_id=op_id,
            op_type=OperationType.CLICK,
            params=params,
            description=description or f"Click {selector}"
        )
    
    def _get_type(self) -> OperationType:
        return OperationType.CLICK
    
    def execute(self, page: Any, context: Optional[Dict[str, Any]] = None) -> OperationResult:
        """Execute click operation"""
        start_time = time.time()
        selector = self.params["selector"]
        wait_before = self.params.get("wait_before", 0.0)
        wait_after = self.params.get("wait_after", 0.5)
        timeout = self.params.get("timeout", 30.0)
        
        try:
            # Wait before clicking
            if wait_before > 0:
                time.sleep(wait_before)
            
            # Click the element
            page.click(selector, timeout=timeout * 1000)
            
            # Wait after clicking
            if wait_after > 0:
                time.sleep(wait_after)
            
            duration_ms = (time.time() - start_time) * 1000
            
            return OperationResult(
                status=OperationStatus.SUCCESS,
                data={"selector": selector, "clicked": True},
                duration_ms=duration_ms
            )
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return OperationResult(
                status=OperationStatus.FAILED,
                error=f"Click failed on {selector}: {str(e)}",
                duration_ms=duration_ms
            )
    
    def validate(self) -> tuple[bool, Optional[str]]:
        """Validate click operation parameters"""
        if not self.params.get("selector"):
            return False, "Selector is required"
        
        selector = self.params["selector"]
        if not isinstance(selector, str) or len(selector.strip()) == 0:
            return False, "Selector must be a non-empty string"
        
        return True, None
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ClickOperation:
        """Create ClickOperation from dictionary"""
        params = data.get("params", {})
        return cls(
            selector=params.get("selector", ""),
            op_id=data.get("op_id"),
            description=data.get("description"),
            wait_before=params.get("wait_before", 0.0),
            wait_after=params.get("wait_after", 0.5),
            timeout=params.get("timeout", 30.0)
        )


__all__ = ["ClickOperation"]

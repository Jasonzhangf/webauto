"""
Wait operation implementation
"""

from __future__ import annotations
from typing import Any, Dict, Optional
import time

from .base import BaseOperation, OperationType, OperationResult, OperationStatus


class WaitOperation(BaseOperation):
    """Wait for a specified duration or condition"""
    
    def __init__(
        self,
        duration: Optional[float] = None,
        selector: Optional[str] = None,
        op_id: Optional[str] = None,
        description: Optional[str] = None,
        timeout: float = 30.0
    ):
        params = {
            "duration": duration,
            "selector": selector,
            "timeout": timeout
        }
        
        if selector:
            desc = description or f"Wait for {selector}"
        elif duration:
            desc = description or f"Wait {duration}s"
        else:
            desc = description or "Wait"
        
        super().__init__(
            op_id=op_id,
            op_type=OperationType.WAIT,
            params=params,
            description=desc
        )
    
    def _get_type(self) -> OperationType:
        return OperationType.WAIT
    
    def execute(self, page: Any, context: Optional[Dict[str, Any]] = None) -> OperationResult:
        """Execute wait operation"""
        start_time = time.time()
        duration = self.params.get("duration")
        selector = self.params.get("selector")
        timeout = self.params.get("timeout", 30.0)
        
        try:
            if selector:
                # Wait for selector to appear
                page.wait_for_selector(selector, timeout=timeout * 1000)
                duration_ms = (time.time() - start_time) * 1000
                return OperationResult(
                    status=OperationStatus.SUCCESS,
                    data={"selector": selector, "appeared": True},
                    duration_ms=duration_ms
                )
            elif duration:
                # Wait for fixed duration
                time.sleep(duration)
                duration_ms = (time.time() - start_time) * 1000
                return OperationResult(
                    status=OperationStatus.SUCCESS,
                    data={"duration": duration},
                    duration_ms=duration_ms
                )
            else:
                return OperationResult(
                    status=OperationStatus.FAILED,
                    error="Either duration or selector must be specified"
                )
                
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return OperationResult(
                status=OperationStatus.FAILED,
                error=f"Wait failed: {str(e)}",
                duration_ms=duration_ms
            )
    
    def validate(self) -> tuple[bool, Optional[str]]:
        """Validate wait operation parameters"""
        duration = self.params.get("duration")
        selector = self.params.get("selector")
        
        if duration is None and selector is None:
            return False, "Either duration or selector must be specified"
        
        if duration is not None and duration < 0:
            return False, "Duration must be non-negative"
        
        if selector is not None and (not isinstance(selector, str) or len(selector.strip()) == 0):
            return False, "Selector must be a non-empty string"
        
        return True, None
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> WaitOperation:
        """Create WaitOperation from dictionary"""
        params = data.get("params", {})
        return cls(
            duration=params.get("duration"),
            selector=params.get("selector"),
            op_id=data.get("op_id"),
            description=data.get("description"),
            timeout=params.get("timeout", 30.0)
        )


__all__ = ["WaitOperation"]

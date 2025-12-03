"""
Base operation classes and interfaces for WebAuto.

Operations represent atomic actions that can be performed on web pages,
such as clicking, filling forms, waiting, navigating, etc.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from enum import Enum
import time


class OperationType(Enum):
    """Types of operations supported"""
    CLICK = "click"
    FILL = "fill"
    WAIT = "wait"
    NAVIGATE = "navigate"
    EXTRACT = "extract"
    SCROLL = "scroll"
    HOVER = "hover"
    SELECT = "select"
    PRESS_KEY = "press_key"
    SCREENSHOT = "screenshot"


class OperationStatus(Enum):
    """Status of operation execution"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class OperationResult:
    """Result of an operation execution"""
    
    def __init__(
        self,
        status: OperationStatus,
        data: Optional[Any] = None,
        error: Optional[str] = None,
        duration_ms: Optional[float] = None
    ):
        self.status = status
        self.data = data
        self.error = error
        self.duration_ms = duration_ms
        self.timestamp = time.time()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "status": self.status.value,
            "data": self.data,
            "error": self.error,
            "duration_ms": self.duration_ms,
            "timestamp": self.timestamp
        }
    
    def __repr__(self) -> str:
        return f"OperationResult(status={self.status.value}, data={self.data}, error={self.error})"


class BaseOperation(ABC):
    """Base class for all operations"""
    
    def __init__(
        self,
        op_id: Optional[str] = None,
        op_type: Optional[OperationType] = None,
        params: Optional[Dict[str, Any]] = None,
        description: Optional[str] = None
    ):
        self.op_id = op_id or self._generate_id()
        self.op_type = op_type or self._get_type()
        self.params = params or {}
        self.description = description or self._get_default_description()
        self.created_at = time.time()
    
    @abstractmethod
    def _get_type(self) -> OperationType:
        """Get the operation type"""
        pass
    
    @abstractmethod
    def execute(self, page: Any, context: Optional[Dict[str, Any]] = None) -> OperationResult:
        """Execute the operation on a page
        
        Args:
            page: Playwright page object
            context: Optional execution context with shared state
            
        Returns:
            OperationResult with status and data
        """
        pass
    
    @abstractmethod
    def validate(self) -> tuple[bool, Optional[str]]:
        """Validate operation parameters
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        pass
    
    def _get_default_description(self) -> str:
        """Get default description for this operation"""
        return f"{self.op_type.value} operation"
    
    def _generate_id(self) -> str:
        """Generate unique operation ID"""
        import uuid
        return f"op_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert operation to dictionary"""
        return {
            "op_id": self.op_id,
            "op_type": self.op_type.value,
            "params": self.params,
            "description": self.description,
            "created_at": self.created_at
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> BaseOperation:
        """Create operation from dictionary"""
        # This will be overridden by specific operation classes
        raise NotImplementedError("Subclasses must implement from_dict")
    
    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(id={self.op_id}, type={self.op_type.value}, params={self.params})"


class OperationSequence:
    """A sequence of operations to be executed in order"""
    
    def __init__(
        self,
        sequence_id: Optional[str] = None,
        operations: Optional[List[BaseOperation]] = None,
        name: Optional[str] = None,
        description: Optional[str] = None
    ):
        self.sequence_id = sequence_id or self._generate_id()
        self.operations = operations or []
        self.name = name or f"Sequence {self.sequence_id}"
        self.description = description or ""
        self.created_at = time.time()
    
    def add_operation(self, operation: BaseOperation) -> None:
        """Add an operation to the sequence"""
        self.operations.append(operation)
    
    def remove_operation(self, op_id: str) -> bool:
        """Remove an operation by ID"""
        original_len = len(self.operations)
        self.operations = [op for op in self.operations if op.op_id != op_id]
        return len(self.operations) < original_len
    
    def reorder(self, op_id: str, new_index: int) -> bool:
        """Reorder an operation to a new position"""
        # Find the operation
        op = None
        old_index = -1
        for i, operation in enumerate(self.operations):
            if operation.op_id == op_id:
                op = operation
                old_index = i
                break
        
        if op is None or new_index < 0 or new_index >= len(self.operations):
            return False
        
        # Remove and reinsert
        self.operations.pop(old_index)
        self.operations.insert(new_index, op)
        return True
    
    def execute(
        self,
        page: Any,
        context: Optional[Dict[str, Any]] = None,
        stop_on_error: bool = True
    ) -> List[OperationResult]:
        """Execute all operations in sequence
        
        Args:
            page: Playwright page object
            context: Shared execution context
            stop_on_error: Whether to stop on first error
            
        Returns:
            List of OperationResults
        """
        results = []
        exec_context = context or {}
        
        for operation in self.operations:
            try:
                result = operation.execute(page, exec_context)
                results.append(result)
                
                if stop_on_error and result.status == OperationStatus.FAILED:
                    break
                    
            except Exception as e:
                result = OperationResult(
                    status=OperationStatus.FAILED,
                    error=str(e)
                )
                results.append(result)
                
                if stop_on_error:
                    break
        
        return results
    
    def validate(self) -> tuple[bool, List[str]]:
        """Validate all operations in sequence
        
        Returns:
            Tuple of (all_valid, list_of_errors)
        """
        errors = []
        for i, operation in enumerate(self.operations):
            is_valid, error = operation.validate()
            if not is_valid:
                errors.append(f"Operation {i} ({operation.op_id}): {error}")
        
        return len(errors) == 0, errors
    
    def _generate_id(self) -> str:
        """Generate unique sequence ID"""
        import uuid
        return f"seq_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert sequence to dictionary"""
        return {
            "sequence_id": self.sequence_id,
            "name": self.name,
            "description": self.description,
            "operations": [op.to_dict() for op in self.operations],
            "created_at": self.created_at
        }
    
    def __repr__(self) -> str:
        return f"OperationSequence(id={self.sequence_id}, name={self.name}, ops={len(self.operations)})"


__all__ = [
    "OperationType",
    "OperationStatus",
    "OperationResult",
    "BaseOperation",
    "OperationSequence"
]

"""
Operations package - provides operation types and execution framework
"""

from .base import (
    BaseOperation,
    OperationType,
    OperationStatus,
    OperationResult,
    OperationSequence
)
from .click import ClickOperation
from .fill import FillOperation
from .wait import WaitOperation

# Operation registry for dynamic creation
OPERATION_REGISTRY = {
    OperationType.CLICK: ClickOperation,
    OperationType.FILL: FillOperation,
    OperationType.WAIT: WaitOperation,
}


def create_operation(op_type: str, **kwargs) -> BaseOperation:
    """Factory function to create operations by type
    
    Args:
        op_type: Operation type string (e.g., "click", "fill", "wait")
        **kwargs: Operation-specific parameters
        
    Returns:
        BaseOperation instance
        
    Raises:
        ValueError: If operation type is not recognized
    """
    try:
        op_enum = OperationType(op_type.lower())
    except ValueError:
        raise ValueError(f"Unknown operation type: {op_type}")
    
    op_class = OPERATION_REGISTRY.get(op_enum)
    if not op_class:
        raise ValueError(f"Operation type not implemented: {op_type}")
    
    return op_class(**kwargs)


def operation_from_dict(data: dict) -> BaseOperation:
    """Create operation from dictionary representation
    
    Args:
        data: Dictionary with operation data
        
    Returns:
        BaseOperation instance
    """
    op_type = data.get("op_type")
    if not op_type:
        raise ValueError("Operation type not specified in data")
    
    try:
        op_enum = OperationType(op_type)
    except ValueError:
        raise ValueError(f"Unknown operation type: {op_type}")
    
    op_class = OPERATION_REGISTRY.get(op_enum)
    if not op_class:
        raise ValueError(f"Operation type not implemented: {op_type}")
    
    return op_class.from_dict(data)


__all__ = [
    "BaseOperation",
    "OperationType",
    "OperationStatus",
    "OperationResult",
    "OperationSequence",
    "ClickOperation",
    "FillOperation",
    "WaitOperation",
    "create_operation",
    "operation_from_dict",
    "OPERATION_REGISTRY"
]

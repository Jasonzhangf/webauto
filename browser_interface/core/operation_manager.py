"""
Operation Manager - manages operation storage, execution, and testing
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
import json
import os
from pathlib import Path

from ..operations import (
    BaseOperation,
    OperationSequence,
    OperationResult,
    operation_from_dict,
    create_operation
)


class OperationManager:
    """Manages operations and sequences for containers"""
    
    def __init__(self, storage_dir: str = "./operations"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        
        # In-memory cache
        self._operations: Dict[str, BaseOperation] = {}
        self._sequences: Dict[str, OperationSequence] = {}
        
        # Load existing operations
        self._load_from_disk()
    
    def _load_from_disk(self) -> None:
        """Load operations and sequences from disk"""
        # Load operations
        ops_file = self.storage_dir / "operations.json"
        if ops_file.exists():
            try:
                with open(ops_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for op_data in data.get("operations", []):
                        op = operation_from_dict(op_data)
                        self._operations[op.op_id] = op
            except Exception as e:
                print(f"⚠️ Failed to load operations: {e}")
        
        # Load sequences
        seqs_file = self.storage_dir / "sequences.json"
        if seqs_file.exists():
            try:
                with open(seqs_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for seq_data in data.get("sequences", []):
                        ops = [operation_from_dict(op_data) for op_data in seq_data.get("operations", [])]
                        seq = OperationSequence(
                            sequence_id=seq_data.get("sequence_id"),
                            operations=ops,
                            name=seq_data.get("name"),
                            description=seq_data.get("description")
                        )
                        self._sequences[seq.sequence_id] = seq
            except Exception as e:
                print(f"⚠️ Failed to load sequences: {e}")
    
    def _save_to_disk(self) -> None:
        """Save operations and sequences to disk"""
        # Save operations
        ops_file = self.storage_dir / "operations.json"
        try:
            ops_data = {
                "operations": [op.to_dict() for op in self._operations.values()]
            }
            with open(ops_file, 'w', encoding='utf-8') as f:
                json.dump(ops_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"⚠️ Failed to save operations: {e}")
        
        # Save sequences
        seqs_file = self.storage_dir / "sequences.json"
        try:
            seqs_data = {
                "sequences": [seq.to_dict() for seq in self._sequences.values()]
            }
            with open(seqs_file, 'w', encoding='utf-8') as f:
                json.dump(seqs_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"⚠️ Failed to save sequences: {e}")
    
    # Operation CRUD
    
    def add_operation(self, operation: BaseOperation) -> str:
        """Add an operation
        
        Returns:
            Operation ID
        """
        self._operations[operation.op_id] = operation
        self._save_to_disk()
        return operation.op_id
    
    def get_operation(self, op_id: str) -> Optional[BaseOperation]:
        """Get an operation by ID"""
        return self._operations.get(op_id)
    
    def update_operation(self, op_id: str, operation: BaseOperation) -> bool:
        """Update an existing operation"""
        if op_id not in self._operations:
            return False
        
        self._operations[op_id] = operation
        self._save_to_disk()
        return True
    
    def delete_operation(self, op_id: str) -> bool:
        """Delete an operation"""
        if op_id not in self._operations:
            return False
        
        del self._operations[op_id]
        self._save_to_disk()
        return True
    
    def list_operations(self) -> List[BaseOperation]:
        """List all operations"""
        return list(self._operations.values())
    
    # Sequence CRUD
    
    def add_sequence(self, sequence: OperationSequence) -> str:
        """Add a sequence
        
        Returns:
            Sequence ID
        """
        self._sequences[sequence.sequence_id] = sequence
        self._save_to_disk()
        return sequence.sequence_id
    
    def get_sequence(self, seq_id: str) -> Optional[OperationSequence]:
        """Get a sequence by ID"""
        return self._sequences.get(seq_id)
    
    def update_sequence(self, seq_id: str, sequence: OperationSequence) -> bool:
        """Update an existing sequence"""
        if seq_id not in self._sequences:
            return False
        
        self._sequences[seq_id] = sequence
        self._save_to_disk()
        return True
    
    def delete_sequence(self, seq_id: str) -> bool:
        """Delete a sequence"""
        if seq_id not in self._sequences:
            return False
        
        del self._sequences[seq_id]
        self._save_to_disk()
        return True
    
    def list_sequences(self) -> List[OperationSequence]:
        """List all sequences"""
        return list(self._sequences.values())
    
    # Execution
    
    def test_operation(
        self,
        op_id: str,
        page: Any,
        context: Optional[Dict[str, Any]] = None
    ) -> OperationResult:
        """Test a single operation
        
        Args:
            op_id: Operation ID
            page: Playwright page object
            context: Optional execution context
            
        Returns:
            OperationResult
        """
        operation = self.get_operation(op_id)
        if not operation:
            from .operations import OperationResult, OperationStatus
            return OperationResult(
                status=OperationStatus.FAILED,
                error=f"Operation not found: {op_id}"
            )
        
        # Validate first
        is_valid, error = operation.validate()
        if not is_valid:
            from .operations import OperationResult, OperationStatus
            return OperationResult(
                status=OperationStatus.FAILED,
                error=f"Validation failed: {error}"
            )
        
        # Execute
        return operation.execute(page, context)
    
    def execute_sequence(
        self,
        seq_id: str,
        page: Any,
        context: Optional[Dict[str, Any]] = None,
        stop_on_error: bool = True
    ) -> List[OperationResult]:
        """Execute a sequence
        
        Args:
            seq_id: Sequence ID
            page: Playwright page object
            context: Optional execution context
            stop_on_error: Whether to stop on first error
            
        Returns:
            List of OperationResults
        """
        sequence = self.get_sequence(seq_id)
        if not sequence:
            from .operations import OperationResult, OperationStatus
            return [OperationResult(
                status=OperationStatus.FAILED,
                error=f"Sequence not found: {seq_id}"
            )]
        
        # Validate first
        is_valid, errors = sequence.validate()
        if not is_valid:
            from .operations import OperationResult, OperationStatus
            return [OperationResult(
                status=OperationStatus.FAILED,
                error=f"Validation failed: {', '.join(errors)}"
            )]
        
        # Execute
        return sequence.execute(page, context, stop_on_error)


__all__ = ["OperationManager"]

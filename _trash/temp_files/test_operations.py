#!/usr/bin/env python3
"""
Test operation system
"""

import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper
from browser_interface.operations import (
    ClickOperation,
    FillOperation,
    WaitOperation,
    OperationSequence,
    OperationStatus
)
from browser_interface.core.operation_manager import OperationManager


def test_operations():
    """Test operation system"""
    print("🧪 Testing Operation System...")
    
    # Create operation manager
    op_manager = OperationManager(storage_dir="./test_operations")
    
    # Create some operations
    print("\n📝 Creating operations...")
    
    # Click operation
    click_op = ClickOperation(
        selector="h1",
        description="Click the heading"
    )
    click_id = op_manager.add_operation(click_op)
    print(f"   ✅ Created click operation: {click_id}")
    
    # Fill operation
    fill_op = FillOperation(
        selector="input[type='text']",
        text="Hello WebAuto!",
        description="Fill search box"
    )
    fill_id = op_manager.add_operation(fill_op)
    print(f"   ✅ Created fill operation: {fill_id}")
    
    # Wait operation
    wait_op = WaitOperation(
        duration=2.0,
        description="Wait 2 seconds"
    )
    wait_id = op_manager.add_operation(wait_op)
    print(f"   ✅ Created wait operation: {wait_id}")
    
    # Create a sequence
    print("\n📋 Creating operation sequence...")
    sequence = OperationSequence(
        name="Test Sequence",
        description="A test sequence of operations"
    )
    sequence.add_operation(wait_op)
    sequence.add_operation(click_op)
    
    seq_id = op_manager.add_sequence(sequence)
    print(f"   ✅ Created sequence: {seq_id}")
    
    # List operations
    print("\n📊 Listing all operations...")
    ops = op_manager.list_operations()
    for op in ops:
        print(f"   - {op.op_type.value}: {op.description} ({op.op_id})")
    
    # Test with browser
    print("\n🌐 Testing operations in browser...")
    
    config = {
        'headless': False,
        'auto_overlay': False,  # Disable overlay for cleaner test
        'auto_session': False,
        'timeout': 30.0
    }
    
    browser = ChromiumBrowserWrapper(config)
    
    try:
        # Navigate to example page
        print("   📄 Navigating to example.com...")
        page = browser.goto("https://example.com")
        time.sleep(2)
        
        # Test individual operation
        print("\n   🧪 Testing individual operation (click)...")
        result = op_manager.test_operation(click_id, page.page)
        print(f"      Status: {result.status.value}")
        print(f"      Duration: {result.duration_ms:.2f}ms")
        if result.error:
            print(f"      Error: {result.error}")
        
        # Test sequence
        print("\n   🧪 Testing operation sequence...")
        results = op_manager.execute_sequence(seq_id, page.page)
        for i, result in enumerate(results):
            print(f"      Op {i+1}: {result.status.value} ({result.duration_ms:.2f}ms)")
            if result.error:
                print(f"         Error: {result.error}")
        
        # Keep browser open briefly
        print("\n   ⏸️  Pausing for 5 seconds...")
        time.sleep(5)
        
        print("\n✅ All tests completed!")
        return True
        
    finally:
        print("\n👋 Closing browser...")
        browser.close()


if __name__ == "__main__":
    try:
        success = test_operations()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

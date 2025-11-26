#!/usr/bin/env python3
"""
Automated test for profile mutex using subprocess
"""

import sys
import os
import time
import subprocess
import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def test_profile_mutex_automated():
    """Test profile mutex by launching two processes"""
    
    print("🧪 自动化测试Profile互斥功能\n")
    
    script_path = os.path.join(os.path.dirname(__file__), "test_profile_mutex_single.py")
    
    # Test 1: Launch first instance
    print("=" * 60)
    print("步骤 1: 启动第一个实例 (profile=auto_test)")
    print("=" * 60)
    
    proc1 = subprocess.Popen(
        [sys.executable, script_path, "--profile", "auto_test", "--duration", "60"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    print(f"✅ 第一个进程已启动 (PID={proc1.pid})")
    
    # Wait for first instance to initialize
    print("\n⏱️  等待第一个实例初始化 (10秒)...")
    time.sleep(10)
    
    # Read some output from first process
    print("\n📋 第一个实例的输出:")
    print("-" * 60)
    for _ in range(10):
        line = proc1.stdout.readline()
        if line:
            print(f"   {line.rstrip()}")
    print("-" * 60)
    
    # Test 2: Launch second instance with same profile
    print("\n" + "=" * 60)
    print("步骤 2: 启动第二个实例 (相同profile=auto_test)")
    print("=" * 60)
    print("⚠️ 预期行为: 应该杀掉第一个实例并启动新实例\n")
    
    proc2 = subprocess.Popen(
        [sys.executable, script_path, "--profile", "auto_test", "--duration", "20", "--url", "https://example.org"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    print(f"✅ 第二个进程已启动 (PID={proc2.pid})")
    
    # Wait a bit for second instance to kill first
    print("\n⏱️  等待第二个实例接管 (5秒)...")
    time.sleep(5)
    
    # Check if first process is still running
    print("\n🔍 检查第一个进程状态...")
    poll1 = proc1.poll()
    if poll1 is None:
        print(f"❌ 第一个进程 (PID={proc1.pid}) 仍在运行")
        print("   这不应该发生！互斥功能可能有问题")
        
        # Kill it manually
        print(f"   手动终止第一个进程...")
        proc1.terminate()
        proc1.wait(timeout=5)
        result = False
    else:
        print(f"✅ 第一个进程已被终止 (退出码={poll1})")
        result = True
    
    # Read output from second process
    print("\n📋 第二个实例的输出:")
    print("-" * 60)
    for _ in range(15):
        line = proc2.stdout.readline()
        if line:
            print(f"   {line.rstrip()}")
    print("-" * 60)
    
    # Wait for second process to complete
    print("\n⏱️  等待第二个进程完成...")
    try:
        proc2.wait(timeout=25)
        print(f"✅ 第二个进程已完成 (退出码={proc2.returncode})")
    except subprocess.TimeoutExpired:
        print("⚠️ 第二个进程超时，手动终止...")
        proc2.terminate()
        proc2.wait(timeout=5)
    
    # Cleanup
    print("\n🧹 清理...")
    for proc in [proc1, proc2]:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except:
                proc.kill()
    
    print("\n" + "=" * 60)
    if result:
        print("✅ 测试通过！Profile互斥功能正常工作")
    else:
        print("❌ 测试失败！Profile互斥功能有问题")
    print("=" * 60)
    
    return result


if __name__ == "__main__":
    try:
        success = test_profile_mutex_automated()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

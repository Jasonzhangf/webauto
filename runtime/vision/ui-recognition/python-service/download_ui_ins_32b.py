#!/usr/bin/env python3
"""
下载UI-Ins-32B模型脚本
"""

import os
from pathlib import Path
import subprocess
import sys

def check_dependencies():
    """检查必要的依赖"""
    try:
        import torch
        from huggingface_hub import snapshot_download
        print("✅ 依赖检查通过")
        return True
    except ImportError as e:
        print(f"❌ 缺少依赖: {e}")
        print("请安装: pip install torch huggingface_hub")
        return False

def download_ui_ins_32b():
    """下载UI-Ins-32B模型"""
    model_name = "Qwen/UI-Ins-32B"
    local_path = "./models/ui-ins-32b"

    # 设置镜像
    os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'

    print(f"开始下载模型: {model_name}")
    print(f"保存路径: {local_path}")
    print("⚠️  32B模型较大，预计需要20GB+存储空间")

    try:
        from huggingface_hub import snapshot_download

        # 下载模型
        snapshot_download(
            repo_id=model_name,
            local_dir=local_path,
            local_dir_use_symlinks=False,
            token=os.getenv('HF_TOKEN', None)  # 如果需要token
        )

        print("✅ UI-Ins-32B模型下载完成")
        return True

    except Exception as e:
        print(f"❌ 下载失败: {e}")
        return False

def cleanup_unwanted_models():
    """清理不需要的模型"""
    models_dir = Path("./models")

    # 需要保留的模型
    keep_models = ["ui-ins-7b", "ui-ins-32b"]

    print("🧹 清理不需要的模型...")

    for model_dir in models_dir.iterdir():
        if model_dir.is_dir() and model_dir.name not in keep_models:
            print(f"删除模型: {model_dir.name}")
            import shutil
            shutil.rmtree(model_dir)
            print(f"✅ 已删除: {model_dir.name}")

def check_disk_space():
    """检查磁盘空间"""
    import shutil
    total, used, free = shutil.disk_usage("./")
    free_gb = free // (1024**3)

    print(f"可用磁盘空间: {free_gb}GB")

    if free_gb < 25:
        print("⚠️  磁盘空间不足，建议至少25GB可用空间")
        return False

    return True

def main():
    print("🤖 UI-Ins-32B模型下载工具")
    print("=" * 50)

    # 检查磁盘空间
    if not check_disk_space():
        print("磁盘空间不足，退出")
        return

    # 检查依赖
    if not check_dependencies():
        return

    # 询问是否继续
    response = input("是否继续下载UI-Ins-32B模型？(y/N): ")
    if response.lower() not in ['y', 'yes']:
        print("取消下载")
        return

    # 下载模型
    if download_ui_ins_32b():
        # 清理不需要的模型
        cleanup_response = input("是否清理不需要的模型？(y/N): ")
        if cleanup_response.lower() in ['y', 'yes']:
            cleanup_unwanted_models()

        print("🎉 模型配置完成")
    else:
        print("❌ 模型下载失败")

if __name__ == "__main__":
    main()
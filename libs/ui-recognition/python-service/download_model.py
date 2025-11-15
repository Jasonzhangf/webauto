#!/usr/bin/env python3
"""
Model Download Script
使用HF-Mirror下载Qwen2.5-VL模型
"""

import os
import sys
from pathlib import Path

# 设置镜像
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'

try:
    from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
    from huggingface_hub import snapshot_download
    print("✅ 依赖检查通过")
except ImportError as e:
    print(f"❌ 缺少依赖: {e}")
    print("请安装: pip install transformers huggingface_hub")
    sys.exit(1)

def download_qwen_model():
    """下载Qwen2.5-VL模型"""
    model_id = "Qwen/Qwen2.5-VL-7B-Instruct"

    print(f"🔄 开始下载模型: {model_id}")
    print("使用HF-Mirror镜像加速下载...")

    try:
        # 下载模型文件
        print("📦 下载模型文件...")
        model_path = snapshot_download(
            repo_id=model_id,
            local_dir="./models/qwen2.5-vl-7b-instruct",
            local_dir_use_symlinks=False
        )

        print(f"✅ 模型下载完成: {model_path}")

        # 测试加载
        print("🧪 测试模型加载...")
        processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)
        model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            model_path,
            torch_dtype="auto",
            device_map="auto",
            trust_remote_code=True
        ).eval()

        print("✅ 模型加载测试成功")
        return model_path

    except Exception as e:
        print(f"❌ 下载失败: {e}")
        return None

def download_ui_ins_model():
    """尝试下载UI-Ins模型"""
    model_id = "Tongyi-MiA/UI-Ins-7B"

    print(f"🔄 尝试下载UI-Ins模型: {model_id}")

    try:
        # 下载模型文件
        print("📦 下载UI-Ins模型文件...")
        model_path = snapshot_download(
            repo_id=model_id,
            local_dir="./models/ui-ins-7b",
            local_dir_use_symlinks=False
        )

        print(f"✅ UI-Ins模型下载完成: {model_path}")
        return model_path

    except Exception as e:
        print(f"⚠️  UI-Ins模型下载失败: {e}")
        print("将使用Qwen2.5-VL作为替代")
        return None

if __name__ == "__main__":
    print("🚀 模型下载脚本")
    print("=" * 50)

    # 确保模型目录存在
    Path("./models").mkdir(exist_ok=True)

    # 首先尝试下载UI-Ins模型
    ui_ins_path = download_ui_ins_model()

    # 如果UI-Ins下载失败，下载Qwen2.5-VL
    qwen_path = download_qwen_model()

    if qwen_path:
        print("\n🎉 下载完成！")
        print(f"Qwen2.5-VL模型路径: {qwen_path}")
        if ui_ins_path:
            print(f"UI-Ins模型路径: {ui_ins_path}")
    else:
        print("\n❌ 所有模型下载失败")
        sys.exit(1)
#!/usr/bin/env python3
"""
真正的UI-Ins-7B服务
基于阿里通义UI-Ins-7B模型的UI识别服务
"""

import base64
import json
import time
import re
import io
import os
import argparse
from typing import Dict, List, Any, Optional, Tuple
from PIL import Image
import numpy as np
import torch
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class UIIns7BService:
    def __init__(self, model_path: str = "./models/ui-ins-7b"):
        self.model_path = model_path
        self.model = None
        self.processor = None
        self.model_loaded = False

    def load_model(self):
        """加载UI-Ins-7B模型"""
        try:
            logger.info("开始加载UI-Ins-7B模型...")

            # 检查模型文件
            if not os.path.exists(self.model_path):
                raise FileNotFoundError(f"模型路径不存在: {self.model_path}")

            # 检查必要文件
            required_files = ['config.json', 'tokenizer.json']
            for file in required_files:
                if not os.path.exists(os.path.join(self.model_path, file)):
                    raise FileNotFoundError(f"缺少必要文件: {file}")

            logger.info("✅ 模型文件检查通过")

            # 加载处理器
            logger.info("加载处理器...")
            self.processor = AutoProcessor.from_pretrained(
                self.model_path,
                trust_remote_code=True,
                local_files_only=True
            )
            logger.info("✅ 处理器加载成功")

            # 加载模型 - 使用官方推荐的参数
            logger.info("加载模型权重...")
            device = "mps" if torch.backends.mps.is_available() else "cpu"
            logger.info(f"使用设备: {device}")

            if device == "mps":
                logger.info("⚠️ MPS设备不支持bfloat16，使用float32")
                self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                    self.model_path,
                    torch_dtype=torch.float32,
                    device_map="auto",
                    trust_remote_code=True,
                    local_files_only=True,
                    low_cpu_mem_usage=True
                ).eval()
            else:
                self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                    self.model_path,
                    torch_dtype=torch.bfloat16,
                    device_map="auto",
                    trust_remote_code=True,
                    local_files_only=True,
                    low_cpu_mem_usage=True
                ).eval()

            self.model_loaded = True
            logger.info("✅ UI-Ins-7B模型加载完成")

        except Exception as e:
            logger.error(f"❌ UI-Ins-7B模型加载失败: {e}")
            raise RuntimeError(f"UI-Ins-7B模型加载失败: {e}")

    def _decode_image(self, image_data: str) -> Image.Image:
        """解码base64图像"""
        try:
            # 移除data URL前缀
            if image_data.startswith('data:image'):
                image_data = image_data.split(',')[1]

            image_bytes = base64.b64decode(image_data)
            image = Image.open(io.BytesIO(image_bytes))

            # 转换为RGB格式
            if image.mode != 'RGB':
                image = image.convert('RGB')

            return image

        except Exception as e:
            raise ValueError(f"无法解码图像: {e}")

    def _parse_coordinates(self, response_text: str) -> Tuple[int, int]:
        """从响应中解析坐标 - 使用UI-Ins-7B官方格式"""
        try:
            # 查找JSON格式的function_call
            if '<function_call>' in response_text and '</function_call>' in response_text:
                func_start = response_text.find('<function_call>') + len('<function_call>')
                func_end = response_text.find('</function_call>')
                func_content = response_text[func_start:func_end].strip()

                # 移除可能的代码块标记
                func_content = func_content.replace('```json', '').replace('```', '').strip()

                func_data = json.loads(func_content)
                if 'arguments' in func_data and 'coordinate' in func_data['arguments']:
                    coordinate = func_data['arguments']['coordinate']
                    if isinstance(coordinate, list) and len(coordinate) >= 2:
                        return coordinate[0], coordinate[1]

            # 如果没有找到function_call，尝试直接查找坐标
            coord_match = re.search(r'\[(\d+)\s*,\s*(\d+)\]', response_text)
            if coord_match:
                return map(int, coord_match.groups())

            return -1, -1

        except Exception as e:
            logger.warning(f"坐标解析失败: {e}")
            return -1, -1

    def recognize_ui_elements(self, image: Image.Image, query: str) -> Dict[str, Any]:
        """使用UI-Ins-7B识别UI元素"""
        if not self.model_loaded:
            self.load_model()

        try:
            start_time = time.time()
            logger.info(f"执行UI-Ins-7B推理: {query}")

            # 构建UI-Ins-7B官方GUI agent格式
            # 与官方示例保持一致的系统消息与格式说明
            sys_msg_1 = "You are a helpful assistant."
            sys_msg_2 = (
                "You are a GUI agent. You are given a task and your action history, with screenshots. "
                "You need to perform the next action to complete the task.\n\n"
                "## Output Format\n"
                "Return a json object with a reasoning process in <reasoning> tags, a function name and arguments within <function_call> XML tags:\n```
<reasoning>\n...\n</reasoning>\n\n\n"
                "<function_call>\n{\"name\": \"grounding\", \"arguments\": {\"action\": \"click\", \"coordinate\": [x, y]}}\n</function_call>\n```
 represents the following item of the action space:\n"
                "## Action Space{\"action\": \"click\", \"coordinate\": [x, y]}\n"
                "Your task is to accurately locate a UI element based on the instruction. "
                "You should first analyze instruction in <reasoning> tags and finally output the function in <function_call> tags."
            )

            messages = [
                {
                    "role": "system",
                    "content": [
                        {"type": "text", "text": sys_msg_1},
                        {"type": "text", "text": sys_msg_2}
                    ]
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "image"},
                        {"type": "text", "text": query}
                    ]
                }
            ]

            # 应用聊天模板
            prompt = self.processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )

            # 处理输入
            inputs = self.processor(
                text=[prompt], images=[image], return_tensors="pt"
            ).to(self.model.device)

            # 生成响应
            # 官方示例默认生成长度
            max_tokens = 128
            with torch.no_grad():
                generated_ids = self.model.generate(
                    **inputs,
                    max_new_tokens=max_tokens,
                    do_sample=False,
                    temperature=0.0,
                    pad_token_id=self.processor.tokenizer.eos_token_id
                )

            # 解码响应
            response_ids = generated_ids[0, len(inputs["input_ids"][0]):]
            raw_response = self.processor.decode(response_ids, skip_special_tokens=True)

            logger.info(f"原始响应: {raw_response}")

            # 解析坐标
            point_x, point_y = self._parse_coordinates(raw_response)

            processing_time = time.time() - start_time

            # 构建响应
            elements = []
            actions = []

            if point_x != -1 and point_y != -1:
                # 获取原始图像尺寸
                original_size = image.size

                # 获取resize后的图像尺寸
                _, _, resized_height, resized_width = inputs['pixel_values'].shape

                # 计算归一化坐标
                norm_x = point_x / resized_width
                norm_y = point_y / resized_height

                # 转换为原始图像坐标
                real_x = int(norm_x * original_size[0])
                real_y = int(norm_y * original_size[1])

                # 创建边界框
                bbox_size = 30  # 边界框大小
                bbox = [
                    max(0, real_x - bbox_size // 2),
                    max(0, real_y - bbox_size // 2),
                    min(original_size[0], real_x + bbox_size // 2),
                    min(original_size[1], real_y + bbox_size // 2)
                ]

                elements.append({
                    "bbox": bbox,
                    "text": query,
                    "type": "ui_element",
                    "confidence": 0.95,  # UI-Ins-7B通常给出高置信度
                    "description": f"UI-Ins-7B识别的UI元素，坐标: ({real_x}, {real_y})",
                    "raw_coordinates": [point_x, point_y],
                    "normalized_coordinates": [norm_x, norm_y]
                })

                # 生成操作建议
                if any(action in query.lower() for action in ["click", "点击", "tap", "press"]):
                    actions.append({
                        "type": "click",
                        "target": {"bbox": bbox},
                        "reason": f"UI-Ins-7B根据指令 '{query}' 定位并点击UI元素"
                    })

            return {
                "request_id": 1,
                "response": raw_response,
                "elements": elements,
                "actions": actions,
                "processing_time": processing_time,
                "device": str(self.model.device),
                "model_info": {
                    "model": "UI-Ins-7B",
                    "framework": "PyTorch",
                    "architecture": "Qwen2.5-VL",
                    "format": "GUI Agent"
                }
            }

        except Exception as e:
            logger.error(f"UI-Ins-7B识别失败: {e}")
            raise RuntimeError(f"UI-Ins-7B识别失败: {e}")

# FastAPI应用
app = FastAPI(title="UI-Ins-7B Recognition Service", version="1.0.0")

# 全局服务实例
ui_ins_service = UIIns7BService()

class RecognitionRequest(BaseModel):
    request_id: int
    image: str
    query: str = "识别页面中的可交互元素"
    scope: str = "full"
    region: Optional[Dict[str, int]] = None
    parameters: Dict[str, Any] = {}

class RecognitionResponse(BaseModel):
    request_id: int
    response: str
    elements: List[Dict[str, Any]]
    actions: List[Dict[str, Any]]
    processing_time: float
    device: str
    model_info: Dict[str, str]

@app.on_event("startup")
async def startup_event():
    """服务启动事件"""
    logger.info("🚀 启动UI-Ins-7B识别服务")
    logger.info("🤖 模型: UI-Ins-7B (阿里通义)")
    logger.info("🎯 功能: GUI Grounding & UI Element Recognition")
    logger.info("📐 格式: Official GUI Agent Format")

@app.on_event("shutdown")
async def shutdown_event():
    """服务关闭事件"""
    logger.info("🔄 关闭UI-Ins-7B识别服务")

@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {
        "status": "healthy",
        "model_loaded": ui_ins_service.model_loaded,
        "model_path": ui_ins_service.model_path,
        "model": "UI-Ins-7B",
        "framework": "PyTorch",
        "version": "1.0.0",
        "dependencies": {
            "torch": True,
            "transformers": True,
            "fastapi": True
        }
    }

@app.post("/recognize", response_model=RecognitionResponse)
async def recognize_ui_elements(request: RecognitionRequest):
    """UI元素识别端点"""
    try:
        # 解码图像
        image = ui_ins_service._decode_image(request.image)

        # 执行UI识别
        result = ui_ins_service.recognize_ui_elements(image, request.query)

        return RecognitionResponse(**result)

    except Exception as e:
        logger.error(f"识别请求失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="UI-Ins-7B Recognition Service")
    parser.add_argument("--host", default="0.0.0.0", help="服务主机地址")
    parser.add_argument("--port", type=int, default=8899, help="服务端口")
    # 默认使用相对于当前文件的模型目录
    default_model_dir = os.environ.get("UI_INS_MODEL_PATH") or os.path.join(os.path.dirname(__file__), "models", "ui-ins-7b")
    parser.add_argument("--model-path", default=default_model_dir, help="模型路径")
    args = parser.parse_args()

    # 允许通过命令行覆盖模型路径
    try:
        ui_ins_service.model_path = args.model_path
    except Exception:
        pass

    uvicorn.run(
        "ui_ins_server:app",
        host=args.host,
        port=args.port,
        reload=False,
        log_level="info"
    )

#!/usr/bin/env python3
"""
MLX LLaVA UI Recognition Service
- Based on Apple's MLX LLaVA example (architecture & generation loop)
- Provides a FastAPI server compatible with our Vision Proxy

Notes
- Requires: mlx, transformers, huggingface_hub, pillow, fastapi, uvicorn, numpy, requests
- Downloads the MLX LLaVA helper modules (llava.py/language.py/vision.py) from
  ml-explore/mlx-examples at runtime into a local third_party folder if absent.
- Default model: "llava-hf/llava-1.5-7b-hf"
- Output: tries to follow UI-Ins function_call format; falls back to [x, y] pattern
"""

import os
import io
import re
import json
import time
import base64
import argparse
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

try:
    import requests
    import mlx.core as mx
    from transformers import AutoProcessor
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn
    HAS_DEPS = True
except Exception as e:
    print(f"[mlx-llava] Missing deps: {e}")
    HAS_DEPS = False

log = logging.getLogger("mlx_llava")
logging.basicConfig(level=logging.INFO)

LLAVA_FILES = {
    "llava.py": "https://raw.githubusercontent.com/ml-explore/mlx-examples/main/llava/llava.py",
    "language.py": "https://raw.githubusercontent.com/ml-explore/mlx-examples/main/llava/language.py",
    "vision.py": "https://raw.githubusercontent.com/ml-explore/mlx-examples/main/llava/vision.py",
}


def ensure_llava_modules(dst_dir: Path) -> Path:
    dst_dir.mkdir(parents=True, exist_ok=True)
    for name, url in LLAVA_FILES.items():
        p = dst_dir / name
        if not p.exists():
            log.info(f"Downloading {name} from {url}")
            r = requests.get(url, timeout=30)
            r.raise_for_status()
            p.write_bytes(r.content)
    return dst_dir


def import_llava_from(dst_dir: Path):
    import importlib.util
    import sys

    if str(dst_dir) not in sys.path:
        sys.path.insert(0, str(dst_dir))

    spec = importlib.util.spec_from_file_location("llava", dst_dir / "llava.py")
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class RecognitionRequest(BaseModel):
    request_id: int
    image: str
    query: str = "识别页面中的可交互元素"
    scope: str = "full"
    region: Optional[Dict[str, int]] = None
    parameters: Dict[str, Any] = {}


class RecognitionResponse(BaseModel):
    request_id: int
    success: bool
    elements: List[Dict] = []
    actions: List[Dict] = []
    analysis: Optional[str] = None
    confidence: float = 0.0
    processing_time: float = 0.0
    error: Optional[str] = None


class MLXLlavaService:
    def __init__(self, model_path: str = "llava-hf/llava-1.5-7b-hf", workdir: Optional[Path] = None):
        self.model_path = model_path
        self.model = None
        self.processor = None
        self.model_loaded = False
        self.workdir = workdir or Path(os.path.dirname(__file__)) / "third_party" / "mlx_llava"
        self.llava_module = None

    def _decode_image(self, image_data: str) -> Image.Image:
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        img_bytes = base64.b64decode(image_data)
        img = Image.open(io.BytesIO(img_bytes))
        if img.mode != 'RGB':
            img = img.convert('RGB')
        return img

    def _build_prompt(self, user_query: str) -> str:
        # LLaVA expects a chat-like prompt with <image> placeholder
        sys1 = "You are a helpful assistant."
        sys2 = (
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

        # LLaVA convention: "USER: <image>\n...\nASSISTANT:"
        prompt = f"USER: <image>\n{sys1}\n{sys2}\nInstruction: {user_query}\nASSISTANT:"
        return prompt

    def _parse_coordinates(self, text: str) -> Tuple[int, int]:
        try:
            if '<function_call>' in text and '</function_call>' in text:
                s = text.find('<function_call>') + len('<function_call>')
                e = text.find('</function_call>')
                c = text[s:e].strip().replace('```json', '').replace('```', '').strip()
                data = json.loads(c)
                if isinstance(data, dict):
                    args = data.get('arguments') or {}
                    coord = args.get('coordinate')
                    if isinstance(coord, list) and len(coord) >= 2:
                        return int(coord[0]), int(coord[1])
            # fallback: [x, y]
            m = re.search(r"\[(\d+)\s*,\s*(\d+)\]", text)
            if m:
                return int(m.group(1)), int(m.group(2))
        except Exception as e:
            log.warning(f"coord parse failed: {e}")
        return -1, -1

    def load(self):
        if self.model_loaded:
            return
        # ensure llava helper modules
        ensure_llava_modules(self.workdir)
        self.llava_module = import_llava_from(self.workdir)

        # load processor/model
        self.processor = AutoProcessor.from_pretrained(self.model_path)
        self.model = self.llava_module.LlavaModel.from_pretrained(self.model_path)
        self.model_loaded = True
        log.info("MLX LLaVA loaded.")

    def _prepare_inputs(self, image: Image.Image, prompt: str):
        inputs = self.processor(image, prompt, return_tensors="np")
        pixel_values = mx.array(inputs["pixel_values"])  # [B, C, H, W]
        input_ids = mx.array(inputs["input_ids"])       # [B, T]
        return pixel_values, input_ids

    def generate(self, image: Image.Image, prompt: str, max_tokens: int = 128, temperature: float = 0.0) -> str:
        pixel_values, input_ids = self._prepare_inputs(image, prompt)
        logits, cache = self.model(input_ids, pixel_values)
        logits = logits[:, -1, :]
        y = self._sample(logits, temperature)
        tokens = [int(y.item())]

        eos_id = getattr(self.processor.tokenizer, 'eos_token_id', None)

        for _ in range(max_tokens - 1):
            logits, cache = self.model.language_model(y[None], cache=cache)
            logits = logits[:, -1, :]
            y = self._sample(logits, temperature)
            tok = int(y.item())
            if eos_id is not None and tok == int(eos_id):
                break
            tokens.append(tok)

        return self.processor.tokenizer.decode(tokens)

    def _sample(self, logits: mx.array, temperature: float = 0.0) -> mx.array:
        if temperature <= 0:
            return mx.argmax(logits, axis=-1)
        return mx.random.categorical(logits * (1.0 / temperature))

    def recognize(self, req: RecognitionRequest) -> RecognitionResponse:
        t0 = time.time()
        try:
            if not self.model_loaded:
                self.load()
            img = self._decode_image(req.image)
            prompt = self._build_prompt(req.query)
            out = self.generate(img, prompt, max_tokens=min(128, req.parameters.get('max_tokens', 128)), temperature=float(req.parameters.get('temperature', 0.0)))

            # parse coordinates
            x, y = self._parse_coordinates(out)
            elements: List[Dict[str, Any]] = []
            actions: List[Dict[str, Any]] = []

            if x >= 0 and y >= 0:
                w, h = img.size
                bbox_size = 30
                bbox = [max(0, x - bbox_size // 2), max(0, y - bbox_size // 2), min(w, x + bbox_size // 2), min(h, y + bbox_size // 2)]
                elements.append({
                    "bbox": bbox,
                    "text": req.query,
                    "type": "ui_element",
                    "confidence": 0.7,
                    "description": f"LLaVA-MLX predicted point: ({x}, {y})"
                })
                if any(a in req.query.lower() for a in ["click", "点击", "tap", "press"]):
                    actions.append({
                        "type": "click",
                        "target": {"bbox": bbox},
                        "reason": f"According to instruction '{req.query}', click the element"
                    })

            return RecognitionResponse(
                request_id=req.request_id,
                success=True,
                elements=elements,
                actions=actions,
                analysis=out,
                confidence=0.7 if elements else 0.0,
                processing_time=time.time() - t0
            )
        except Exception as e:
            log.error(f"recognize failed: {e}")
            return RecognitionResponse(
                request_id=req.request_id,
                success=False,
                error=str(e),
                processing_time=time.time() - t0
            )


app = FastAPI(title="MLX LLaVA UI Recognition", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

service: Optional[MLXLlavaService] = None


@app.on_event("startup")
def _startup():
    global service
    service = MLXLlavaService()
    # Lazy load at first request to avoid blocking startup
    log.info("MLX LLaVA service ready (lazy load).")


@app.get("/health")
def health():
    return {
        "status": "healthy" if HAS_DEPS else "degraded",
        "deps": {"mlx": HAS_DEPS},
        "model_loaded": bool(service and service.model_loaded),
        "model_path": service.model_path if service else None,
        "framework": "MLX",
        "model": "llava-1.5-7b-hf",
    }


@app.post("/recognize", response_model=RecognitionResponse)
def recognize(req: RecognitionRequest):
    global service
    if not service:
        raise HTTPException(status_code=503, detail="Service not initialized")
    return service.recognize(req)


def main():
    parser = argparse.ArgumentParser(description="MLX LLaVA UI Recognition Service")
    parser.add_argument("--host", default="0.0.0.0",
                        help="Host to bind")
    parser.add_argument("--port", type=int, default=8899,
                        help="Port to listen on")
    parser.add_argument("--model-path", default=os.environ.get("MLX_LLAVA_MODEL", "llava-hf/llava-1.5-7b-hf"),
                        help="HF repo or local path for LLaVA model")
    args = parser.parse_args()

    global service
    service = MLXLlavaService(model_path=args.model_path)
    uvicorn.run("mlx_llava_server:app", host=args.host, port=args.port, reload=False, log_level="info")


if __name__ == "__main__":
    if not HAS_DEPS:
        print("[mlx-llava] Please install: pip install mlx transformers huggingface_hub pillow fastapi uvicorn numpy requests")
    main()


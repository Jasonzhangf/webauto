# 端口与环境变量

默认端口：
- Orchestrator：`PORT_ORCH=7700`
- Workflow API：`PORT_WORKFLOW=7701`
- Vision Proxy：`PORT_VISION=7702`
- Python 识别服务：`PORT_PY_VISION=8899`

可用环境变量：
```
PORT_ORCH=7700
PORT_WORKFLOW=7701
PORT_VISION=7702
PORT_PY_VISION=8899
PYTHON_BIN=python3
PY_SERVICE_ENTRY=sharedmodule/ui-recognition/python-service/ui_ins_server.py
```

可选的 Python 服务入口（通过设置 `PY_SERVICE_ENTRY` 覆盖）：
- 官方Qwen/PT版（默认）：`sharedmodule/ui-recognition/python-service/ui_ins_server.py`
- MLX实验版（Apple Silicon，仅在必要时启用）：`sharedmodule/ui-recognition/python-service/mlx_ui_server.py`
- MLX LLaVA 版（Apple Silicon，真实视觉推理）：`sharedmodule/ui-recognition/python-service/mlx_llava_server.py`

注意：使用 MLX 实验版时，默认不做模型格式转换以降低内存风险；如需转换需显式添加 `--enable-convert` 或设置 `MLX_ENABLE_CONVERSION=1`。
Mock 服务已移除默认入口，不再推荐使用。

MLX LLaVA 模式（推荐在 Apple Silicon 本机替代）：
- 依赖：`pip install mlx transformers huggingface_hub pillow fastapi uvicorn numpy requests`
- 默认模型：`llava-hf/llava-1.5-7b-hf`
- 启动：将 `PY_SERVICE_ENTRY` 设为 `sharedmodule/ui-recognition/python-service/mlx_llava_server.py`
- 可选覆盖：`MLX_LLAVA_MODEL` 指定模型（HF仓库或本地路径）

端口占用策略：
- 拉起前使用 `lsof -ti :PORT | xargs kill -9`（macOS/Linux）
- Windows 兼容在实现时按需添加

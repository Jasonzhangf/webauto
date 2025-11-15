Model directory (local only)

- Place downloaded models here to run the Python services offline.
- Recommended structure:
  - ui-ins-7b/ (PyTorch, Qwen/Qwen2.5-VL-7B-Instruct compatible)
  - llava-1.5-7b-hf/ (MLX LLaVA)

Environment variables
- UI_INS_MODEL_PATH: override UI-Ins model path
- MLX_LLAVA_MODEL:   override LLaVA model path

Note: This folder is ignored by git (.gitignore).


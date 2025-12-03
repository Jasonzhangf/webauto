"""Ensure functional modules under runtime are importable by legacy module names."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODULES = [
    ROOT / 'runtime' / 'browser',
    ROOT / 'runtime' / 'containers',
    ROOT / 'runtime' / 'ui',
    ROOT / 'runtime' / 'vision',
    ROOT / 'runtime' / 'infra',
]
for module_dir in MODULES:
    if module_dir.exists():
        path_str = str(module_dir)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)

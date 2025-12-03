"""Shared filesystem locations for browser runtime artifacts."""
from __future__ import annotations

import os
from pathlib import Path


def _resolve_data_root() -> Path:
    base = os.environ.get('WEBAUTO_DATA_DIR')
    if base:
        return Path(base).expanduser()
    return Path.home() / '.webauto'


def _ensure(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


DATA_ROOT = _resolve_data_root()
COOKIES_DIR = _ensure(DATA_ROOT / 'cookies')
PROFILES_DIR = _ensure(DATA_ROOT / 'profiles')
LOCKS_DIR = _ensure(DATA_ROOT / 'locks')
CONTAINER_LIB_DIR = _ensure(DATA_ROOT / 'container-lib')

__all__ = [
    'DATA_ROOT',
    'COOKIES_DIR',
    'PROFILES_DIR',
    'LOCKS_DIR',
    'CONTAINER_LIB_DIR',
]

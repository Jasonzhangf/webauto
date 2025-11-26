"""
CLI配置管理
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional


def load_config(config_file: Optional[str] = None) -> Dict[str, Any]:
    """加载配置文件"""
    if config_file is None:
        config_file = os.path.expanduser('~/.webauto-cli.json')

    config_path = Path(config_file)
    default_config = {
        'websocket_url': 'ws://localhost:8765',
        'default_capabilities': ['dom', 'screenshot'],
        'output_format': 'table',
        'timeout': 30000,
        'retry_count': 3
    }

    if config_path.exists():
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                user_config = json.load(f)
                # 合并默认配置和用户配置
                default_config.update(user_config)
        except Exception as error:
            print(f"Warning: Failed to load config file {config_file}: {error}")

    return default_config


def save_config(config: Dict[str, Any], config_file: Optional[str] = None) -> bool:
    """保存配置文件"""
    if config_file is None:
        config_file = os.path.expanduser('~/.webauto-cli.json')

    config_path = Path(config_file)
    try:
        # 确保配置目录存在
        config_path.parent.mkdir(parents=True, exist_ok=True)

        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)

        return True

    except Exception as error:
        print(f"Error: Failed to save config file {config_file}: {error}")
        return False


def get_default_session() -> Optional[str]:
    """获取默认会话ID"""
    return os.getenv('WEBAUTO_SESSION_ID')
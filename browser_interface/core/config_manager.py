"""
Configuration Manager implementation - manages browser configuration with layered approach.
"""

from __future__ import annotations
from typing import Dict, Any, Optional
import json
import os
from pathlib import Path

from .interfaces import IConfigManager


class ConfigManager(IConfigManager):
    """Layered configuration management with environment and user overrides"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.config_file = Path(config.get('config_file', 'config.json'))
        self.user_config_file = Path(config.get('user_config_file', 'user_config.json'))
        self.config_dir = Path(config.get('config_dir', './config'))

        # Ensure config directory exists
        self.config_dir.mkdir(exist_ok=True)

        # Default configuration layers
        self._default_config = {
            'debug': {
                'remote_debugging': False,
                'headless': False,
                'auto_overlay': False,
                'auto_session': True,
                'auto_save': True,
                'auto_save_interval': 30.0
            },
            'browser': {
                'viewport': {'width': 1440, 'height': 900},
                'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            'session': {
                'default_profile': 'default',
                'cookie_dir': './cookies'
            }
        }

        print("⚙️ 配置管理器初始化完成")

    def get_config(self, key: str, default: Any = None) -> Any:
        """Get configuration value with layer precedence"""
        # Check user config first (highest priority)
        if key in self._load_user_config():
            return self._load_user_config()[key]

        # Check system config (medium priority)
        if key in self._load_system_config():
            return self._load_system_config()[key]

        # Use default (lowest priority)
        return self._default_config.get(key, default)

    def set_config(self, key: str, value: Any) -> None:
        """Set configuration value to user config"""
        user_config = self._load_user_config()
        user_config[key] = value
        self._save_user_config(user_config)
        print(f"💾 用户配置已更新: {key} = {value}")

    def _load_user_config(self) -> Dict[str, Any]:
        """Load user configuration from file"""
        if self.user_config_file.exists():
            try:
                with open(self.user_config_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"⚠️ 加载用户配置失败: {str(e)}")
                return {}
        return {}

    def _save_user_config(self, config: Dict[str, Any]) -> None:
        """Save user configuration to file"""
        self.user_config_file.parent.mkdir(exist_ok=True)
        try:
            with open(self.user_config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
        except Exception as e:
                print(f"⚠️ 保存用户配置失败: {str(e)}")

    def _load_system_config(self) -> Dict[str, Any]:
        """Load system configuration from file"""
        config_file = self.config_dir / 'system_config.json'
        if config_file.exists():
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"⚠️ 加载系统配置失败: {str(e)}")
                return {}
        return {}

    def _save_system_config(self, config: Dict[str, Any]) -> None:
        """Save system configuration to file"""
        config_file = self.config_dir / 'system_config.json'
        self.config_dir.mkdir(exist_ok=True)

        try:
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
        except Exception as e:
                print(f"⚠️ 保存系统配置失败: {str(e)}")

    def get_all_configs(self) -> Dict[str, Dict[str, Any]]:
        """Get merged configuration from all layers"""
        user_config = self._load_user_config()
        system_config = self._load_system_config()
        default_config = self._default_config

        # Merge configurations (user > system > default)
        merged_config = {}

        # Start with defaults
        for category, defaults in default_config.items():
            merged_config[category] = defaults.copy()

        # Override with system config
        for category, config in system_config.items():
            merged_config[category] = config

        # Override with user config (highest priority)
        for category, config in user_config.items():
            merged_config[category] = config

        return merged_config

    def validate_config(self, key: str, value: Any) -> bool:
        """Validate configuration value"""
        # Basic validation rules
        if key == 'viewport':
            return isinstance(value, dict) and 'width' in value and 'height' in value
        elif key == 'auto_save_interval':
            return isinstance(value, (int, float)) and value > 0
        elif key == 'debug_port':
            return isinstance(value, int) and 1000 <= value <= 9999

        # Accept most values, validation will be done by individual components
        return True

    def cleanup(self) -> None:
        """Cleanup configuration manager"""
        print("🧹 配置管理器清理完成")


__all__ = ["ConfigManager"]
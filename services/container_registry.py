"""
容器注册表 - 负责从 container-library.json 读取 / 写入容器定义
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Any, Optional
from urllib.parse import urlparse


PROJECT_ROOT = Path(__file__).parent.parent
CONTAINER_LIB_PATH = PROJECT_ROOT / "container-library.json"


@dataclass
class ContainerDef:
  """单个容器定义的最小结构"""
  selector: str
  description: str = ""
  children: Optional[list[str]] = None
  actions: Optional[Dict[str, Any]] = None


def _load_registry() -> Dict[str, Any]:
  if not CONTAINER_LIB_PATH.exists():
    return {}
  try:
    with CONTAINER_LIB_PATH.open("r", encoding="utf-8") as f:
      return json.load(f)
  except Exception:
    return {}


def _save_registry(data: Dict[str, Any]) -> None:
  CONTAINER_LIB_PATH.parent.mkdir(parents=True, exist_ok=True)
  with CONTAINER_LIB_PATH.open("w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)


def _find_site_key_for_url(url: str, registry: Dict[str, Any]) -> Optional[str]:
  """根据 URL 匹配 container-library.json 顶层站点 key（如 'cbu' for 1688）"""
  try:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
  except Exception:
    host = ""

  best_key = None
  best_len = -1

  for key, value in registry.items():
    if not isinstance(value, dict):
      continue
    website = (value.get("website") or "").lower()
    if not website:
      continue
    if host.endswith(website) and len(website) > best_len:
      best_key = key
      best_len = len(website)

  return best_key


def get_containers_for_url(url: str) -> Dict[str, Any]:
  """为当前 URL 返回对应站点下的 containers 字典"""
  registry = _load_registry()
  site_key = _find_site_key_for_url(url, registry)
  if not site_key:
    return {}
  site = registry.get(site_key) or {}
  containers = site.get("containers") or {}
  return containers


def upsert_container_for_url(
  url: str,
  container_id: str,
  selector: str,
  description: str = "",
  parent_id: Optional[str] = None,
) -> Dict[str, Any]:
  """
  为给定 URL 新增 / 更新一个容器定义，并在必要时更新父容器的 children 列表。
  返回写回后的完整站点配置（包含 website/containers）。
  """
  registry = _load_registry()

  # 先尝试根据 URL 匹配已有站点；如果没有，则创建一个新的站点条目
  site_key = _find_site_key_for_url(url, registry)
  if not site_key:
    try:
      parsed = urlparse(url)
      host = parsed.hostname or ""
    except Exception:
      host = ""
    site_key = "site_auto"
    registry.setdefault(site_key, {"website": host, "containers": {}})

  site = registry.setdefault(site_key, {})
  containers = site.setdefault("containers", {})

  # 写入 / 覆盖容器本身
  existing = containers.get(container_id) or {}
  merged: Dict[str, Any] = {
    "selector": selector,
    "description": description or existing.get("description") or "",
  }
  # 保留已有 children / actions
  if "children" in existing:
    merged["children"] = existing["children"]
  if "actions" in existing:
    merged["actions"] = existing["actions"]

  containers[container_id] = merged

  # 维护父容器的 children 列表
  if parent_id:
    parent = containers.setdefault(parent_id, {"selector": "body", "children": []})
    children = parent.get("children") or []
    if container_id not in children:
      children.append(container_id)
    parent["children"] = children

  registry[site_key] = site
  _save_registry(registry)

  return site


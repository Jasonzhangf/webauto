"""
容器注册表 - 负责从 container-library.json 读取 / 写入容器定义
支持ContainerDefV2 schema和向后兼容
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Any, Optional, List
from urllib.parse import urlparse

# 导入v2模型
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
RUNTIME_ROOT = REPO_ROOT / "runtime"
if RUNTIME_ROOT.exists() and str(RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(RUNTIME_ROOT))
sys.path.append(str(REPO_ROOT))
from core.container.models_v2 import ContainerDefV2, convert_legacy_container_to_v2
from browser_interface.core.paths import CONTAINER_LIB_DIR


PROJECT_ROOT = Path(__file__).parent.parent
CONTAINER_LIB_PATH = PROJECT_ROOT / "container-library.json"
CONTAINER_INDEX_PATH = PROJECT_ROOT / "container-library.index.json"
USER_CONTAINER_ROOT = CONTAINER_LIB_DIR


@dataclass
class ContainerDef:
  """单个容器定义的最小结构"""
  selector: str
  description: str = ""
  children: Optional[list[str]] = None
  actions: Optional[Dict[str, Any]] = None


def _load_registry() -> Dict[str, Any]:
  if CONTAINER_INDEX_PATH.exists():
    return _load_registry_from_index()
  if not CONTAINER_LIB_PATH.exists():
    return _merge_user_sites_into_registry({})
  try:
    with CONTAINER_LIB_PATH.open("r", encoding="utf-8") as f:
      data = json.load(f)
      if isinstance(data, dict):
        return _merge_user_sites_into_registry(data)
      return _merge_user_sites_into_registry({})
  except Exception:
    return _merge_user_sites_into_registry({})


def _load_registry_from_index() -> Dict[str, Any]:
  try:
    index = json.loads(CONTAINER_INDEX_PATH.read_text(encoding="utf-8"))
  except Exception:
    return {}

  registry: Dict[str, Any] = {}
  for site_key, info in index.items():
    site_path = PROJECT_ROOT / info.get("path", "")
    containers = _collect_site_containers(site_path)
    registry[site_key] = {
      "website": info.get("website", ""),
      "containers": containers,
    }
  return _merge_user_sites_into_registry(registry)


def _collect_site_containers(site_path: Path) -> Dict[str, Any]:
  containers: Dict[str, Any] = {}
  if not site_path or not site_path.exists():
    return containers

  for container_file in site_path.rglob("container.json"):
    try:
      rel = container_file.relative_to(site_path)
    except ValueError:
      continue
    container_id = ".".join(rel.parent.parts)
    if not container_id:
      continue
    try:
      containers[container_id] = json.loads(container_file.read_text(encoding="utf-8"))
    except Exception:
      continue

  legacy_file = site_path / "containers.json"
  if legacy_file.exists():
    try:
      legacy_data = json.loads(legacy_file.read_text(encoding="utf-8"))
      legacy_containers = legacy_data.get("containers") or {}
      if isinstance(legacy_containers, dict):
        for cid, cdata in legacy_containers.items():
          containers.setdefault(cid, cdata)
    except Exception:
      pass

  return containers


def _merge_user_sites_into_registry(registry: Dict[str, Any]) -> Dict[str, Any]:
  if not USER_CONTAINER_ROOT.exists():
    return registry

  for user_site in USER_CONTAINER_ROOT.iterdir():
    if not user_site.is_dir():
      continue
    site_key = user_site.name
    site_entry = registry.setdefault(site_key, {
      "website": site_key,
      "containers": {}
    })
    user_containers = _collect_site_containers(user_site)
    if user_containers:
      site_entry.setdefault("containers", {})
      site_entry["containers"].update(user_containers)
  return registry


def _write_index(index: Dict[str, Any]) -> None:
  CONTAINER_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
  with CONTAINER_INDEX_PATH.open("w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False, indent=2)


def _rebuild_flat_library_from_index(index: Dict[str, Any]) -> None:
  registry = _load_registry_from_index()
  _save_registry(registry)


def _save_registry(data: Dict[str, Any]) -> None:
  CONTAINER_LIB_PATH.parent.mkdir(parents=True, exist_ok=True)
  with CONTAINER_LIB_PATH.open("w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)


def _load_index() -> Dict[str, Any]:
  if not CONTAINER_INDEX_PATH.exists():
    return {}
  try:
    return json.loads(CONTAINER_INDEX_PATH.read_text(encoding="utf-8"))
  except Exception:
    return {}


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


def _sanitize_site_key(host: str) -> str:
  host = host.strip().lower().replace('.', '_')
  return host or "site_auto"


def _get_site_path(site_key: str) -> Optional[Path]:
  index = _load_index()
  info = index.get(site_key)
  if not info:
    return None
  site_path = PROJECT_ROOT / info.get("path", f"container-library/{site_key}")
  return site_path


def _ensure_site_path(site_key: str, website: Optional[str] = None) -> Path:
  index = _load_index()
  info = index.get(site_key)
  if not info:
    info = {
      "website": (website or site_key),
      "path": f"container-library/{site_key}",
    }
    index[site_key] = info
    _write_index(index)
  else:
    if website and not info.get("website"):
      info["website"] = website
      _write_index(index)
  site_path = PROJECT_ROOT / info["path"]
  site_path.mkdir(parents=True, exist_ok=True)
  return site_path


def _get_user_site_path(site_key: str) -> Path:
  return USER_CONTAINER_ROOT / site_key


def _ensure_user_site_path(site_key: str) -> Path:
  path = _get_user_site_path(site_key)
  path.mkdir(parents=True, exist_ok=True)
  return path


def _container_file_path(site_path: Path, container_id: str) -> Path:
  rel = container_id.replace('.', '/')
  return site_path / rel / "container.json"


def _write_container_file(site_path: Path, container_id: str, data: Dict[str, Any]) -> None:
  container_file = _container_file_path(site_path, container_id)
  container_file.parent.mkdir(parents=True, exist_ok=True)
  container_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _read_container_file(site_path: Path, container_id: str) -> Dict[str, Any]:
  container_file = _container_file_path(site_path, container_id)
  if not container_file.exists():
    return {}
  try:
    return json.loads(container_file.read_text(encoding="utf-8"))
  except Exception:
    return {}


def _add_child_reference(site_path: Path, parent_id: str, child_id: str) -> None:
  data = _read_container_file(site_path, parent_id)
  children = data.get("children", [])
  if child_id not in children:
    children.append(child_id)
    data["children"] = children
    if "id" not in data:
      data["id"] = parent_id
    if "selectors" not in data:
      data["selectors"] = []
    _write_container_file(site_path, parent_id, data)


def _remove_child_references(site_path: Path, container_id: str) -> None:
  for container_file in site_path.rglob("container.json"):
    try:
      data = json.loads(container_file.read_text(encoding="utf-8"))
    except Exception:
      continue
    children = data.get("children")
    if not children or container_id not in children:
      continue
    children = [child for child in children if child != container_id]
    data["children"] = children
    container_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_containers_for_url(url: str) -> Dict[str, Any]:
  """为当前 URL 返回对应站点下的容器定义（兼容旧格式字段）"""
  containers_v2 = get_containers_for_url_v2(url)
  converted: Dict[str, Any] = {}
  for container_id, container in containers_v2.items():
    data = container.to_dict()
    primary = container.get_primary_selector()
    if primary and primary.classes:
      data.setdefault("selector", "." + ".".join(primary.classes))
    legacy_actions = container.metadata.get("legacy_actions")
    if legacy_actions:
      data["actions"] = legacy_actions
    legacy_event = container.metadata.get("legacy_event_key")
    if legacy_event:
      data["eventKey"] = legacy_event
    converted[container_id] = data
  return converted


def upsert_container_for_url(
  url: str,
  container_id: str,
  selector: str,
  description: str = "",
  parent_id: Optional[str] = None,
  actions: Optional[Dict[str, Any]] = None,
  event_key: Optional[str] = None,
) -> Dict[str, Any]:
  """
  为给定 URL 新增 / 更新一个容器定义，并在必要时更新父容器的 children 列表。
  返回写回后的完整站点配置（包含 website/containers）。
  """
  registry = _load_registry()
  site_key = _find_site_key_for_url(url, registry)
  website = ""
  if not site_key:
    try:
      parsed = urlparse(url)
      website = (parsed.hostname or "").lower()
    except Exception:
      website = ""
    site_key = _sanitize_site_key(website or "site_auto")
  else:
    site_entry = registry.get(site_key) or {}
    website = site_entry.get("website", "")

  legacy_payload = {
    "id": container_id,
    "name": description or container_id,
    "selector": selector,
  }
  container_v2 = convert_legacy_container_to_v2(legacy_payload)
  container_v2.id = container_id
  container_v2.name = description or container_v2.name or container_id
  if actions:
    container_v2.metadata["legacy_actions"] = actions
  if event_key:
    container_v2.metadata["legacy_event_key"] = event_key

  if not save_container_v2(site_key, container_v2, parent_id=parent_id, website=website):
    raise RuntimeError("Failed to save container definition")

  # 返回最新站点数据
  updated_registry = _load_registry()
  return updated_registry.get(site_key, {})


# ContainerDefV2 支持函数

def load_containers_for_site_v2(site_key: str) -> Dict[str, ContainerDefV2]:
  """加载指定站点的所有容器（ContainerDefV2格式）"""
  registry = _load_registry()
  site_data = registry.get(site_key)
  if not site_data:
    return {}

  containers = {}
  for container_id, container_data in site_data.get("containers", {}).items():
    # 检查是否已经是v2格式
    if 'selectors' in container_data and isinstance(container_data['selectors'], list):
      # 已经是v2格式
      containers[container_id] = ContainerDefV2.from_dict(container_data)
    else:
      # 转换旧格式到v2
      containers[container_id] = convert_legacy_container_to_v2(container_data)
  return containers


def get_containers_for_url_v2(url: str) -> Dict[str, ContainerDefV2]:
  """为当前 URL 返回对应站点下的容器字典（ContainerDefV2格式）"""
  registry = _load_registry()
  site_key = _find_site_key_for_url(url, registry)
  if not site_key:
    return {}
  return load_containers_for_site_v2(site_key)


def save_container_v2(
  site_key: str,
  container: ContainerDefV2,
  parent_id: Optional[str] = None,
  website: Optional[str] = None,
) -> bool:
  """保存ContainerDefV2格式的容器定义"""
  try:
    if CONTAINER_INDEX_PATH.exists():
      site_path = _ensure_user_site_path(site_key)
      _write_container_file(site_path, container.id, container.to_dict())
      if parent_id:
        _add_child_reference(site_path, parent_id, container.id)
      return True

    registry = _load_registry()
    site = registry.setdefault(site_key, {
      'website': website or site_key,
      'containers': {}
    })
    site.setdefault('containers', {})[container.id] = container.to_dict()
    _save_registry(registry)
    return True

  except Exception as e:
    print(f"保存容器失败: {e}")
    return False


def delete_container_v2(site_key: str, container_id: str) -> bool:
  """删除ContainerDefV2格式的容器定义"""
  try:
    if CONTAINER_INDEX_PATH.exists():
      site_path = _get_user_site_path(site_key)
      if site_path.exists():
        container_file = _container_file_path(site_path, container_id)
        if container_file.exists():
          container_file.unlink()
          try:
            container_file.parent.rmdir()
          except OSError:
            pass
          _remove_child_references(site_path, container_id)
          return True
      return False

    registry = _load_registry()
    if site_key in registry and 'containers' in registry[site_key]:
      if container_id in registry[site_key]['containers']:
        del registry[site_key]['containers'][container_id]
        _save_registry(registry)
        return True
    return False

  except Exception as e:
    print(f"删除容器失败: {e}")
    return False


def list_all_sites_v2() -> List[str]:
  """列出所有有容器定义的站点（v2格式）"""
  registry = _load_registry()
  return [site_key for site_key, site_data in registry.items()
          if site_data.get('containers')]


def get_container_hierarchy_v2(url: str) -> Dict[str, Any]:
  """获取容器的层级关系（v2格式）"""
  containers = get_containers_for_url_v2(url)
  hierarchy = {}

  for container_id, container in containers.items():
    hierarchy[container_id] = {
      'id': container.id,
      'name': container.name,
      'type': container.type,
      'children': container.children,
      'operations': [op.to_dict() for op in container.operations],
      'capabilities': container.capabilities,
      'selectors': [sel.to_dict() for sel in container.selectors]
    }

  return hierarchy

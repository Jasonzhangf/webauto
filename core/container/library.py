"""
容器库管理
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from datetime import datetime

from .models import Container, ContainerMatcher, ContainerAction


class ContainerLibrary:
    """容器库管理器"""

    def __init__(self, library_path: str = "container-library"):
        self.library_path = Path(library_path)
        self.containers: Dict[str, Container] = {}
        self.containers_by_domain: Dict[str, List[Container]] = {}
        self.containers_by_selector: Dict[str, List[Container]] = {}
        self.index_built = False
        self.load_containers()

    def load_containers(self):
        """加载容器库"""
        if not self.library_path.exists():
            self.library_path.mkdir(parents=True, exist_ok=True)

        # 加载根级别容器
        for container_file in self.library_path.glob("*.json"):
            self._load_container_file(container_file)

        # 加载域名特定的容器
        domains_path = self.library_path / "domains"
        if domains_path.exists():
            for domain_dir in domains_path.iterdir():
                if domain_dir.is_dir():
                    self._load_domain_containers(domain_dir)

    def _load_container_file(self, file_path: Path):
        """加载单个容器文件"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 处理多种格式
            containers_data = []

            if isinstance(data, list):
                containers_data = data
            elif 'containers' in data:
                if isinstance(data['containers'], dict):
                    # 现有格式：containers是字典，key为容器名
                    containers_data = list(data['containers'].values())
                else:
                    containers_data = data['containers']
            elif isinstance(data, dict):
                # 检查是否为单容器格式（包含selector等字段）
                if 'selector' in data or 'matcher' in data or 'name' in data:
                    containers_data = [data]
                else:
                    # 可能是旧的字典格式，转换为列表
                    containers_data = list(data.values())
            else:
                containers_data = [data]

            for container_data in containers_data:
                if not isinstance(container_data, dict):
                    continue

                container = self._dict_to_container(container_data)
                self.containers[container.name] = container

                # 按域名索引
                domain = container.metadata.get('domain')
                if domain:
                    if domain not in self.containers_by_domain:
                        self.containers_by_domain[domain] = []
                    self.containers_by_domain[domain].append(container)

                # 按选择器索引（小写存储）
                selector = container.matcher.selector.lower()
                if selector not in self.containers_by_selector:
                    self.containers_by_selector[selector] = []
                self.containers_by_selector[selector].append(container)

        except Exception as error:
            print(f"Failed to load container file {file_path}: {error}")

    def _load_domain_containers(self, domain_dir: Path):
        """加载域名特定的容器"""
        domain = domain_dir.name
        self.containers_by_domain[domain] = []

        for container_file in domain_dir.glob("*.json"):
            try:
                # 重用通用的容器文件加载逻辑
                self._load_container_file(container_file)

                # 为该域名的所有容器设置domain元数据
                for container in self.containers.values():
                    if domain not in container.metadata.get('url_patterns', []):
                        continue
                    if domain not in self.containers_by_domain[domain]:
                        self.containers_by_domain[domain].append(container)

            except Exception as error:
                print(f"Failed to load domain container {container_file}: {error}")

    def _dict_to_container(self, data: Dict[str, Any]) -> Container:
        """将字典转换为Container对象"""
        # 保持原始ID
        container_id = data.get('container_id')

        # 处理旧格式的扁平数据结构
        if 'selector' in data and 'matcher' not in data:
            # 旧格式：扁平的selector字段
            selector = data.get('selector', '')
            attributes = data.get('attributes', {})
            text_patterns = data.get('text_patterns', [])

            matcher = ContainerMatcher(
                selector=selector,
                attributes=attributes,
                text_patterns=text_patterns
            )
        else:
            # 新格式：嵌套的matcher对象
            matcher_data = data.get('matcher', {})
            matcher = ContainerMatcher(
                selector=matcher_data.get('selector', ''),
                attributes=matcher_data.get('attributes', {}),
                text_patterns=matcher_data.get('text_patterns', []),
                position_weights=matcher_data.get('position_weights', {}),
                similarity_threshold=matcher_data.get('similarity_threshold', 0.8)
            )

        # 转换actions
        actions = []
        actions_data = data.get('actions', [])
        if isinstance(actions_data, list):
            for action_data in actions_data:
                if isinstance(action_data, dict):
                    action = ContainerAction(
                        action_type=action_data.get('action_type', ''),
                        selector=action_data.get('selector'),
                        parameters=action_data.get('parameters', {}),
                        timeout=action_data.get('timeout', 30000),
                        description=action_data.get('description')
                    )
                    actions.append(action)

        # 转换children（处理字符串引用和对象两种格式）
        children = []
        children_data = data.get('children', [])
        if isinstance(children_data, list):
            for child_data in children_data:
                if isinstance(child_data, dict):
                    child = self._dict_to_container(child_data)
                    children.append(child)
                # 注意：字符串引用在这里先忽略，因为需要后续解析

        # 解析时间戳
        created_at = data.get('created_at')
        if created_at:
            created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))

        container = Container(
            name=data.get('name', ''),
            matcher=matcher,
            actions=actions,
            children=children,
            xpath=data.get('xpath'),
            confidence=data.get('confidence', 0.0),
            metadata=data.get('metadata', {}),
            created_at=created_at or datetime.utcnow()
        )

        # 保持原始ID
        if container_id:
            container.container_id = container_id

        return container

    def save_container(self, container: Container):
        """保存容器"""
        self.containers[container.name] = container

        # 按域名保存
        domain = container.metadata.get('domain')
        if domain:
            self._save_domain_container(container, domain)
        else:
            self._save_root_container(container)

    def _save_root_container(self, container: Container):
        """保存根级别容器"""
        # 清理容器名称，防止路径遍历
        safe_name = self._sanitize_container_name(container.name)
        file_path = self.library_path / f"{safe_name}.json"
        self._save_container_to_file(container, file_path)

    def _save_domain_container(self, container: Container, domain: str):
        """保存域名特定容器"""
        # 清理域名和容器名称
        safe_domain = self._sanitize_container_name(domain)
        safe_name = self._sanitize_container_name(container.name)

        domain_dir = self.library_path / "domains" / safe_domain
        domain_dir.mkdir(parents=True, exist_ok=True)

        file_path = domain_dir / f"{safe_name}.json"
        self._save_container_to_file(container, file_path)

        # 更新域名索引
        if domain not in self.containers_by_domain:
            self.containers_by_domain[domain] = []
        if container not in self.containers_by_domain[domain]:
            self.containers_by_domain[domain].append(container)

    def _save_container_to_file(self, container: Container, file_path: Path):
        """保存容器到文件"""
        data = container.to_dict()
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def get_container(self, name: str) -> Optional[Container]:
        """获取容器"""
        return self.containers.get(name)

    def get_containers_by_domain(self, domain: str) -> List[Container]:
        """根据域名获取容器"""
        return self.containers_by_domain.get(domain, [])

    def search_containers(self, query: str) -> List[Container]:
        """搜索容器"""
        results = []
        query_lower = query.lower()

        # 优先通过索引搜索
        if query_lower in self.containers_by_selector:
            return self.containers_by_selector[query_lower].copy()

        # 线性搜索作为备选
        for container in self.containers.values():
            # 搜索容器名称
            if query_lower in container.name.lower():
                results.append(container)
                continue

            # 搜索选择器
            if query_lower in container.matcher.selector.lower():
                results.append(container)
                continue

            # 搜索元数据
            metadata_str = str(container.metadata).lower()
            if query_lower in metadata_str:
                results.append(container)

        return results

    def _sanitize_container_name(self, name: str) -> str:
        """清理容器名称，防止路径遍历"""
        # 只允许字母、数字、下划线和短横线
        import re
        safe_name = re.sub(r'[^A-Za-z0-9_-]', '_', name)

        # 防止空名称
        if not safe_name:
            safe_name = f"container_{hash(name) % 10000}"

        # 限制长度
        return safe_name[:100]

    def delete_container(self, name: str) -> bool:
        """删除容器"""
        container = self.containers.get(name)
        if not container:
            return False

        # 删除文件（使用清理后的名称）
        domain = container.metadata.get('domain')
        safe_name = self._sanitize_container_name(name)

        if domain:
            safe_domain = self._sanitize_container_name(domain)
            file_path = self.library_path / "domains" / safe_domain / f"{safe_name}.json"
        else:
            file_path = self.library_path / f"{safe_name}.json"

        if file_path.exists():
            file_path.unlink()

        # 从内存中删除
        del self.containers[name]

        # 从域名索引中删除
        if domain and domain in self.containers_by_domain:
            self.containers_by_domain[domain] = [
                c for c in self.containers_by_domain[domain] if c.name != name
            ]

        # 从选择器索引中删除
        selector = container.matcher.selector.lower()
        if selector in self.containers_by_selector:
            self.containers_by_selector[selector] = [
                c for c in self.containers_by_selector[selector] if c.name != name
            ]
            if not self.containers_by_selector[selector]:
                del self.containers_by_selector[selector]

        return True

    def list_containers(self) -> List[str]:
        """列出所有容器名称"""
        return list(self.containers.keys())

    def get_statistics(self) -> Dict[str, Any]:
        """获取统计信息"""
        total_containers = len(self.containers)
        domain_count = len(self.containers_by_domain)

        action_types = {}
        for container in self.containers.values():
            for action in container.actions:
                action_type = action.action_type
                action_types[action_type] = action_types.get(action_type, 0) + 1

        return {
            'total_containers': total_containers,
            'domains': domain_count,
            'action_types': action_types,
            'containers_by_domain': {
                domain: len(containers)
                for domain, containers in self.containers_by_domain.items()
            }
        }

    def validate_container(self, container: Container) -> List[str]:
        """验证容器"""
        errors = []

        # 检查必需字段
        if not container.name:
            errors.append("Container name is required")

        if not container.matcher.selector:
            errors.append("Container selector is required")

        # 检查选择器格式
        try:
            # 简单的选择器验证
            if container.matcher.selector:
                # 检查基本的CSS选择器语法
                if not any(char in container.matcher.selector for char in ['#', '.', '[', '>', ' ']):
                    errors.append("Selector should include specific identifiers (class, id, etc.)")
        except Exception:
            errors.append("Invalid selector format")

        # 检查操作
        for i, action in enumerate(container.actions):
            if not action.action_type:
                errors.append(f"Action {i} missing action_type")

            valid_action_types = ['click', 'input', 'extract', 'wait']
            if action.action_type not in valid_action_types:
                errors.append(f"Action {i} has invalid action_type: {action.action_type}")

        return errors

    def create_sample_containers(self):
        """创建示例容器"""
        # 示例微博容器
        weibo_container = Container(
            name="weibo_home",
            matcher=ContainerMatcher(
                selector=".WB_frame",
                attributes={"class": "WB_frame"},
                text_patterns=["微博", "热搜"]
            ),
            actions=[
                ContainerAction(
                    action_type="click",
                    selector=".gn_nav_list .gn_name",
                    description="点击导航项"
                )
            ],
            metadata={
                "domain": "weibo.com",
                "url_patterns": ["https://weibo.com/*"],
                "page_type": "home"
            }
        )

        # 示例登录容器
        login_container = Container(
            name="login_form",
            matcher=ContainerMatcher(
                selector=".login-form",
                attributes={"class": "login-form"}
            ),
            actions=[
                ContainerAction(
                    action_type="input",
                    selector="input[name='username']",
                    parameters={"clear_first": True},
                    description="输入用户名"
                ),
                ContainerAction(
                    action_type="input",
                    selector="input[name='password']",
                    parameters={"clear_first": True},
                    description="输入密码"
                ),
                ContainerAction(
                    action_type="click",
                    selector="button[type='submit']",
                    description="提交登录"
                )
            ],
            metadata={
                "page_type": "login",
                "url_patterns": ["*/login", "*/signin"]
            }
        )

        self.save_container(weibo_container)
        self.save_container(login_container)
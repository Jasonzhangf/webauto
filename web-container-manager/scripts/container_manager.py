#!/usr/bin/env python3
"""
Container management system for web element mapping and hierarchy maintenance.
"""

import json
import uuid
import logging
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from pathlib import Path


class ContainerManager:
    """Manages container hierarchies and mappings for web elements.

    Storage model (directory + index):
    - Global index: container-library/index.json
      * maps site keys (e.g. "cbu", "weibo") to a per-site container file
    - Per-site file: container-library/<site>/containers.json
      * actual container data lives here

    This manager keeps the in-memory API the same as before, but instead of
    using a single root-level JSON file it loads/saves via container-library.
    """

    def __init__(self, storage_path: str = "containers.json"):
        # storage_path is kept for backward compatibility but ignored in
        # favor of the directory + index model under container-library.
        self.storage_path = Path(storage_path)
        # base directory and index for container-library
        self.base_dir = Path("container-library")
        self.index_path = self.base_dir / "index.json"

        self.containers: Dict[str, Dict[str, Any]] = {}
        self.root_containers: List[str] = []
        self.current_site_key: Optional[str] = None
        self.current_site_file: Optional[Path] = None
        # default site key when we cannot resolve from URL
        self.default_site_key = "default"

        # Lazily loaded; no data is loaded until we resolve a site.
    
    # ----------------------------
    # Storage helpers
    # ----------------------------

    def _resolve_site_key(self, page_url: str) -> str:
        """Resolve a site key from page_url using simple substring match.

        Strategy:
        1. Load container-library/index.json if present.
        2. For each site entry, if its website substring appears in page_url,
           treat that site key as a match.
        3. If multiple match, pick the first in index order.
        4. If none match, fall back to a default site key ("default").
        """
        if not self.index_path.exists():
            return self.default_site_key

        try:
            with open(self.index_path, "r", encoding="utf-8") as f:
                index = json.load(f)
        except Exception as e:
            logging.error(f"Failed to load container index: {e}")
            return self.default_site_key

        sites = index.get("sites", {})
        matched_key: Optional[str] = None

        for key, info in sites.items():
            website = info.get("website") or ""
            if website and website in page_url:
                matched_key = key
                break

        if matched_key:
            return matched_key

        return self.default_site_key

    def _ensure_site_entry(self, site_key: str) -> Path:
        """Ensure site entry exists in index and return its container file path."""
        self.base_dir.mkdir(parents=True, exist_ok=True)

        index = {"version": "1.0", "updated": datetime.now().strftime("%Y-%m-%d"), "sites": {}}
        if self.index_path.exists():
            try:
                with open(self.index_path, "r", encoding="utf-8") as f:
                    existing = json.load(f)
                    if isinstance(existing, dict):
                        index.update({k: v for k, v in existing.items() if k in ("version", "updated", "sites")})
                        if "sites" not in index or not isinstance(index["sites"], dict):
                            index["sites"] = {}
            except Exception as e:
                logging.error(f"Failed to read existing index.json, recreating: {e}")

        sites = index.setdefault("sites", {})

        if site_key in sites:
            container_file_rel = sites[site_key].get("container_file")
            if container_file_rel:
                container_path = Path(container_file_rel)
            else:
                container_path = self.base_dir / site_key / "containers.json"
        else:
            # Create a new site entry with a generic website field.
            container_path = self.base_dir / site_key / "containers.json"
            sites[site_key] = {
                "website": site_key,
                "container_file": str(container_path),
                "description": f"Containers for {site_key}",
            }

        container_path.parent.mkdir(parents=True, exist_ok=True)

        # Persist potentially updated index
        index["updated"] = datetime.now().strftime("%Y-%m-%d")
        try:
            with open(self.index_path, "w", encoding="utf-8") as f:
                json.dump(index, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logging.error(f"Failed to write container index: {e}")

        return container_path

    def _load_site_containers(self, site_key: str) -> None:
        """Load containers for a specific site into memory."""
        site_file = self._ensure_site_entry(site_key)
        self.current_site_key = site_key
        self.current_site_file = site_file
        self.containers = {}
        self.root_containers = []

        if site_file.exists():
            try:
                with open(site_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.containers = data.get("containers", {}) or {}
                    self.root_containers = data.get("root_containers", []) or []
            except Exception as e:
                logging.error(f"Failed to load site containers from {site_file}: {e}")
                self.containers = {}
                self.root_containers = []

    def _ensure_loaded_for_url(self, page_url: str) -> None:
        """Ensure containers are loaded for the site inferred from page_url."""
        site_key = self._resolve_site_key(page_url)
        if site_key != self.current_site_key or self.current_site_file is None:
            self._load_site_containers(site_key)
    
    def _save_containers(self) -> bool:
        """Save containers for the current site to container-library."""
        if not self.current_site_key:
            # If for some reason no site is selected yet, fall back to default.
            self._load_site_containers(self.default_site_key)

        if not self.current_site_file:
            logging.error("No site file configured for saving containers")
            return False

        try:
            data = {
                "containers": self.containers,
                "root_containers": self.root_containers,
                "last_updated": datetime.now().isoformat(),
            }

            with open(self.current_site_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            return True
        except Exception as e:
            logging.error(f"Failed to save containers to {self.current_site_file}: {str(e)}")
            return False
    
    def check_existing_mapping(self, selector: str, page_url: str) -> Dict[str, Any]:
        """
        Check if a selector already exists in container mappings.
        
        Args:
            selector: CSS selector to check
            page_url: Source page URL
            
        Returns:
            Mapping status and existing container information
        """
        # Make sure we are looking at the correct site before scanning.
        self._ensure_loaded_for_url(page_url)

        for container_id, container in self.containers.items():
            if container.get("selector") == selector and container.get("page_url") == page_url:
                return {
                    "exists": True,
                    "container_id": container_id,
                    "container": container,
                    "message": f"Container already exists for selector '{selector}' on this page"
                }
        
        return {
            "exists": False,
            "message": f"No existing mapping for selector '{selector}'"
        }
    
    def find_nearest_parent_container(self, selector: str, page_url: str) -> Optional[Dict[str, Any]]:
        """
        Find the nearest parent container for a given selector.
        
        Args:
            selector: CSS selector for the element
            page_url: Source page URL
            
        Returns:
            Nearest parent container information or None
        """
        # For initial implementation, just return the first available root
        # container after loading containers for this page's site.
        # In real implementation, would analyze DOM hierarchy
        
        self._ensure_loaded_for_url(page_url)

        if self.root_containers:
            parent_id = self.root_containers[0]
            parent_container = self.containers.get(parent_id)
            
            if parent_container:
                return {
                    "container_id": parent_id,
                    "container": parent_container,
                    "relationship": "child",
                    "suggestion_reason": "First available root container"
                }
        
        return None
    
    def create_container(self, selector: str, page_url: str, operation: str, 
                        parent_id: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Create a new container for a web element.
        
        Args:
            selector: CSS selector for the element
            page_url: Source page URL
            operation: Container operation type
            parent_id: Optional parent container ID
            metadata: Optional additional metadata
            
        Returns:
            Container creation results
        """
        # Check if mapping already exists
        existing_check = self.check_existing_mapping(selector, page_url)
        if existing_check["exists"]:
            return {
                "success": False,
                "error": existing_check["message"],
                "existing_container_id": existing_check["container_id"]
            }
        
        # Generate unique container ID
        container_id = str(uuid.uuid4())
        
        # Create container structure
        container = {
            "container_id": container_id,
            "selector": selector,
            "page_url": page_url,
            # Keep legacy single operation for backward compatibility, but
            # also maintain a universal operations array which callers
            # should prefer from now on.
            "operation": operation,
            "operations": [operation],
            "parent_id": parent_id,
            "children": [],
            "metadata": {
                "created_at": datetime.now().isoformat(),
                "last_updated": datetime.now().isoformat(),
                "last_accessed": None,
                "access_count": 0,
                "status": "active"
            }
        }
        
        # Add custom metadata if provided
        if metadata:
            container["metadata"].update(metadata)
        
        # Add to containers
        self.containers[container_id] = container
        
        # Update parent-child relationship if parent specified
        if parent_id and parent_id in self.containers:
            parent = self.containers[parent_id]
            if "children" not in parent:
                parent["children"] = []
            parent["children"].append(container_id)
            parent["metadata"]["last_updated"] = datetime.now().isoformat()
        else:
            # Add as root container if no parent specified
            if container_id not in self.root_containers:
                self.root_containers.append(container_id)
        
        # Save to persistent storage
        save_success = self._save_containers()
        
        return {
            "success": True,
            "container_id": container_id,
            "container": container,
            "parent_id": parent_id,
            "is_root": parent_id is None,
            "saved": save_success
        }
    
    def update_container(self, container_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update an existing container.
        
        Args:
            container_id: ID of container to update
            updates: Dictionary of fields to update
            
        Returns:
            Update results
        """
        if container_id not in self.containers:
            return {
                "success": False,
                "error": f"Container {container_id} not found"
            }
        
        container = self.containers[container_id]
        
        # Update allowed fields
        allowed_fields = ["operation", "operations", "metadata", "selector"]

        for field, value in updates.items():
            if field in allowed_fields:
                if field == "metadata":
                    # Merge metadata updates
                    container["metadata"].update(value)
                elif field == "operations":
                    # Always store as list; derive legacy single operation
                    if isinstance(value, list):
                        container["operations"] = value
                    else:
                        container["operations"] = [value]
                    container["operation"] = container["operations"][0] if container["operations"] else None
                elif field == "operation":
                    container["operation"] = value
                    # Keep operations list in sync
                    ops = container.get("operations") or []
                    if not ops:
                        container["operations"] = [value]
                    elif value not in ops:
                        container["operations"] = [value] + [op for op in ops if op != value]
                else:
                    container[field] = value
        
        # Update last modified timestamp
        container["metadata"]["last_updated"] = datetime.now().isoformat()
        
        # Save changes
        save_success = self._save_containers()
        
        return {
            "success": True,
            "container_id": container_id,
            "updated_fields": list(updates.keys()),
            "container": container,
            "saved": save_success
        }
    
    def delete_container(self, container_id: str, cascade: bool = False) -> Dict[str, Any]:
        """
        Delete a container and optionally its children.
        
        Args:
            container_id: ID of container to delete
            cascade: Whether to delete child containers
            
        Returns:
            Deletion results
        """
        if container_id not in self.containers:
            return {
                "success": False,
                "error": f"Container {container_id} not found"
            }
        
        container = self.containers[container_id]
        deleted_containers = [container_id]
        
        # Handle child containers
        if cascade and "children" in container:
            for child_id in container["children"]:
                if child_id in self.containers:
                    # Recursively delete children
                    child_result = self.delete_container(child_id, cascade=True)
                    if child_result["success"]:
                        deleted_containers.extend(child_result["deleted_containers"])
        
        # Remove from parent if exists
        parent_id = container.get("parent_id")
        if parent_id and parent_id in self.containers:
            parent = self.containers[parent_id]
            if "children" in parent and container_id in parent["children"]:
                parent["children"].remove(container_id)
        
        # Remove from root containers if it's a root
        if container_id in self.root_containers:
            self.root_containers.remove(container_id)
        
        # Delete the container
        del self.containers[container_id]
        
        # Handle orphaned children if not cascading
        if not cascade and "children" in container:
            orphaned_children = []
            for child_id in container["children"]:
                if child_id in self.containers:
                    child = self.containers[child_id]
                    child["parent_id"] = None
                    # Promote to root container
                    if child_id not in self.root_containers:
                        self.root_containers.append(child_id)
                    orphaned_children.append(child_id)
        
        # Save changes
        save_success = self._save_containers()
        
        result = {
            "success": True,
            "deleted_containers": deleted_containers,
            "container_id": container_id,
            "cascade": cascade,
            "saved": save_success
        }
        
        if not cascade and "orphaned_children" in locals():
            result["orphaned_children"] = orphaned_children
        
        return result
    
    def list_root_containers(self) -> Dict[str, Any]:
        """
        List all root containers.

        Returns:
            Root container information
        """
        root_info = []

        # No URL context here, so just work with whatever has been loaded
        # most recently. Callers that care about a specific page should have
        # already triggered _ensure_loaded_for_url via other operations.
        for container_id in self.root_containers:
            if container_id in self.containers:
                container = self.containers[container_id]
                root_info.append({
                    "container_id": container_id,
                    "selector": container.get("selector"),
                    "operation": container.get("operation"),
                    "page_url": container.get("page_url"),
                    "child_count": len(container.get("children", [])),
                    "metadata": container.get("metadata", {})
                })
        
        return {
            "success": True,
            "root_containers": root_info,
            "total_count": len(root_info)
        }
    
    def list_container_hierarchy(self, container_id: Optional[str] = None) -> Dict[str, Any]:
        """
        List container hierarchy, optionally starting from a specific container.
        
        Args:
            container_id: Optional starting container ID (defaults to all roots)
            
        Returns:
            Container hierarchy information
        """
        if container_id:
            # Return specific container and its children
            if container_id not in self.containers:
                return {
                    "success": False,
                    "error": f"Container {container_id} not found"
                }
            
            container = self.containers[container_id]
            hierarchy = self._build_hierarchy_tree(container_id)
            
            return {
                "success": True,
                "container_id": container_id,
                "hierarchy": hierarchy,
                "is_root": container_id in self.root_containers
            }
        else:
            # Return all root containers and their hierarchies
            all_hierarchies = []
            
            for root_id in self.root_containers:
                if root_id in self.containers:
                    hierarchy = self._build_hierarchy_tree(root_id)
                    all_hierarchies.append({
                        "root_id": root_id,
                        "hierarchy": hierarchy
                    })
            
            return {
                "success": True,
                "hierarchies": all_hierarchies,
                "root_count": len(all_hierarchies)
            }
    
    def _build_hierarchy_tree(self, container_id: str) -> Dict[str, Any]:
        """
        Build hierarchical tree structure for a container.
        
        Args:
            container_id: Container ID to build tree for
            
        Returns:
            Hierarchical tree structure
        """
        if container_id not in self.containers:
            return {}
        
        container = self.containers[container_id]
        
        tree = {
            "container_id": container_id,
            "selector": container.get("selector"),
            "operation": container.get("operation"),
            "page_url": container.get("page_url"),
            "metadata": container.get("metadata", {}),
            "children": []
        }
        
        # Add children recursively
        for child_id in container.get("children", []):
            if child_id in self.containers:
                child_tree = self._build_hierarchy_tree(child_id)
                tree["children"].append(child_tree)
        
        return tree
    
    def get_container_info(self, container_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific container.
        
        Args:
            container_id: Container ID to get information for
            
        Returns:
            Container information
        """
        if container_id not in self.containers:
            return {
                "success": False,
                "error": f"Container {container_id} not found"
            }
        
        container = self.containers[container_id]
        
        # Get parent information if exists
        parent_info = None
        parent_id = container.get("parent_id")
        if parent_id and parent_id in self.containers:
            parent = self.containers[parent_id]
            parent_info = {
                "container_id": parent_id,
                "selector": parent.get("selector"),
                "operation": parent.get("operation")
            }
        
        # Get child information
        child_info = []
        for child_id in container.get("children", []):
            if child_id in self.containers:
                child = self.containers[child_id]
                child_info.append({
                    "container_id": child_id,
                    "selector": child.get("selector"),
                    "operation": child.get("operation")
                })
        
        return {
            "success": True,
            "container_id": container_id,
            "container": container,
            "parent_info": parent_info,
            "child_info": child_info,
            "is_root": container_id in self.root_containers
        }
    
    def search_containers(self, query: str, search_type: str = "selector") -> Dict[str, Any]:
        """
        Search containers by various criteria.
        
        Args:
            query: Search query
            search_type: Type of search (selector, operation, page_url)
            
        Returns:
            Search results
        """
        results = []
        
        for container_id, container in self.containers.items():
            match = False
            
            if search_type == "selector" and query in container.get("selector", ""):
                match = True
            elif search_type == "operation" and query == container.get("operation"):
                match = True
            elif search_type == "page_url" and query in container.get("page_url", ""):
                match = True
            
            if match:
                results.append({
                    "container_id": container_id,
                    "selector": container.get("selector"),
                    "operation": container.get("operation"),
                    "page_url": container.get("page_url"),
                    "metadata": container.get("metadata", {})
                })
        
        return {
            "success": True,
            "query": query,
            "search_type": search_type,
            "results": results,
            "result_count": len(results)
        }


# Example usage and testing
if __name__ == "__main__":
    # Test container manager functionality
    manager = ContainerManager("test_containers.json")
    
    # Create test containers
    result1 = manager.create_container("#main-content", "https://example.com", "monitor")
    print(f"Created container 1: {result1}")
    
    if result1["success"]:
        parent_id = result1["container_id"]
        result2 = manager.create_container(".header", "https://example.com", "interact", parent_id=parent_id)
        print(f"Created child container: {result2}")
    
    # List containers
    roots = manager.list_root_containers()
    print(f"Root containers: {roots}")
    
    # Search containers
    search_results = manager.search_containers("#main-content", "selector")
    print(f"Search results: {search_results}")

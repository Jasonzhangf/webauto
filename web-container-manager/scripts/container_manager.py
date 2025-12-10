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
    """Manages container hierarchies and mappings for web elements."""
    
    def __init__(self, storage_path: str = "containers.json"):
        self.storage_path = Path(storage_path)
        self.containers: Dict[str, Dict[str, Any]] = {}
        self.root_containers: List[str] = []
        self._load_containers()
    
    def _load_containers(self) -> None:
        """Load containers from persistent storage."""
        if self.storage_path.exists():
            try:
                with open(self.storage_path, 'r') as f:
                    data = json.load(f)
                    self.containers = data.get("containers", {})
                    self.root_containers = data.get("root_containers", [])
            except Exception as e:
                logging.error(f"Failed to load containers: {str(e)}")
                self.containers = {}
                self.root_containers = []
    
    def _save_containers(self) -> bool:
        """Save containers to persistent storage."""
        try:
            data = {
                "containers": self.containers,
                "root_containers": self.root_containers,
                "last_updated": datetime.now().isoformat()
            }
            
            with open(self.storage_path, 'w') as f:
                json.dump(data, f, indent=2)
            
            return True
        except Exception as e:
            logging.error(f"Failed to save containers: {str(e)}")
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
        # For mock implementation, return first available root container
        # In real implementation, would analyze DOM hierarchy
        
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
            "operation": operation,
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
        allowed_fields = ["operation", "metadata", "selector"]
        
        for field, value in updates.items():
            if field in allowed_fields:
                if field == "metadata":
                    # Merge metadata updates
                    container["metadata"].update(value)
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

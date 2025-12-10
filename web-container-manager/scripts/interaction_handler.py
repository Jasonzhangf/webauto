#!/usr/bin/env python3
"""
User interaction handler for web container management system.
"""

import json
import logging
from typing import Dict, List, Optional, Any, Callable
from enum import Enum

from browser_manager import BrowserManager
from container_manager import ContainerManager


class OperationType(Enum):
    """Available container operation types."""
    MONITOR = "monitor"
    INTERACT = "interact"
    EXTRACT = "extract"
    VALIDATE = "validate"
    TRANSFORM = "transform"
    OBSERVE = "observe"


class InteractionHandler:
    """Handles user interactions and commands for container management."""
    
    def __init__(self):
        self.browser_manager = BrowserManager()
        self.container_manager = ContainerManager()
        self.current_mode = "normal"
        self.selected_element = None
        
    def process_command(self, command: str, **kwargs) -> Dict[str, Any]:
        """
        Process user command and route to appropriate handler.
        
        Args:
            command: Command string
            **kwargs: Additional command parameters
            
        Returns:
            Command processing results
        """
        command_map = {
            "open_page": self._handle_open_page,
            "list_containers": self._handle_list_containers,
            "create_container": self._handle_create_container,
            "delete_container": self._handle_delete_container,
            "update_container": self._handle_update_container,
            "enter_selection_mode": self._handle_enter_selection_mode,
            "exit_selection_mode": self._handle_exit_selection_mode,
            "validate_selector": self._handle_validate_selector,
            "get_container_info": self._handle_get_container_info,
            "search_containers": self._handle_search_containers
        }
        
        handler = command_map.get(command)
        if handler:
            return handler(**kwargs)
        else:
            return {
                "success": False,
                "error": f"Unknown command: {command}",
                "available_commands": list(command_map.keys())
            }
    
    def _handle_open_page(self, url: str, **kwargs) -> Dict[str, Any]:
        """Handle page opening command."""
        result = self.browser_manager.open_page(url)
        
        if result["success"]:
            # Check for existing root containers on this page
            existing_roots = self._check_existing_page_containers(url)
            
            return {
                **result,
                "existing_containers": existing_roots,
                "next_actions": self._suggest_next_actions(result, existing_roots)
            }
        
        return result
    
    def _check_existing_page_containers(self, page_url: str) -> List[Dict[str, Any]]:
        """Check for existing containers on the given page."""
        roots = self.container_manager.list_root_containers()
        existing_roots = []
        
        for root in roots["root_containers"]:
            if root["page_url"] == page_url:
                existing_roots.append(root)
        
        return existing_roots
    
    def _suggest_next_actions(self, page_result: Dict[str, Any], existing_containers: List[Dict[str, Any]]) -> List[str]:
        """Suggest next actions based on page analysis and existing containers."""
        actions = []
        
        if existing_containers:
            actions.append("existing_root_found")
            actions.append("modify_existing")
        else:
            actions.append("create_root_container")
        
        if page_result.get("root_containers"):
            actions.append("use_suggested_containers")
        
        actions.append("enter_selection_mode")
        
        return actions
    
    def _handle_list_containers(self, container_id: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """Handle container listing command."""
        if container_id:
            return self.container_manager.list_container_hierarchy(container_id)
        else:
            roots = self.container_manager.list_root_containers()
            
            # Build full hierarchy
            hierarchies = []
            for root in roots["root_containers"]:
                hierarchy = self.container_manager.list_container_hierarchy(root["container_id"])
                if hierarchy["success"]:
                    hierarchies.append({
                        "root_id": root["container_id"],
                        "root_selector": root["selector"],
                        "hierarchy": hierarchy["hierarchy"]
                    })
            
            return {
                "success": True,
                "hierarchies": hierarchies,
                "root_count": len(hierarchies)
            }
    
    def _handle_create_container(self, selector: str, page_url: str, operation: str, 
                               parent_id: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """Handle container creation command."""
        # Validate selector first
        selector_validation = self.browser_manager.validate_selector(selector)
        
        if not selector_validation["valid"]:
            return {
                "success": False,
                "error": f"Invalid selector: {selector_validation['error']}",
                "suggestions": selector_validation.get("suggestions", [])
            }
        
        # Check if container already exists
        existing_check = self.container_manager.check_existing_mapping(selector, page_url)
        if existing_check["exists"]:
            return {
                "success": False,
                "error": existing_check["message"],
                "existing_container_id": existing_check["container_id"],
                "existing_container": existing_check["container"],
                "suggestions": ["update_container", "delete_existing"]
            }
        
        # Suggest parent if not provided
        if not parent_id:
            suggested_parent = self.container_manager.find_nearest_parent_container(selector, page_url)
            if suggested_parent:
                return {
                    "success": False,
                    "error": "Parent container required",
                    "suggested_parent": suggested_parent,
                    "requires_confirmation": True
                }
        
        # Validate operation
        if operation not in [op.value for op in OperationType]:
            return {
                "success": False,
                "error": f"Invalid operation: {operation}",
                "valid_operations": [op.value for op in OperationType]
            }
        
        # Create the container
        result = self.container_manager.create_container(selector, page_url, operation, parent_id)
        
        if result["success"]:
            return {
                **result,
                "message": f"Container created successfully for selector '{selector}' with operation '{operation}'"
            }
        
        return result
    
    def _handle_delete_container(self, container_id: str, cascade: bool = False, **kwargs) -> Dict[str, Any]:
        """Handle container deletion command."""
        # Get container info first for confirmation
        container_info = self.container_manager.get_container_info(container_id)
        
        if not container_info["success"]:
            return container_info
        
        # Check if container has children
        child_count = len(container_info["child_info"])
        
        if child_count > 0 and not cascade:
            return {
                "success": False,
                "error": f"Container has {child_count} children",
                "children": container_info["child_info"],
                "requires_cascade_confirmation": True,
                "suggestions": [
                    {"action": "delete_with_cascade", "message": "Delete container and all children"},
                    {"action": "promote_children", "message": "Delete container and promote children to root"},
                    {"action": "reassign_children", "message": "Reassign children to another parent"}
                ]
            }
        
        # Perform deletion
        result = self.container_manager.delete_container(container_id, cascade)
        
        if result["success"]:
            return {
                **result,
                "message": f"Container '{container_id}' deleted successfully"
            }
        
        return result
    
    def _handle_update_container(self, container_id: str, updates: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        """Handle container update command."""
        # Validate operation if updating
        if "operation" in updates:
            if updates["operation"] not in [op.value for op in OperationType]:
                return {
                    "success": False,
                    "error": f"Invalid operation: {updates['operation']}",
                    "valid_operations": [op.value for op in OperationType]
                }
        
        # Validate selector if updating
        if "selector" in updates:
            selector_validation = self.browser_manager.validate_selector(updates["selector"])
            if not selector_validation["valid"]:
                return {
                    "success": False,
                    "error": f"Invalid selector: {selector_validation['error']}",
                    "suggestions": selector_validation.get("suggestions", [])
                }
        
        # Perform update
        result = self.container_manager.update_container(container_id, updates)
        
        if result["success"]:
            return {
                **result,
                "message": f"Container '{container_id}' updated successfully"
            }
        
        return result
    
    def _handle_enter_selection_mode(self, **kwargs) -> Dict[str, Any]:
        """Handle entering selection mode."""
        result = self.browser_manager.enter_selection_mode()
        
        if result["success"]:
            self.current_mode = "selection"
            return {
                **result,
                "available_actions": [
                    "hover_element",
                    "select_element",
                    "exit_selection_mode"
                ]
            }
        
        return result
    
    def _handle_exit_selection_mode(self, **kwargs) -> Dict[str, Any]:
        """Handle exiting selection mode."""
        result = self.browser_manager.exit_selection_mode()
        
        if result["success"]:
            self.current_mode = "normal"
            self.selected_element = None
        
        return result
    
    def _handle_validate_selector(self, selector: str, **kwargs) -> Dict[str, Any]:
        """Handle selector validation."""
        return self.browser_manager.validate_selector(selector)
    
    def _handle_get_container_info(self, container_id: str, **kwargs) -> Dict[str, Any]:
        """Handle getting container information."""
        return self.container_manager.get_container_info(container_id)
    
    def _handle_search_containers(self, query: str, search_type: str = "selector", **kwargs) -> Dict[str, Any]:
        """Handle container search."""
        return self.container_manager.search_containers(query, search_type)
    
    def handle_element_selection(self, selector: str, **kwargs) -> Dict[str, Any]:
        """
        Handle element selection from selection mode.
        
        Args:
            selector: Selected element's CSS selector
            
        Returns:
            Selection handling results
        """
        self.selected_element = selector
        
        # Get element information
        element_info = self.browser_manager.get_element_info(selector)
        
        if not element_info["success"]:
            return element_info
        
        # Find suggested parent containers
        page_url = self.browser_manager.current_page.get("url") if self.browser_manager.current_page else ""
        suggested_parents = []
        
        roots = self.container_manager.list_root_containers()
        for root in roots["root_containers"]:
            if root["page_url"] == page_url:
                suggested_parents.append({
                    "container_id": root["container_id"],
                    "selector": root["selector"],
                    "reason": "Root container on same page"
                })
        
        return {
            "success": True,
            "selected_element": selector,
            "element_info": element_info["element"],
            "suggested_parents": suggested_parents,
            "next_actions": [
                "create_container",
                "add_to_existing_container",
                "continue_selecting"
            ]
        }
    
    def get_available_operations(self) -> List[Dict[str, Any]]:
        """
        Get list of available operations with descriptions.
        
        Returns:
            List of available operations
        """
        return [
            {
                "operation": OperationType.MONITOR.value,
                "description": "Track element changes and updates",
                "use_case": "When you need to monitor dynamic content"
            },
            {
                "operation": OperationType.INTERACT.value,
                "description": "Enable user interactions with the element",
                "use_case": "For buttons, forms, and interactive elements"
            },
            {
                "operation": OperationType.EXTRACT.value,
                "description": "Extract data from the element",
                "use_case": "To regularly pull data from content areas"
            },
            {
                "operation": OperationType.VALIDATE.value,
                "description": "Validate element state and content",
                "use_case": "To check element status and content validity"
            },
            {
                "operation": OperationType.TRANSFORM.value,
                "description": "Apply transformations to the element",
                "use_case": "When you need to modify element appearance or content"
            },
            {
                "operation": OperationType.OBSERVE.value,
                "description": "Observe events on the element",
                "use_case": "To track user interactions and events"
            }
        ]
    
    def suggest_root_containers(self, page_info: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Suggest potential root containers based on page analysis.
        
        Args:
            page_info: Page analysis information
            
        Returns:
            List of suggested root containers
        """
        suggestions = []
        
        potential_containers = page_info.get("root_containers", [])
        
        for container in potential_containers:
            suggestion = {
                "selector": container["selector"],
                "element_type": container["type"],
                "classes": container.get("classes", []),
                "priority": container.get("priority", 0),
                "reason": self._get_container_suggestion_reason(container)
            }
            suggestions.append(suggestion)
        
        # Sort by priority
        suggestions.sort(key=lambda x: x["priority"], reverse=True)
        
        return suggestions[:5]  # Limit to top 5 suggestions
    
    def _get_container_suggestion_reason(self, container: Dict[str, Any]) -> str:
        """Get the reason for suggesting a container."""
        reasons = []
        
        if container.get("priority", 0) >= 5:
            reasons.append("High priority ID-based selector")
        elif container.get("priority", 0) >= 3:
            reasons.append("Contains relevant content class names")
        
        if container["type"] in ["main", "article", "section"]:
            reasons.append("Semantic content container")
        
        if container["selector"].startswith("#"):
            reasons.append("Unique ID selector")
        
        return "; ".join(reasons) if reasons else "General purpose container"
    
    def generate_user_prompt(self, context: Dict[str, Any]) -> str:
        """
        Generate appropriate user prompt based on current context.
        
        Args:
            context: Current interaction context
            
        Returns:
            User prompt message
        """
        prompt_type = context.get("prompt_type", "general")
        
        prompts = {
            "no_root_containers": "No root containers found for this page. Would you like to create a root container first?",
            "root_container_exists": "Existing root containers found. Would you like to work with existing containers or create new ones?",
            "selector_conflict": "This selector is already mapped to an existing container. Would you like to modify the existing operation or create a new container?",
            "parent_needed": "A parent container is required for this element. The following parent containers are available:",
            "operation_needed": "What operation would you like to assign to this container?",
            "delete_confirmation": "Are you sure you want to delete this container?",
            "delete_with_children": "This container has children. Would you like to delete with children or handle children separately?",
            "selection_active": "Hover over elements to highlight them. Click to select an element for container creation."
        }
        
        return prompts.get(prompt_type, "What would you like to do next?")


# Example usage and testing
if __name__ == "__main__":
    # Test interaction handler
    handler = InteractionHandler()
    
    # Test opening a page
    page_result = handler.process_command("open_page", url="https://example.com")
    print(f"Page result: {page_result}")
    
    # Test container creation
    create_result = handler.process_command(
        "create_container",
        selector="#main-content",
        page_url="https://example.com",
        operation="monitor"
    )
    print(f"Create result: {create_result}")
    
    # Test listing containers
    list_result = handler.process_command("list_containers")
    print(f"List result: {list_result}")

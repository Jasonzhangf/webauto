#!/usr/bin/env python3
"""
Selection mode implementation for interactive element selection.
"""

import json
import logging
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path


class SelectionMode:
    """Manages interactive element selection mode with hover and click functionality."""
    
    def __init__(self):
        self.is_active = False
        self.highlighted_element = None
        self.selected_element = None
        self.hover_timeout = None
        self.selection_overlay_id = None
        
    def inject_selection_styles(self, page_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Inject selection mode styles into the page.
        
        Args:
            page_info: Current page information
            
        Returns:
            Injection status and details
        """
        try:
            # Read CSS styles
            css_path = Path(__file__).parent.parent / "assets" / "selection_styles.css"
            with open(css_path, 'r') as f:
                css_content = f.read()
            
            # In real implementation, would inject CSS into page
            # For now, simulate successful injection
            
            return {
                "success": True,
                "css_injected": True,
                "styles_count": len(css_content.split('\n')),
                "message": "Selection styles injected successfully"
            }
            
        except Exception as e:
            logging.error(f"Failed to inject selection styles: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to inject selection styles"
            }
    
    def inject_selection_javascript(self, page_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Inject JavaScript for selection mode functionality.
        
        Args:
            page_info: Current page information
            
        Returns:
            Injection status and details
        """
        try:
            # JavaScript code for selection mode
            selection_js = """
            (function() {
                // Global selection mode state
                let selectionMode = {
                    active: false,
                    highlightedElement: null,
                    selectedElement: null,
                    overlayId: null,
                    tooltipId: null
                };
                
                // Create overlay for selection mode
                function createOverlay() {
                    const overlay = document.createElement('div');
                    overlay.id = 'web-auto-selection-overlay';
                    overlay.className = 'web-auto-selection-overlay';
                    document.body.appendChild(overlay);
                    selectionMode.overlayId = overlay.id;
                    return overlay;
                }
                
                // Create tooltip for element information
                function createTooltip(element, rect) {
                    const existing = document.getElementById('web-auto-element-tooltip');
                    if (existing) {
                        existing.remove();
                    }
                    
                    const tooltip = document.createElement('div');
                    tooltip.id = 'web-auto-element-tooltip';
                    tooltip.className = 'web-auto-element-tooltip';
                    
                    // Build tooltip content
                    const tagName = element.tagName.toLowerCase();
                    const className = element.className || 'no-class';
                    const elementId = element.id || 'no-id';
                    const textContent = element.textContent.substring(0, 100) || 'no-text';
                    
                    let content = '';
                    content += '<span class="web-auto-tooltip-tag">&lt;' + tagName + '&gt;</span>';
                    if (elementId !== 'no-id') {
                        content += '<span class="web-auto-tooltip-id">#' + elementId + '</span>';
                    }
                    if (className !== 'no-class') {
                        content += '<span class="web-auto-tooltip-class">.' + className.split(' ').join('.</span><span class="web-auto-tooltip-class">.') + '</span>';
                    }
                    content += '<div class="web-auto-tooltip-text">' + textContent + '</div>';
                    
                    tooltip.innerHTML = content;
                    document.body.appendChild(tooltip);
                    
                    // Position tooltip
                    const tooltipRect = tooltip.getBoundingClientRect();
                    let top = rect.top - tooltipRect.height - 10;
                    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                    
                    // Adjust position if tooltip goes off screen
                    if (top < 0) {
                        top = rect.bottom + 10;
                    }
                    if (left < 0) {
                        left = 10;
                    }
                    if (left + tooltipRect.width > window.innerWidth) {
                        left = window.innerWidth - tooltipRect.width - 10;
                    }
                    
                    tooltip.style.top = top + 'px';
                    tooltip.style.left = left + 'px';
                    
                    selectionMode.tooltipId = tooltip.id;
                    return tooltip;
                }
                
                // Highlight element on hover
                function highlightElement(element) {
                    // Remove previous highlight
                    const previous = document.getElementById('web-auto-hover-highlight');
                    if (previous) {
                        previous.remove();
                    }
                    
                    // Create new highlight
                    const highlight = document.createElement('div');
                    highlight.id = 'web-auto-hover-highlight';
                    highlight.className = 'web-auto-hover-highlight';
                    
                    const rect = element.getBoundingClientRect();
                    highlight.style.top = rect.top + window.scrollY + 'px';
                    highlight.style.left = rect.left + window.scrollX + 'px';
                    highlight.style.width = rect.width + 'px';
                    highlight.style.height = rect.height + 'px';
                    
                    document.body.appendChild(highlight);
                    selectionMode.highlightedElement = element;
                    
                    // Create tooltip
                    createTooltip(element, rect);
                }
                
                // Remove highlight
                function removeHighlight() {
                    const highlight = document.getElementById('web-auto-hover-highlight');
                    if (highlight) {
                        highlight.remove();
                    }
                    
                    const tooltip = document.getElementById('web-auto-element-tooltip');
                    if (tooltip) {
                        tooltip.remove();
                    }
                    
                    selectionMode.highlightedElement = null;
                    selectionMode.tooltipId = null;
                }
                
                // Select element
                function selectElement(element) {
                    // Remove hover highlight
                    removeHighlight();
                    
                    // Remove previous selection
                    const previous = document.getElementById('web-auto-selected-highlight');
                    if (previous) {
                        previous.remove();
                    }
                    
                    // Create selection highlight
                    const selection = document.createElement('div');
                    selection.id = 'web-auto-selected-highlight';
                    selection.className = 'web-auto-selected-highlight';
                    
                    const rect = element.getBoundingClientRect();
                    selection.style.top = rect.top + window.scrollY + 'px';
                    selection.style.left = rect.left + window.scrollX + 'px';
                    selection.style.width = rect.width + 'px';
                    selection.style.height = rect.height + 'px';
                    
                    document.body.appendChild(selection);
                    selectionMode.selectedElement = element;
                    
                    return element;
                }
                
                // Generate CSS selector for element
                function generateSelector(element) {
                    if (element.id) {
                        return '#' + element.id;
                    }
                    
                    let selector = element.tagName.toLowerCase();
                    
                    if (element.className) {
                        const classes = element.className.split(' ').filter(c => c.trim());
                        if (classes.length > 0) {
                            selector += '.' + classes.join('.');
                        }
                    }
                    
                    // Check if selector is unique
                    if (document.querySelectorAll(selector).length === 1) {
                        return selector;
                    }
                    
                    // Add nth-child if needed
                    const parent = element.parentNode;
                    if (parent) {
                        const siblings = Array.from(parent.children).filter(child => child.tagName === element.tagName);
                        const index = siblings.indexOf(element);
                        if (index > 0) {
                            selector += ':nth-child(' + (index + 1) + ')';
                        }
                    }
                    
                    return selector;
                }
                
                // Event handlers
                function handleMouseOver(event) {
                    if (!selectionMode.active) return;
                    
                    const element = event.target;
                    highlightElement(element);
                }
                
                function handleMouseOut(event) {
                    if (!selectionMode.active) return;
                    
                    const element = event.target;
                    if (selectionMode.highlightedElement === element) {
                        removeHighlight();
                    }
                }
                
                function handleClick(event) {
                    if (!selectionMode.active) return;
                    
                    event.preventDefault();
                    event.stopPropagation();
                    
                    const element = event.target;
                    const selected = selectElement(element);
                    const selector = generateSelector(selected);
                    
                    // Send selection information to parent
                    window.postMessage({
                        type: 'web_auto_element_selected',
                        selector: selector,
                        element: {
                            tagName: selected.tagName.toLowerCase(),
                            className: selected.className,
                            id: selected.id,
                            textContent: selected.textContent.substring(0, 100)
                        }
                    }, '*');
                }
                
                function handleKeyDown(event) {
                    if (!selectionMode.active) return;
                    
                    if (event.key === 'Escape') {
                        exitSelectionMode();
                    }
                }
                
                // Enter selection mode
                function enterSelectionMode() {
                    selectionMode.active = true;
                    
                    // Create overlay
                    const overlay = createOverlay();
                    overlay.classList.add('active');
                    
                    // Add event listeners
                    document.addEventListener('mouseover', handleMouseOver);
                    document.addEventListener('mouseout', handleMouseOut);
                    document.addEventListener('click', handleClick);
                    document.addEventListener('keydown', handleKeyDown);
                    
                    // Show selection indicator
                    showSelectionIndicator();
                    
                    return true;
                }
                
                // Exit selection mode
                function exitSelectionMode() {
                    selectionMode.active = false;
                    
                    // Remove overlay
                    const overlay = document.getElementById('web-auto-selection-overlay');
                    if (overlay) {
                        overlay.classList.remove('active');
                        setTimeout(() => overlay.remove(), 300);
                    }
                    
                    // Remove highlights
                    removeHighlight();
                    const selected = document.getElementById('web-auto-selected-highlight');
                    if (selected) {
                        selected.remove();
                    }
                    
                    // Remove event listeners
                    document.removeEventListener('mouseover', handleMouseOver);
                    document.removeEventListener('mouseout', handleMouseOut);
                    document.removeEventListener('click', handleClick);
                    document.removeEventListener('keydown', handleKeyDown);
                    
                    // Hide selection indicator
                    hideSelectionIndicator();
                    
                    // Send exit message
                    window.postMessage({
                        type: 'web_auto_selection_exited'
                    }, '*');
                    
                    return true;
                }
                
                // Show selection mode indicator
                function showSelectionIndicator() {
                    const indicator = document.createElement('div');
                    indicator.id = 'web-auto-selection-indicator';
                    indicator.className = 'web-auto-selection-indicator active';
                    indicator.textContent = 'Selection Mode Active - Click to select element, ESC to exit';
                    document.body.appendChild(indicator);
                }
                
                // Hide selection mode indicator
                function hideSelectionIndicator() {
                    const indicator = document.getElementById('web-auto-selection-indicator');
                    if (indicator) {
                        indicator.remove();
                    }
                }
                
                // Show keyboard shortcuts help
                function showKeyboardHelp() {
                    const existing = document.getElementById('web-auto-keyboard-help');
                    if (existing) {
                        existing.remove();
                        return;
                    }
                    
                    const help = document.createElement('div');
                    help.id = 'web-auto-keyboard-help';
                    help.innerHTML = `
                        <h4>Keyboard Shortcuts</h4>
                        <ul>
                            <li><span class="web-auto-key-shortcut">ESC</span> Exit selection mode</li>
                            <li><span class="web-auto-key-shortcut">Click</span> Select element</li>
                            <li><span class="web-auto-key-shortcut">Hover</span> Preview element</li>
                        </ul>
                    `;
                    document.body.appendChild(help);
                }
                
                // Make functions global for external access
                window.WebAutoSelectionMode = {
                    enter: enterSelectionMode,
                    exit: exitSelectionMode,
                    showHelp: showKeyboardHelp,
                    isActive: () => selectionMode.active,
                    getSelectedElement: () => selectionMode.selectedElement
                };
                
                // Auto-enter selection mode if requested
                if (window.location.search.includes('web-auto-selection=1')) {
                    enterSelectionMode();
                }
                
            })();
            """
            
            # In real implementation, would inject JavaScript into page
            # For now, simulate successful injection
            
            return {
                "success": True,
                "javascript_injected": True,
                "functions_available": [
                    "WebAutoSelectionMode.enter",
                    "WebAutoSelectionMode.exit",
                    "WebAutoSelectionMode.isActive",
                    "WebAutoSelectionMode.getSelectedElement"
                ],
                "message": "Selection JavaScript injected successfully"
            }
            
        except Exception as e:
            logging.error(f"Failed to inject selection JavaScript: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to inject selection JavaScript"
            }
    
    def enter_selection_mode(self, page_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Enter interactive selection mode.
        
        Args:
            page_info: Current page information
            
        Returns:
            Selection mode entry status
        """
        try:
            # Inject styles
            styles_result = self.inject_selection_styles(page_info)
            if not styles_result["success"]:
                return styles_result
            
            # Inject JavaScript
            js_result = self.inject_selection_javascript(page_info)
            if not js_result["success"]:
                return js_result
            
            # Activate selection mode
            self.is_active = True
            
            # In real implementation, would execute JavaScript to activate selection mode
            # For now, simulate activation
            
            return {
                "success": True,
                "mode": "selection",
                "message": "Selection mode activated. Hover over elements to highlight, click to select.",
                "controls": {
                    "hover": "Preview elements with hover",
                    "click": "Select element with click",
                    "escape": "Exit selection mode with ESC",
                    "keyboard_help": "Press H for keyboard shortcuts"
                },
                "styles_injected": styles_result["success"],
                "javascript_injected": js_result["success"]
            }
            
        except Exception as e:
            logging.error(f"Failed to enter selection mode: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to enter selection mode"
            }
    
    def exit_selection_mode(self) -> Dict[str, Any]:
        """
        Exit interactive selection mode.
        
        Returns:
            Selection mode exit status
        """
        try:
            if not self.is_active:
                return {
                    "success": True,
                    "message": "Selection mode was not active"
                }
            
            # In real implementation, would execute JavaScript to deactivate selection mode
            # For now, simulate deactivation
            
            self.is_active = False
            self.highlighted_element = None
            self.selected_element = None
            
            return {
                "success": True,
                "mode": "normal",
                "message": "Selection mode deactivated",
                "selected_element": None
            }
            
        except Exception as e:
            logging.error(f"Failed to exit selection mode: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to exit selection mode"
            }
    
    def handle_element_selection(self, selector: str, element_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle element selection from selection mode.
        
        Args:
            selector: Selected element's CSS selector
            element_info: Information about the selected element
            
        Returns:
            Selection handling results
        """
        try:
            self.selected_element = selector
            
            # Validate selector
            validation_result = self._validate_selected_selector(selector)
            
            if not validation_result["valid"]:
                return {
                    "success": False,
                    "error": f"Invalid selector generated: {validation_result['error']}",
                    "suggestions": validation_result.get("suggestions", [])
                }
            
            # Get element position and size information
            position_info = self._get_element_position(element_info)
            
            # Suggest potential parent containers
            parent_suggestions = self._suggest_parent_containers(selector)
            
            return {
                "success": True,
                "selected_element": {
                    "selector": selector,
                    "tag_name": element_info.get("tagName"),
                    "class_name": element_info.get("className"),
                    "id": element_info.get("id"),
                    "text_content": element_info.get("textContent"),
                    "position": position_info
                },
                "validation": validation_result,
                "parent_suggestions": parent_suggestions,
                "next_actions": [
                    "create_container",
                    "add_to_existing_container",
                    "continue_selecting",
                    "exit_selection_mode"
                ]
            }
            
        except Exception as e:
            logging.error(f"Failed to handle element selection: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to handle element selection"
            }
    
    def _validate_selected_selector(self, selector: str) -> Dict[str, Any]:
        """
        Validate the generated selector.
        
        Args:
            selector: Generated CSS selector
            
        Returns:
            Validation results
        """
        # Basic validation
        if not selector or not selector.strip():
            return {
                "valid": False,
                "error": "Empty selector"
            }
        
        # Check selector length
        if len(selector) > 256:
            return {
                "valid": False,
                "error": "Selector too long (>256 characters)"
            }
        
        # Check for invalid characters
        invalid_chars = ['\\', '^', '$', '*', '+', '?', '(', ')', '[', ']', '{', '}', '|']
        for char in invalid_chars:
            if char in selector:
                return {
                    "valid": False,
                    "error": f"Invalid character '{char}' in selector"
                }
        
        return {
            "valid": True,
            "selector": selector,
            "specificity": self._calculate_selector_specificity(selector)
        }
    
    def _calculate_selector_specificity(self, selector: str) -> int:
        """
        Calculate CSS selector specificity score.
        
        Args:
            selector: CSS selector string
            
        Returns:
            Specificity score
        """
        # Basic specificity calculation
        specificity = 0
        
        # ID selectors: 100 points each
        id_count = selector.count('#')
        specificity += id_count * 100
        
        # Class selectors: 10 points each
        class_count = selector.count('.')
        specificity += class_count * 10
        
        # Tag selectors: 1 point each
        # This is simplified - real implementation would be more complex
        tag_count = len([c for c in selector if c.isalpha() and selector[selector.index(c)-1] in [' ', '#', '.']])
        specificity += tag_count
        
        return specificity
    
    def _get_element_position(self, element_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get element position and sizing information.
        
        Args:
            element_info: Element information
            
        Returns:
            Position information
        """
        # In real implementation, would get actual DOM rect information
        # For now, return mock position data
        
        return {
            "x": 100,
            "y": 200,
            "width": 300,
            "height": 150,
            "visible": True,
            "in_viewport": True
        }
    
    def _suggest_parent_containers(self, selector: str) -> List[Dict[str, Any]]:
        """
        Suggest potential parent containers for the selected element.
        
        Args:
            selector: Selected element selector
            
        Returns:
            List of suggested parent containers
        """
        # In real implementation, would analyze DOM hierarchy
        # For now, return mock suggestions
        
        suggestions = []
        
        # Add common parent container suggestions
        common_parents = [
            {
                "selector": ".container",
                "reason": "Common container class",
                "distance": "2 levels up"
            },
            {
                "selector": "#main-content",
                "reason": "Main content area",
                "distance": "3 levels up"
            },
            {
                "selector": "body",
                "reason": "Document body",
                "distance": "root level"
            }
        ]
        
        # Filter and prioritize suggestions
        for parent in common_parents:
            if not selector.startswith(parent["selector"]):  # Don't suggest if already contained
                parent["priority"] = self._calculate_parent_priority(parent["selector"], selector)
                suggestions.append(parent)
        
        # Sort by priority
        suggestions.sort(key=lambda x: x["priority"], reverse=True)
        
        return suggestions[:3]  # Limit to top 3 suggestions
    
    def _calculate_parent_priority(self, parent_selector: str, child_selector: str) -> int:
        """
        Calculate priority score for a parent container suggestion.
        
        Args:
            parent_selector: Parent container selector
            child_selector: Child element selector
            
        Returns:
            Priority score
        """
        score = 0
        
        # Prefer semantic containers
        semantic_selectors = ["main", "article", "section", "header", "footer", "aside", "nav"]
        for semantic in semantic_selectors:
            if semantic in parent_selector:
                score += 10
                break
        
        # Prefer ID selectors
        if "#" in parent_selector:
            score += 8
        
        # Prefer common container classes
        container_classes = ["container", "wrapper", "content", "main", "layout"]
        for class_name in container_classes:
            if class_name in parent_selector:
                score += 5
        
        # Avoid overly generic selectors
        if parent_selector in ["div", "span", "body", "html"]:
            score -= 10
        
        return max(0, score)
    
    def get_selection_status(self) -> Dict[str, Any]:
        """
        Get current selection mode status.
        
        Returns:
            Selection mode status
        """
        return {
            "active": self.is_active,
            "highlighted_element": self.highlighted_element,
            "selected_element": self.selected_element,
            "available_actions": self._get_available_actions()
        }
    
    def _get_available_actions(self) -> List[str]:
        """
        Get list of available actions based on current state.
        
        Returns:
            Available actions
        """
        actions = []
        
        if not self.is_active:
            actions.extend([
                "enter_selection_mode",
                "validate_selector",
                "create_container"
            ])
        else:
            actions.extend([
                "exit_selection_mode",
                "select_element",
                "highlight_element"
            ])
        
        if self.selected_element:
            actions.extend([
                "create_container_from_selection",
                "add_to_existing_container",
                "clear_selection"
            ])
        
        return actions


# Example usage and testing
if __name__ == "__main__":
    # Test selection mode
    selection = SelectionMode()
    
    # Test entering selection mode
    page_info = {"url": "https://example.com"}
    result = selection.enter_selection_mode(page_info)
    print(f"Enter selection mode: {result}")
    
    # Test element selection
    element_info = {
        "tagName": "div",
        "className": "content main",
        "id": "main-content",
        "textContent": "This is the main content area"
    }
    
    selection_result = selection.handle_element_selection("#main-content", element_info)
    print(f"Element selection: {selection_result}")
    
    # Test getting status
    status = selection.get_selection_status()
    print(f"Selection status: {status}")
    
    # Test exiting selection mode
    exit_result = selection.exit_selection_mode()
    print(f"Exit selection mode: {exit_result}")

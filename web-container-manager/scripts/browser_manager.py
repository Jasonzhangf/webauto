#!/usr/bin/env python3
"""
Browser automation and DOM interaction manager for web container management.
This version integrates with Chrome DevTools MCP for real browser interactions.
"""

import json
import time
import logging
import os
import sys
from typing import Dict, List, Optional, Tuple, Any
from urllib.parse import urlparse

# Chrome DevTools Protocol integration
class BrowserManager:
    """Manages browser automation and DOM interactions using Chrome DevTools MCP."""
    
    def __init__(self):
        self.current_page = None
        self.page_history = []
        self.dom_snapshot = None
        self.selection_mode = False
        self.highlighted_element = None
        self.mcp_available = False
        
        # Try to import MCP tools
        try:
            from mcp.chrome_devtools import navigate_page, take_snapshot, wait_for, evaluate_script, take_screenshot
            self.mcp_available = True
        except ImportError as e:
            logging.warning(f"MCP Chrome DevTools not available: {str(e)}. Using fallback mode.")
            self.mcp_available = False
        
    def open_page(self, url: str, timeout: int = 30000) -> Dict[str, Any]:
        """
        Open a web page and return initial analysis.
        
        Args:
            url: Target URL to open
            timeout: Maximum wait time in milliseconds
            
        Returns:
            Dictionary containing page information and DOM analysis
        """
        try:
            if self.mcp_available:
                # Use MCP Chrome DevTools
                # Navigate to page
                self.current_page = {"url": url, "loaded": False}
                
                from mcp.chrome_devtools import navigate_page, take_snapshot, wait_for
                navigate_result = navigate_page(type="url", url=url, timeout=timeout)
                
                if "error" in navigate_result:
                    return {
                        "success": False,
                        "error": f"Failed to navigate to {url}: {navigate_result.get('error', 'Unknown error')}",
                        "url": url
                    }
                
                # Wait for page to load
                try:
                    wait_for(text="</html>", timeout=timeout)
                except Exception as e:
                    logging.warning(f"Page load timeout, continuing anyway: {str(e)}")
                
                # Take DOM snapshot
                dom_info = self._take_dom_snapshot()
                
                self.current_page["loaded"] = True
                self.current_page["dom_info"] = dom_info
                
                # Analyze potential root containers
                root_containers = self._identify_root_containers(dom_info)
                
                return {
                    "success": True,
                    "url": url,
                    "dom_info": dom_info,
                    "root_containers": root_containers,
                    "page_title": dom_info.get("title", "Unknown"),
                    "element_count": dom_info.get("element_count", 0)
                }
            else:
                # Fallback mode - simulate page opening
                self.current_page = {"url": url, "loaded": True}
                dom_info = self._get_fallback_dom_info()
                root_containers = self._identify_root_containers(dom_info)
                
                return {
                    "success": True,
                    "url": url,
                    "dom_info": dom_info,
                    "root_containers": root_containers,
                    "page_title": dom_info.get("title", "Mock Page"),
                    "element_count": dom_info.get("element_count", 0),
                    "mode": "fallback"
                }
            
        except Exception as e:
            logging.error(f"Failed to open page {url}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "url": url
            }
    
    def _take_dom_snapshot(self) -> Dict[str, Any]:
        """
        Take a snapshot of current page DOM using Chrome DevTools.
        
        Returns:
            Dictionary containing DOM structure information
        """
        if not self.mcp_available:
            return self._get_fallback_dom_info()
        
        try:
            from mcp.chrome_devtools import take_snapshot
            
            snapshot_result = take_snapshot(verbose=True)
            
            if "error" in snapshot_result:
                logging.error(f"Failed to take DOM snapshot: {snapshot_result['error']}")
                return self._get_fallback_dom_info()
            
            # Parse snapshot to extract DOM structure
            dom_data = self._parse_dom_snapshot(snapshot_result)
            
            return dom_data
            
        except Exception as e:
            logging.error(f"Failed to take DOM snapshot: {str(e)}")
            return self._get_fallback_dom_info()
    
    def _parse_dom_snapshot(self, snapshot_data: Any) -> Dict[str, Any]:
        """
        Parse DOM snapshot data to extract structured information.
        
        Args:
            snapshot_data: Raw snapshot data from Chrome DevTools
            
        Returns:
            Parsed DOM information
        """
        try:
            # Extract title from snapshot
            title = "Unknown Page"
            element_count = 0
            body_structure = {}
            potential_containers = []
            
            # If snapshot_data is a string (the snapshot content)
            if isinstance(snapshot_data, str):
                content = snapshot_data
                
                # Extract title from content
                if "<title>" in content and "</title>" in content:
                    title_start = content.find("<title>") + len("<title>")
                    title_end = content.find("</title>")
                    title = content[title_start:title_end].strip()
                
                # Count elements and identify potential containers
                element_types = ["div", "header", "footer", "section", "article", "main", "aside", "nav"]
                for element_type in element_types:
                    count = content.count(f"<{element_type}")
                    if count > 0:
                        body_structure[element_type] = count
                
                element_count = sum(body_structure.values())
                
                # Look for potential container selectors
                import re
                
                # Find elements with IDs
                id_pattern = r'id="([^"]+)"'
                ids = re.findall(id_pattern, content)
                for element_id in ids:
                    if any(keyword in element_id.lower() for keyword in ['main', 'content', 'container', 'header', 'footer', 'sidebar']):
                        potential_containers.append({
                            "selector": f"#{element_id}",
                            "type": "div",
                            "classes": [],
                            "priority": 8 if 'main' in element_id.lower() or 'content' in element_id.lower() else 5
                        })
                
                # Find elements with classes
                class_pattern = r'class="([^"]+)"'
                classes = re.findall(class_pattern, content)
                for class_list in classes:
                    class_names = class_list.split()
                    if any(keyword in ' '.join(class_names).lower() for keyword in ['container', 'content', 'main', 'wrapper']):
                        selector = "." + ".".join(class_names)
                        potential_containers.append({
                            "selector": selector,
                            "type": "div",
                            "classes": class_names,
                            "priority": 6
                        })
            
            return {
                "title": title,
                "element_count": element_count,
                "body_structure": body_structure,
                "potential_containers": potential_containers
            }
            
        except Exception as e:
            logging.error(f"Failed to parse DOM snapshot: {str(e)}")
            return self._get_fallback_dom_info()
    
    def _get_fallback_dom_info(self) -> Dict[str, Any]:
        """Get fallback DOM information when real analysis fails."""
        return {
            "title": "Web Page",
            "element_count": 100,
            "body_structure": {
                "div": 20,
                "p": 25,
                "a": 15,
                "img": 8,
                "span": 12
            },
            "potential_containers": [
                {"selector": "body", "type": "body", "classes": [], "priority": 1}
            ]
        }
    
    def _identify_root_containers(self, dom_info: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Identify potential root containers from DOM analysis.
        
        Args:
            dom_info: DOM structure information
            
        Returns:
            List of potential root container elements
        """
        potential_containers = dom_info.get("potential_containers", [])
        
        # Filter and prioritize containers
        root_containers = []
        for container in potential_containers:
            # Add priority scoring based on element characteristics
            priority = self._calculate_container_priority(container)
            if priority > 0:
                container["priority"] = priority
                root_containers.append(container)
        
        # Sort by priority
        return sorted(root_containers, key=lambda x: x["priority"], reverse=True)
    
    def _calculate_container_priority(self, container: Dict[str, Any]) -> int:
        """
        Calculate priority score for a potential container.
        
        Args:
            container: Container element information
            
        Returns:
            Priority score (higher is better)
        """
        score = 0
        
        # ID selectors are high priority
        if container["selector"].startswith("#"):
            score += 5
        
        # Common content container classes
        content_classes = ["content", "main", "container", "wrapper", "body"]
        for class_name in container.get("classes", []):
            if any(content in class_name.lower() for content in content_classes):
                score += 3
        
        # Semantic HTML elements
        semantic_elements = ["main", "article", "section", "header", "footer", "aside"]
        if container["type"] in semantic_elements:
            score += 2
        
        return score
    
    def validate_selector(self, selector: str) -> Dict[str, Any]:
        """
        Validate a CSS selector against the current page.
        
        Args:
            selector: CSS selector to validate
            
        Returns:
            Validation results including element information
        """
        if not self.current_page or not self.current_page.get("loaded"):
            return {
                "valid": False,
                "error": "No page loaded"
            }
        
        if self.mcp_available:
            try:
                from mcp.chrome_devtools import evaluate_script
                
                # Execute JavaScript to validate selector
                script = f"""
                () => {{
                    try {{
                        const elements = document.querySelectorAll('{selector}');
                        const elementCount = elements.length;
                        
                        if (elementCount === 0) {{
                            return {{
                                valid: false,
                                error: 'No elements found for selector: {selector}',
                                suggestions: []
                            }};
                        }}
                        
                        const firstElement = elements[0];
                        return {{
                            valid: true,
                            element_info: {{
                                tag: firstElement.tagName.toLowerCase(),
                                classes: Array.from(firstElement.classList),
                                id: firstElement.id || '',
                                text: firstElement.textContent ? firstElement.textContent.substring(0, 100) : '',
                                elementCount: elementCount
                            }},
                            selector: '{selector}',
                            element_count: elementCount
                        }};
                    }} catch (e) {{
                        return {{
                            valid: false,
                            error: 'Invalid selector: ' + e.message,
                            suggestions: []
                        }};
                    }}
                }}
                """
                
                result = evaluate_script(function=script)
                
                if "error" in result:
                    return {
                        "valid": False,
                        "error": f"Selector validation failed: {result.get('error', 'Unknown error')}",
                        "suggestions": []
                    }
                
                return result
                
            except Exception as e:
                logging.error(f"MCP validation failed, using fallback: {str(e)}")
                return self._fallback_selector_validation(selector)
        else:
            # Fallback validation
            return self._fallback_selector_validation(selector)
    
    def _fallback_selector_validation(self, selector: str) -> Dict[str, Any]:
        """
        Fallback selector validation when Chrome DevTools is not available.
        
        Args:
            selector: CSS selector string
            
        Returns:
            Validation results
        """
        if not selector or not selector.strip():
            return {
                "valid": False,
                "error": "Empty selector"
            }
        
        # Basic syntax validation
        try:
            import re
            
            # Check for balanced brackets and quotes
            if selector.count("(") != selector.count(")"):
                return {
                    "valid": False,
                    "error": "Unbalanced parentheses"
                }
            
            if selector.count("[") != selector.count("]"):
                return {
                    "valid": False,
                    "error": "Unbalanced brackets"
                }
            
            if selector.count("\"") % 2 != 0 or selector.count("'") % 2 != 0:
                return {
                    "valid": False,
                    "error": "Unbalanced quotes"
                }
            
            # Simulate finding elements
            element_info = self._simulate_element_lookup(selector)
            
            if element_info:
                return {
                    "valid": True,
                    "element_info": element_info,
                    "selector": selector,
                    "element_count": 1
                }
            else:
                return {
                    "valid": False,
                    "error": f"No elements found for selector: {selector}",
                    "suggestions": self._generate_selector_suggestions(selector)
                }
                
        except Exception as e:
            return {
                "valid": False,
                "error": f"Selector validation failed: {str(e)}",
                "suggestions": []
            }
    
    def _simulate_element_lookup(self, selector: str) -> Optional[Dict[str, Any]]:
        """
        Simulate finding elements for a selector (mock implementation).
        
        Args:
            selector: CSS selector
            
        Returns:
            Element information if found
        """
        # Mock element database for demonstration
        mock_elements = {
            "#main-content": {"tag": "div", "classes": ["content", "main"], "text": "Main Content Area"},
            ".header": {"tag": "header", "classes": ["header", "navigation"], "text": "Site Header"},
            ".sidebar": {"tag": "aside", "classes": ["sidebar", "widget-area"], "text": "Sidebar"},
            "#footer": {"tag": "footer", "classes": ["footer", "site-footer"], "text": "Footer"},
            "h1": {"tag": "h1", "classes": [], "text": "Page Title"},
            ".button": {"tag": "button", "classes": ["button", "btn-primary"], "text": "Click Me"}
        }
        
        return mock_elements.get(selector, None)
    
    def _generate_selector_suggestions(self, selector: str) -> List[str]:
        """
        Generate alternative selector suggestions.
        
        Args:
            selector: Original selector that failed
            
        Returns:
            List of suggested alternative selectors
        """
        suggestions = []
        
        # Common variations for ID selectors
        if selector.startswith("#"):
            base_id = selector[1:]
            suggestions.extend([
                f"[id='{base_id}']",
                f"[id*=\"{base_id}\"]",
                f".{base_id}"
            ])
        
        # Common variations for class selectors
        elif selector.startswith("."):
            base_class = selector[1:]
            suggestions.extend([
                f"[class*='{base_class}']",
                f"[class='{base_class}']",
                f"#{base_class}"
            ])
        
        # Tag selectors
        else:
            suggestions.extend([
                f".{selector}",
                f"#{selector}",
                f"[data-{selector}]"
            ])
        
        return suggestions[:3]  # Limit suggestions
    
    def enter_selection_mode(self) -> Dict[str, Any]:
        """
        Enter visual element selection mode.
        
        Returns:
            Selection mode status
        """
        if not self.current_page or not self.current_page.get("loaded"):
            return {
                "success": False,
                "error": "No page loaded"
            }
        
        if self.mcp_available:
            try:
                from mcp.chrome_devtools import evaluate_script
                
                # Inject selection mode JavaScript
                script = """
                () => {
                    if (window.WebAutoSelectionMode && window.WebAutoSelectionMode.isActive()) {
                        return {success: true, message: 'Selection mode already active'};
                    }
                    
                    // Create selection overlay
                    const overlay = document.createElement('div');
                    overlay.id = 'web-auto-selection-overlay';
                    overlay.style.cssText = `
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0, 0, 0, 0.1);
                        z-index: 10000;
                        pointer-events: all;
                    `;
                    document.body.appendChild(overlay);
                    
                    // Create selection indicator
                    const indicator = document.createElement('div');
                    indicator.id = 'web-auto-selection-indicator';
                    indicator.style.cssText = `
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        background: #e74c3c;
                        color: white;
                        padding: 8px 16px;
                        border-radius: 20px;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        font-size: 14px;
                        z-index: 10004;
                    `;
                    indicator.textContent = '🎯 Selection Mode Active - Click to select element, ESC to exit';
                    document.body.appendChild(indicator);
                    
                    // Selection mode state
                    window.WebAutoSelectionMode = {
                        active: true,
                        overlay: overlay,
                        indicator: indicator,
                        selectedElement: null
                    };
                    
                    // Event handlers
                    function handleClick(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const element = e.target;
                        const selector = generateSelector(element);
                        
                        // Highlight selected element
                        const highlight = document.createElement('div');
                        highlight.style.cssText = `
                            position: absolute;
                            background: rgba(46, 204, 113, 0.3);
                            border: 3px solid #2ecc71;
                            pointer-events: none;
                            z-index: 10002;
                            box-shadow: 0 0 15px rgba(46, 204, 113, 0.6);
                        `;
                        
                        const rect = element.getBoundingClientRect();
                        highlight.style.top = (rect.top + window.scrollY) + 'px';
                        highlight.style.left = (rect.left + window.scrollX) + 'px';
                        highlight.style.width = rect.width + 'px';
                        highlight.style.height = rect.height + 'px';
                        
                        document.body.appendChild(highlight);
                        
                        window.WebAutoSelectionMode.selectedElement = {
                            selector: selector,
                            element: element,
                            highlight: highlight
                        };
                        
                        console.log('Element selected:', selector);
                        return false;
                    }
                    
                    function handleKey(e) {
                        if (e.key === 'Escape') {
                            exitSelectionMode();
                        }
                    }
                    
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
                    
                    function exitSelectionMode() {
                        if (window.WebAutoSelectionMode) {
                            // Remove overlay
                            if (window.WebAutoSelectionMode.overlay) {
                                window.WebAutoSelectionMode.overlay.remove();
                            }
                            
                            // Remove indicator
                            if (window.WebAutoSelectionMode.indicator) {
                                window.WebAutoSelectionMode.indicator.remove();
                            }
                            
                            // Remove highlight
                            if (window.WebAutoSelectionMode.selectedElement && 
                                window.WebAutoSelectionMode.selectedElement.highlight) {
                                window.WebAutoSelectionMode.selectedElement.highlight.remove();
                            }
                            
                            window.WebAutoSelectionMode.active = false;
                            
                            // Remove event listeners
                            document.removeEventListener('click', handleClick, true);
                            document.removeEventListener('keydown', handleKey, true);
                        }
                    }
                    
                    // Add event listeners
                    document.addEventListener('click', handleClick, true);
                    document.addEventListener('keydown', handleKey, true);
                    
                    return {success: true, message: 'Selection mode activated'};
                }
                """
                
                result = evaluate_script(function=script)
                
                if "error" in result:
                    return {
                        "success": False,
                        "error": f"Failed to activate selection mode: {result['error']}"
                    }
                
                self.selection_mode = True
                
                return {
                    "success": True,
                    "mode": "selection",
                    "message": "Selection mode activated. Click on any element to select it, or press ESC to exit.",
                    "controls": {
                        "click": "Select element with click",
                        "escape": "Exit selection mode with ESC"
                    }
                }
                
            except Exception as e:
                logging.error(f"Failed to enter selection mode: {str(e)}")
                return {
                    "success": False,
                    "error": str(e),
                    "message": "Failed to enter selection mode"
                }
        else:
            # Fallback selection mode
            self.selection_mode = True
            return {
                "success": True,
                "mode": "selection",
                "message": "Fallback selection mode activated. Please manually select elements.",
                "controls": {
                    "fallback": "Manual selection mode"
                }
            }
    
    def exit_selection_mode(self) -> Dict[str, Any]:
        """
        Exit visual element selection mode.
        
        Returns:
            Exit status
        """
        if self.mcp_available:
            try:
                from mcp.chrome_devtools import evaluate_script
                
                script = """
                () => {
                    if (window.WebAutoSelectionMode) {
                        const exitMode = window.WebAutoSelectionMode.exitSelectionMode || 
                                        function() {
                                            if (this.overlay) this.overlay.remove();
                                            if (this.indicator) this.indicator.remove();
                                            if (this.selectedElement && this.selectedElement.highlight) {
                                                this.selectedElement.highlight.remove();
                                            }
                                            this.active = false;
                                            // Remove event listeners
                                            document.removeEventListener('click', arguments.callee, true);
                                            document.removeEventListener('keydown', arguments.callee, true);
                                        };
                        
                        exitMode.call(window.WebAutoSelectionMode);
                        window.WebAutoSelectionMode = null;
                        
                        return {success: true, message: 'Selection mode deactivated'};
                    }
                    
                    return {success: true, message: 'Selection mode was not active'};
                }
                """
                
                result = evaluate_script(function=script)
                
                if "error" in result:
                    logging.error(f"Failed to deactivate selection mode: {result['error']}")
                
                self.selection_mode = False
                self.highlighted_element = None
                
                return {
                    "success": True,
                    "mode": "normal",
                    "message": "Selection mode deactivated"
                }
                
            except Exception as e:
                logging.error(f"Failed to exit selection mode: {str(e)}")
                # Still update local state
                self.selection_mode = False
                self.highlighted_element = None
                
                return {
                    "success": True,
                    "mode": "normal",
                    "message": "Selection mode deactivated (locally)"
                }
        else:
            # Fallback exit
            self.selection_mode = False
            self.highlighted_element = None
            
            return {
                "success": True,
                "mode": "normal",
                "message": "Fallback selection mode deactivated"
            }
    
    def get_selected_element(self) -> Dict[str, Any]:
        """
        Get the currently selected element information.
        
        Returns:
            Selected element information
        """
        if self.mcp_available:
            try:
                from mcp.chrome_devtools import evaluate_script
                
                script = """
                () => {
                    if (window.WebAutoSelectionMode && window.WebAutoSelectionMode.selectedElement) {
                        const selected = window.WebAutoSelectionMode.selectedElement;
                        const element = selected.element;
                        
                        return {
                            selector: selected.selector,
                            tagName: element.tagName.toLowerCase(),
                            className: element.className,
                            id: element.id,
                            textContent: element.textContent ? element.textContent.substring(0, 100) : ''
                        };
                    }
                    
                    return null;
                }
                """
                
                result = evaluate_script(function=script)
                
                if "error" in result:
                    return {
                        "success": False,
                        "error": f"Failed to get selected element: {result['error']}"
                    }
                
                if result:
                    return {
                        "success": True,
                        "selected_element": result
                    }
                else:
                    return {
                        "success": False,
                        "error": "No element currently selected"
                    }
                
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e)
                }
        else:
            # Fallback - no real selection in fallback mode
            return {
                "success": False,
                "error": "Element selection not available in fallback mode"
            }
    
    def get_element_info(self, element_selector: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific element.
        
        Args:
            element_selector: CSS selector for the element
            
        Returns:
            Element information including position, size, and attributes
        """
        validation = self.validate_selector(element_selector)
        
        if not validation.get("valid"):
            return validation
        
        if self.mcp_available:
            try:
                from mcp.chrome_devtools import evaluate_script
                
                script = f"""
                () => {{
                    try {{
                        const element = document.querySelector('{element_selector}');
                        if (!element) {{
                            return {{error: 'Element not found'}};
                        }}
                        
                        const rect = element.getBoundingClientRect();
                        const computedStyle = window.getComputedStyle(element);
                        
                        return {{
                            success: true,
                            element: {{
                                tag: element.tagName.toLowerCase(),
                                classes: Array.from(element.classList),
                                id: element.id || '',
                                text: element.textContent ? element.textContent.substring(0, 200) : '',
                                position: {{
                                    x: rect.left + window.scrollX,
                                    y: rect.top + window.scrollY
                                }},
                                size: {{
                                    width: rect.width,
                                    height: rect.height
                                }},
                                visible: computedStyle.display !== 'none' && 
                                         computedStyle.visibility !== 'hidden' && 
                                         rect.width > 0 && rect.height > 0,
                                attributes: {{
                                    id: element.id || '',
                                    class: element.className || '',
                                    href: element.href || '',
                                    src: element.src || '',
                                    type: element.type || ''
                                }}
                            }},
                            selector: '{element_selector}'
                        }};
                    }} catch (e) {{
                        return {{error: 'Failed to analyze element: ' + e.message}};
                    }}
                }}
                """
                
                result = evaluate_script(function=script)
                
                if "error" in result:
                    return {
                        "success": False,
                        "error": f"Failed to get element info: {result['error']}"
                    }
                
                return result
                
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e)
                }
        else:
            # Fallback element info
            element_info = self._simulate_element_lookup(element_selector)
            if element_info:
                return {
                    "success": True,
                    "element": {
                        "tag": element_info["tag"],
                        "classes": element_info["classes"],
                        "id": element_info.get("id", ""),
                        "text": element_info["text"],
                        "position": {"x": 100, "y": 200},
                        "size": {"width": 300, "height": 150},
                        "visible": True,
                        "attributes": {
                            "id": element_info.get("id", ""),
                            "class": " ".join(element_info["classes"]),
                            "href": "",
                            "src": "",
                            "type": ""
                        }
                    },
                    "selector": element_selector
                }
            else:
                return {
                    "success": False,
                    "error": "Element not found in fallback mode"
                }
    
    def take_screenshot(self, full_page: bool = False, element_selector: Optional[str] = None) -> Dict[str, Any]:
        """
        Take a screenshot of the current page or specific element.
        
        Args:
            full_page: Whether to capture full page
            element_selector: Optional element to capture
            
        Returns:
            Screenshot information
        """
        if not self.mcp_available:
            return {
                "success": False,
                "error": "Screenshot not available in fallback mode"
            }
        
        try:
            from mcp.chrome_devtools import take_screenshot
            
            if element_selector:
                result = take_screenshot(uid=element_selector)
            elif full_page:
                result = take_screenshot(fullPage=True)
            else:
                result = take_screenshot()
            
            if "error" in result:
                return {
                    "success": False,
                    "error": f"Screenshot failed: {result['error']}"
                }
            
            return {
                "success": True,
                "screenshot_info": result,
                "full_page": full_page,
                "element_selector": element_selector
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }


# Example usage and testing
if __name__ == "__main__":
    # Test browser manager functionality
    browser = BrowserManager()
    
    # Test page opening
    result = browser.open_page("https://example.com")
    print(f"Page opened: {result}")
    
    # Test selector validation
    selector_result = browser.validate_selector("h1")
    print(f"Selector validation: {selector_result}")
    
    # Test element info
    element_result = browser.get_element_info("h1")
    print(f"Element info: {element_result}")
    
    # Test selection mode
    print("Testing selection mode...")
    selection_result = browser.enter_selection_mode()
    print(f"Selection mode: {selection_result}")
    
    # Wait for user to select an element (simulated)
    time.sleep(2)
    
    # Get selected element
    selected = browser.get_selected_element()
    print(f"Selected element: {selected}")
    
    # Exit selection mode
    exit_result = browser.exit_selection_mode()
    print(f"Exit selection mode: {exit_result}")

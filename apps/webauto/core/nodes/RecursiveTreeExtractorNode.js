#!/usr/bin/env node

/**
 * 通用递归树遍历器
 * 基于DOM树结构递归查找任意类型的容器和元素
 */

import { BaseNode } from '../base-node.js';

class RecursiveTreeExtractorNode extends BaseNode {
    constructor(nodeId, config) {
        super(nodeId, config);
        this.extractedData = null;
    }

    async execute(context, params) {
        const startTime = Date.now();

        try {
            this.log('info', `Starting recursive tree extractor: ${this.id}`);

            // Get inputs
            const page = this.getInput(context, 'page');
            if (!page) {
                throw new Error('Page input is required');
            }

            // Get extraction parameters
            const traversalRules = this.getInput(context, 'traversalRules') ||
                                 params.traversalRules || this.getDefaultTraversalRules();
            const maxResults = this.getInput(context, 'maxResults') ||
                              params.maxResults || 50;
            const scrollConfig = this.getInput(context, 'scrollConfig') ||
                                params.scrollConfig || { enabled: true, count: 3, delay: 2000 };

            this.log('info', `Traversal rules: ${JSON.stringify(traversalRules, null, 2)}`);

            // Scroll to load more content if enabled
            if (scrollConfig.enabled) {
                await this.performScroll(page, scrollConfig);
            }

            // Execute recursive tree traversal
            const results = await this.executeRecursiveTraversal(page, traversalRules, maxResults);

            // Store extracted data
            this.extractedData = results;

            // Set outputs - 通用容器输出，不限制类型
            this.setOutput(context, 'containers', results.containers);
            this.setOutput(context, 'elements', results.elements);
            this.setOutput(context, 'links', results.links);
            this.setOutput(context, 'traversalResult', results);

            const executionResult = {
                success: true,
                message: `Successfully extracted ${results.containers.length} containers, ${results.elements.length} elements, ${results.links.length} links`,
                data: {
                    totalContainers: results.containers.length,
                    totalElements: results.elements.length,
                    totalLinks: results.links.length,
                    traversalDepth: results.maxDepth,
                    executionTime: Date.now() - startTime
                },
                executionTime: Date.now() - startTime
            };

            this.log('info', `Recursive tree extractor completed: ${this.id}`);
            return executionResult;

        } catch (error) {
            const errorResult = {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime
            };

            this.setOutput(context, 'containers', []);
            this.setOutput(context, 'elements', []);
            this.setOutput(context, 'links', []);
            this.setOutput(context, 'traversalResult', { error: error.message });

            this.log('error', `Recursive tree extractor failed: ${this.id} - ${error.message}`);
            return errorResult;
        }
    }

    async performScroll(page, scrollConfig) {
        this.log('info', `Performing ${scrollConfig.count} scrolls to load more content`);

        for (let i = 0; i < scrollConfig.count; i++) {
            try {
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });

                this.log('info', `Scroll ${i + 1}/${scrollConfig.count} completed`);

                // Wait for content to load
                await new Promise(resolve => setTimeout(resolve, scrollConfig.delay));
            } catch (error) {
                this.log('warn', `Scroll ${i + 1} failed: ${error.message}`);
            }
        }
    }

    async executeRecursiveTraversal(page, rules, maxResults) {
        const results = {
            containers: [],
            elements: [],
            links: [],
            maxDepth: 0,
            traversalStats: {
                totalNodesVisited: 0,
                containerMatches: 0,
                elementMatches: 0,
                linkMatches: 0,
                extractionErrors: 0
            }
        };

        try {
            // Execute traversal in the browser context
            const traversalResult = await page.evaluate((rules, maxResults) => {
                const extractedContainers = [];
                const extractedElements = [];
                const extractedLinks = [];
                let maxDepthReached = 0;
                let nodesVisited = 0;

                function traverseRecursive(node, currentRules, depth = 0, path = []) {
                    nodesVisited++;
                    maxDepthReached = Math.max(maxDepthReached, depth);

                    const currentPath = [...path, { tagName: node.tagName, depth }];

                    // Check if current node matches any rule
                    if (currentRules.rules) {
                        currentRules.rules.forEach(rule => {
                            if (matchesSelector(node, rule.selector)) {
                                const matchData = {
                                    node: serializeNode(node),
                                    rule: rule.name || rule.selector,
                                    depth: depth,
                                    path: currentPath,
                                    matchedAt: new Date().toISOString()
                                };

                                // Extract data based on rule type
                                switch (rule.type) {
                                    case 'container':
                                        matchData.containerType = rule.containerType || 'generic';
                                        matchData.children = extractChildrenData(node, rule);
                                        extractedContainers.push(matchData);
                                        break;

                                    case 'element':
                                        matchData.elementType = rule.elementType || 'generic';
                                        matchData.content = extractElementContent(node, rule);
                                        extractedElements.push(matchData);
                                        break;

                                    case 'link':
                                        matchData.linkData = extractLinkData(node, rule);
                                        extractedLinks.push(matchData.linkData);
                                        extractedElements.push(matchData);
                                        break;
                                }

                                // Continue traversal if specified
                                if (rule.continueTraversal !== false) {
                                    traverseChildren(node, rule, depth, currentPath);
                                }
                            }
                        });
                    }

                    // Default traversal for children if no specific rules match
                    if (currentRules.defaultTraversal !== false) {
                        traverseChildren(node, null, depth, currentPath);
                    }
                }

                function traverseChildren(node, rule, depth, path) {
                    if (node.children && node.children.length > 0) {
                        Array.from(node.children).forEach(child => {
                            traverseRecursive(child, rule || currentRules, depth + 1, path);
                        });
                    }
                }

                function matchesSelector(node, selector) {
                    if (!selector) return false;
                    try {
                        return node.matches ? node.matches(selector) :
                               node.matches.call(node, selector);
                    } catch (e) {
                        return false;
                    }
                }

                function serializeNode(node) {
                    return {
                        tagName: node.tagName,
                        className: node.className,
                        id: node.id,
                        href: node.href || null,
                        textContent: node.textContent?.trim().substring(0, 200) || '',
                        attributes: getAttributes(node)
                    };
                }

                function getAttributes(node) {
                    const attrs = {};
                    if (node.attributes) {
                        for (let attr of node.attributes) {
                            attrs[attr.name] = attr.value;
                        }
                    }
                    return attrs;
                }

                function extractChildrenData(node, rule) {
                    if (rule.extractChildren) {
                        return Array.from(node.children).map(child => serializeNode(child));
                    }
                    return [];
                }

                function extractElementContent(node, rule) {
                    const content = {};

                    // Extract text content
                    if (rule.extractText !== false) {
                        content.text = node.textContent?.trim() || '';
                    }

                    // Extract specific attributes
                    if (rule.extractAttributes) {
                        rule.extractAttributes.forEach(attr => {
                            content[attr] = node.getAttribute(attr);
                        });
                    }

                    // Extract HTML content
                    if (rule.extractHTML) {
                        content.html = node.innerHTML;
                    }

                    // Extract links within this element
                    if (rule.extractLinks) {
                        const links = node.querySelectorAll('a[href]');
                        content.links = Array.from(links).map(link => extractLinkData(link, {}));
                    }

                    return content;
                }

                function extractLinkData(node, rule) {
                    const linkData = {
                        href: node.href || '',
                        text: node.textContent?.trim() || '',
                        title: node.title || '',
                        className: node.className,
                        id: node.id,
                        target: node.target || '_self',
                        extractedAt: new Date().toISOString()
                    };

                    // Classify link type
                    linkData.isPostLink = isPostLink(linkData.href);
                    linkData.isUserLink = isUserLink(linkData.href);
                    linkData.isHashtagLink = isHashtagLink(linkData.href);
                    linkData.isHomepageLink = isHomepageLink(linkData.href);

                    // Extract additional attributes
                    if (rule.extractAttributes) {
                        rule.extractAttributes.forEach(attr => {
                            linkData[attr] = node.getAttribute(attr);
                        });
                    }

                    return linkData;
                }

                function isPostLink(href) {
                    if (!href) return false;
                    const patterns = [
                        /weibo\.com\/\d+\/[A-Za-z0-9]+/,
                        /weibo\.com\/\d+\/[A-Za-z0-9_\-]+/,
                        /\/detail\//,
                        /\/status\//,
                        /\/p\/\d+/
                    ];
                    return patterns.some(pattern => pattern.test(href));
                }

                function isUserLink(href) {
                    if (!href) return false;
                    return /weibo\.com\/u\/\d+/.test(href) || /\/u\//.test(href);
                }

                function isHashtagLink(href) {
                    if (!href) return false;
                    return /s\.weibo\.com\/weibo\?q=/.test(href) || /\/hashtag\//.test(href);
                }

                function isHomepageLink(href) {
                    if (!href) return false;
                    return /weibo\.com\/?$/.test(href) || /weibo\.com\/(home|index)?$/i.test(href);
                }

                // Start traversal from body
                const startNode = document.body;
                traverseRecursive(startNode, rules, 0);

                return {
                    containers: extractedContainers.slice(0, maxResults),
                    elements: extractedElements.slice(0, maxResults),
                    links: extractedLinks.slice(0, maxResults),
                    maxDepth: maxDepthReached,
                    stats: {
                        totalNodesVisited: nodesVisited,
                        containerMatches: extractedContainers.length,
                        elementMatches: extractedElements.length,
                        linkMatches: extractedLinks.length
                    }
                };

            }, rules, maxResults);

            // Merge results
            results.containers = traversalResult.containers;
            results.elements = traversalResult.elements;
            results.links = traversalResult.links;
            results.maxDepth = traversalResult.maxDepth;
            results.traversalStats = traversalResult.stats;

            this.log('info', `Traversal completed: visited ${results.traversalStats.totalNodesVisited} nodes, found ${results.traversalStats.containerMatches} containers, ${results.traversalStats.elementMatches} elements, ${results.traversalStats.linkMatches} links`);

        } catch (error) {
            this.log('error', `Traversal execution failed: ${error.message}`);
            results.traversalStats.extractionErrors = 1;
        }

        return results;
    }

    getDefaultTraversalRules() {
        return {
            name: "Weibo Generic Traversal",
            defaultTraversal: true,
            rules: [
                {
                    name: "Feed Container",
                    type: "container",
                    selector: "[class*='Feed'], [class*='feed'], .Feed, .feed, [class*='card'], [class*='Card'], article",
                    containerType: "feed",
                    extractChildren: true,
                    continueTraversal: true
                },
                {
                    name: "Post Container",
                    type: "container",
                    selector: "[class*='item'], [class*='Item'], [class*='content'], [class*='Content'], [class*='post'], [class*='Post']",
                    containerType: "post",
                    extractChildren: true,
                    continueTraversal: true
                },
                {
                    name: "Link Element",
                    type: "link",
                    selector: "a[href*='/']",
                    extractAttributes: ["href", "title", "target", "data-*"],
                    continueTraversal: false
                },
                {
                    name: "Text Element",
                    type: "element",
                    selector: "[class*='text'], [class*='title'], [class*='content'], h1, h2, h3, p, span",
                    elementType: "text",
                    extractText: true,
                    extractLinks: true,
                    continueTraversal: true
                }
            ]
        };
    }

    // Helper methods
    getExtractedContainers() {
        return this.extractedData?.containers || [];
    }

    getExtractedElements() {
        return this.extractedData?.elements || [];
    }

    getExtractedLinks() {
        return this.extractedData?.links || [];
    }

    getTraversalStats() {
        return this.extractedData?.traversalStats || null;
    }

    log(level, message) {
        console.log(`[${level.toUpperCase()}] RecursiveTreeExtractorNode: ${message}`);
    }

    emit(eventName, data) {
        if (this._eventHandlers && this._eventHandlers[eventName]) {
            this._eventHandlers[eventName].forEach(handler => handler(data));
        }
    }

    on(eventName, handler) {
        if (!this._eventHandlers) {
            this._eventHandlers = {};
        }
        if (!this._eventHandlers[eventName]) {
            this._eventHandlers[eventName] = [];
        }
        this._eventHandlers[eventName].push(handler);
    }
}

export default RecursiveTreeExtractorNode;
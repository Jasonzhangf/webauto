#!/usr/bin/env node

/**
 * Container Extractor Node
 * Extracts data from containers using nested selector patterns for Weibo posts
 */

const { BaseNode } = require('../base-node');

class ContainerExtractorNode extends BaseNode {
    constructor(nodeId, config) {
        super(nodeId, config);
        this.extractedData = null;
    }

    async execute(context, params) {
        const startTime = Date.now();

        try {
            this.emit('log', { level: 'info', message: `Starting container extractor node: ${this.id}` });

            // Get inputs
            const page = this.getInput(context, 'page');
            if (!page) {
                throw new Error('Page input is required');
            }

            // Get extraction parameters
            const containerSelector = this.getInput(context, 'containerSelector') ||
                                   params.containerSelector || '[class*="Feed"]';
            const linkSelector = this.getInput(context, 'linkSelector') ||
                               params.linkSelector || 'a[href*="/"]';
            const maxPosts = this.getInput(context, 'maxPosts') ||
                            params.maxPosts || 20;
            const filterPostLinks = params.filterPostLinks !== false;

            this.emit('log', {
                level: 'info',
                message: `Extracting from containers with selector: ${containerSelector}`
            });

            // Execute extraction in browser context
            const result = await page.evaluate((config) => {
                const {
                    containerSelector,
                    linkSelector,
                    maxPosts,
                    filterPostLinks
                } = config;

                // Get all container elements
                const containers = document.querySelectorAll(containerSelector);
                const visibleContainers = Array.from(containers).filter(el => el.offsetParent !== null);

                console.log(`Found ${containers.length} containers, ${visibleContainers.length} visible`);

                const posts = [];
                const processedLinks = new Set();

                // Process each container
                visibleContainers.slice(0, maxPosts).forEach((container, index) => {
                    try {
                        const links = container.querySelectorAll(linkSelector);
                        const containerData = {
                            index,
                            containerSelector,
                            linkCount: links.length,
                            postLinks: [],
                            metadata: this.extractContainerMetadata(container)
                        };

                        // Extract links from this container
                        Array.from(links).forEach(link => {
                            const href = link.href?.trim();
                            const text = link.textContent?.trim();

                            if (href && !processedLinks.has(href)) {
                                processedLinks.add(href);

                                const linkData = {
                                    href,
                                    text,
                                    className: link.className,
                                    isPostLink: filterPostLinks ? this.isPostLink(href) : true,
                                    containerIndex: index,
                                    timestamp: new Date().toISOString()
                                };

                                containerData.postLinks.push(linkData);
                            }
                        });

                        posts.push(containerData);

                    } catch (error) {
                        console.warn(`Error processing container ${index}:`, error.message);
                    }
                });

                return {
                    containers: {
                        total: containers.length,
                        visible: visibleContainers.length,
                        processed: posts.length,
                        selector: containerSelector
                    },
                    posts: posts,
                    summary: {
                        totalLinks: posts.reduce((sum, p) => sum + p.postLinks.length, 0),
                        uniqueLinks: processedLinks.size,
                        postLinks: posts.reduce((sum, p) => sum + p.postLinks.filter(l => l.isPostLink).length, 0),
                        averageLinksPerPost: posts.length > 0 ?
                            (posts.reduce((sum, p) => sum + p.postLinks.length, 0) / posts.length).toFixed(2) : 0
                    }
                };

            }, {
                containerSelector,
                linkSelector,
                maxPosts,
                filterPostLinks
            });

            // Store extracted data
            this.extractedData = result;

            // Set outputs
            this.setOutput(context, 'containers', result.containers);
            this.setOutput(context, 'links', result.posts.flatMap(p => p.postLinks));
            this.setOutput(context, 'extractionResult', result);

            this.emit('log', {
                level: 'info',
                message: `Extracted ${result.summary.totalLinks} links from ${result.containers.processed} containers`
            });

            this.emit('log', {
                level: 'info',
                message: `Found ${result.summary.postLinks} post links`
            });

            const executionResult = {
                success: true,
                message: `Successfully extracted ${result.summary.totalLinks} links from ${result.containers.processed} containers`,
                data: {
                    containers: result.containers,
                    summary: result.summary,
                    config: {
                        containerSelector,
                        linkSelector,
                        maxPosts,
                        filterPostLinks
                    }
                },
                executionTime: Date.now() - startTime
            };

            this.emit('log', { level: 'info', message: `Container extractor node completed: ${this.id}` });
            return executionResult;

        } catch (error) {
            const errorResult = {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime
            };

            this.setOutput(context, 'containers', { total: 0, visible: 0, processed: 0 });
            this.setOutput(context, 'links', []);
            this.setOutput(context, 'extractionResult', { error: error.message });

            this.emit('log', {
                level: 'error',
                message: `Container extractor node failed: ${this.id} - ${error.message}`
            });
            return errorResult;
        }
    }

    // Helper function used in page.evaluate context
    extractContainerMetadata(container) {
        return {
            tagName: container.tagName,
            className: container.className,
            id: container.id,
            text: container.textContent?.substring(0, 200),
            children: container.children.length,
            rect: container.getBoundingClientRect(),
            timestamp: new Date().toISOString()
        };
    }

    // Helper function used in page.evaluate context
    isPostLink(href) {
        if (!href) return false;

        // Weibo post link patterns
        const postPatterns = [
            /weibo\.com\/\d+\/[A-Za-z0-9]+/,  // weibo.com/user_id/post_id
            /weibo\.com\/\d+\/[A-Za-z0-9_\-]+/, // weibo.com/user_id/post_id_with_underscores
            /\/detail\//,                      // /detail/ in path
            /\/status\//,                      // /status/ in path
            /\?[A-Za-z0-9]{8,}$/              // ending with post ID in query
        ];

        return postPatterns.some(pattern => pattern.test(href));
    }

    // Method to get filtered post links
    getPostLinks() {
        if (!this.extractedData) return [];

        return this.extractedData.posts.flatMap(post =>
            post.postLinks.filter(link => link.isPostLink)
        );
    }

    // Method to get all links
    getAllLinks() {
        if (!this.extractedData) return [];

        return this.extractedData.posts.flatMap(post => post.postLinks);
    }

    // Method to get container statistics
    getContainerStats() {
        if (!this.extractedData) return null;

        return this.extractedData.summary;
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

module.exports = ContainerExtractorNode;
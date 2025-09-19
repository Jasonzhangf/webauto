#!/usr/bin/env node

/**
 * Enhanced Container Extractor Node
 * Supports multiple container lookup strategies with precise selector configuration
 */

const { BaseNode } = require('../base-node');

class EnhancedContainerExtractorNode extends BaseNode {
    constructor(nodeId, config) {
        super(nodeId, config);
        this.extractedData = null;

        // Container lookup strategies
        this.strategies = {
            'specific': this.executeSpecificStrategy.bind(this),
            'pattern': this.executePatternStrategy.bind(this),
            'hybrid': this.executeHybridStrategy.bind(this),
            'cascading': this.executeCascadingStrategy.bind(this)
        };

        // Default container configurations for different page types
        this.containerConfigs = {
            'weibo_homepage': {
                strategies: ['specific', 'pattern'],
                specificSelectors: [
                    'div.woo-box-flex.woo-box-alignCenter.Card_title_3q1Wz',
                    'div.woo-box-flex.woo-box-alignCenter.Card_title_2iW4R',
                    'div.Feed_body_3R0rO',
                    'div[class*="Feed_body"]',
                    'div[class*="Main_body"]'
                ],
                patternSelector: '[class*="Feed"]',
                fallbackSelector: 'div[class*="card"], article, main div'
            },
            'weibo_search': {
                strategies: ['specific', 'pattern'],
                specificSelectors: [
                    'div[class*="search-feed"]',
                    'div[class*="Feed"]',
                    'div[class*="card"]'
                ],
                patternSelector: '[class*="Feed"]',
                fallbackSelector: 'div[class*="content"]'
            },
            'weibo_profile': {
                strategies: ['specific', 'pattern'],
                specificSelectors: [
                    'div[class*="profile-feed"]',
                    'div[class*="Feed"]',
                    'div[class*="Profile_feed"]'
                ],
                patternSelector: '[class*="Feed"]',
                fallbackSelector: 'article, div[class*="post"]'
            },
            'generic': {
                strategies: ['pattern'],
                specificSelectors: [],
                patternSelector: 'article, main, div[class*="content"], div[class*="feed"]',
                fallbackSelector: 'div'
            }
        };
    }

    async execute(context, params) {
        const startTime = Date.now();

        try {
            this.log('info', `Starting enhanced container extractor node: ${this.id}`);

            // Get inputs
            const page = this.getInput(context, 'page');
            if (!page) {
                throw new Error('Page input is required');
            }

            // Get extraction parameters
            const pageType = this.getInput(context, 'pageType') || params.pageType || 'weibo_homepage';
            const strategy = this.getInput(context, 'strategy') || params.strategy || 'hybrid';
            const linkSelector = this.getInput(context, 'linkSelector') ||
                               params.linkSelector || 'a[href*="/"]';
            const maxPosts = this.getInput(context, 'maxPosts') ||
                            params.maxPosts || 20;
            const filterPostLinks = params.filterPostLinks !== false;

            // Get container configuration for page type
            const containerConfig = this.containerConfigs[pageType] || this.containerConfigs['generic'];

            this.log('info', `Extracting from ${pageType} using ${strategy} strategy`);

            // Execute extraction using specified strategy
            const result = await this.executeStrategy(page, strategy, containerConfig, {
                linkSelector,
                maxPosts,
                filterPostLinks,
                pageType
            });

            // Store extracted data
            this.extractedData = result;

            // Set outputs
            this.setOutput(context, 'containers', result.containers);
            this.setOutput(context, 'links', result.posts.flatMap(p => p.postLinks));
            this.setOutput(context, 'extractionResult', result);
            this.setOutput(context, 'strategyUsed', strategy);
            this.setOutput(context, 'pageType', pageType);

            this.log('info', `Extracted ${result.summary.totalLinks} links from ${result.containers.processed} containers`);
            this.log('info', `Found ${result.summary.postLinks} post links`);
            this.log('info', `Strategy used: ${strategy}`);

            const executionResult = {
                success: true,
                message: `Successfully extracted ${result.summary.totalLinks} links using ${strategy} strategy`,
                data: {
                    containers: result.containers,
                    summary: result.summary,
                    strategy: strategy,
                    pageType: pageType,
                    config: {
                        linkSelector,
                        maxPosts,
                        filterPostLinks
                    }
                },
                executionTime: Date.now() - startTime
            };

            this.log('info', `Enhanced container extractor node completed: ${this.id}`);
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

            this.log('error', `Enhanced container extractor node failed: ${this.id} - ${error.message}`);
            return errorResult;
        }
    }

    async executeStrategy(page, strategy, containerConfig, options) {
        if (!this.strategies[strategy]) {
            throw new Error(`Unknown strategy: ${strategy}`);
        }

        return await this.strategies[strategy](page, containerConfig, options);
    }

    async executeSpecificStrategy(page, containerConfig, options) {
        this.log('info', 'Using specific selector strategy');

        const result = await page.evaluate((config) => {
            const { specificSelectors, linkSelector, maxPosts, filterPostLinks } = config;

            let foundContainers = [];
            let usedSelector = null;

            // Try each specific selector in order
            for (const selector of specificSelectors) {
                try {
                    const containers = document.querySelectorAll(selector);
                    const visibleContainers = Array.from(containers).filter(el => el.offsetParent !== null);

                    if (visibleContainers.length > 0) {
                        foundContainers = visibleContainers;
                        usedSelector = selector;
                        console.log(`Found ${visibleContainers.length} containers using specific selector: ${selector}`);
                        break;
                    }
                } catch (error) {
                    console.warn(`Error with selector ${selector}:`, error.message);
                }
            }

            // Process found containers
            return this.processContainers(foundContainers, usedSelector, config);
        }, {
            specificSelectors: containerConfig.specificSelectors,
            linkSelector: options.linkSelector,
            maxPosts: options.maxPosts,
            filterPostLinks: options.filterPostLinks
        });

        return {
            ...result,
            strategy: 'specific',
            selectorUsed: result.selectorUsed || 'none'
        };
    }

    async executePatternStrategy(page, containerConfig, options) {
        this.log('info', 'Using pattern matching strategy');

        const result = await page.evaluate((config) => {
            const { patternSelector, linkSelector, maxPosts, filterPostLinks } = config;

            const containers = document.querySelectorAll(patternSelector);
            const visibleContainers = Array.from(containers).filter(el => el.offsetParent !== null);

            console.log(`Found ${containers.length} containers, ${visibleContainers.length} visible using pattern: ${patternSelector}`);

            return this.processContainers(visibleContainers, patternSelector, config);
        }, {
            patternSelector: containerConfig.patternSelector,
            linkSelector: options.linkSelector,
            maxPosts: options.maxPosts,
            filterPostLinks: options.filterPostLinks
        });

        return {
            ...result,
            strategy: 'pattern',
            selectorUsed: containerConfig.patternSelector
        };
    }

    async executeHybridStrategy(page, containerConfig, options) {
        this.log('info', 'Using hybrid strategy (specific + pattern fallback)');

        // Try specific first, fall back to pattern
        let result = await this.executeSpecificStrategy(page, containerConfig, options);

        if (result.containers.processed === 0) {
            this.log('info', 'Specific strategy found no containers, trying pattern strategy');
            result = await this.executePatternStrategy(page, containerConfig, options);
            result.strategy = 'hybrid (pattern fallback)';
        } else {
            result.strategy = 'hybrid (specific)';
        }

        return result;
    }

    async executeCascadingStrategy(page, containerConfig, options) {
        this.log('info', 'Using cascading strategy');

        // Try strategies in order: specific -> pattern -> fallback
        let result = await this.executeSpecificStrategy(page, containerConfig, options);

        if (result.containers.processed === 0) {
            this.log('info', 'Specific strategy found no containers, trying pattern strategy');
            result = await this.executePatternStrategy(page, containerConfig, options);

            if (result.containers.processed === 0 && containerConfig.fallbackSelector) {
                this.log('info', 'Pattern strategy found no containers, trying fallback selector');

                const fallbackResult = await page.evaluate((config) => {
                    const { fallbackSelector, linkSelector, maxPosts, filterPostLinks } = config;

                    const containers = document.querySelectorAll(fallbackSelector);
                    const visibleContainers = Array.from(containers).filter(el => el.offsetParent !== null);

                    console.log(`Found ${containers.length} containers, ${visibleContainers.length} visible using fallback: ${fallbackSelector}`);

                    return this.processContainers(visibleContainers, fallbackSelector, config);
                }, {
                    fallbackSelector: containerConfig.fallbackSelector,
                    linkSelector: options.linkSelector,
                    maxPosts: options.maxPosts,
                    filterPostLinks: options.filterPostLinks
                });

                result = {
                    ...fallbackResult,
                    strategy: 'cascading (fallback)'
                };
            }
        } else {
            result.strategy = 'cascading (specific)';
        }

        return result;
    }

    // Helper function used in page.evaluate context
    processContainers(containers, selector, config) {
        const { linkSelector, maxPosts, filterPostLinks } = config;

        const posts = [];
        const processedLinks = new Set();

        // Process each container
        containers.slice(0, maxPosts).forEach((container, index) => {
            try {
                const links = container.querySelectorAll(linkSelector);
                const containerData = {
                    index,
                    containerSelector: selector,
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
                visible: containers.length,
                processed: posts.length,
                selector: selector
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

    // Method to add custom container configuration
    addContainerConfig(pageType, config) {
        this.containerConfigs[pageType] = {
            ...this.containerConfigs['generic'],
            ...config
        };
    }

    // Method to get available strategies
    getAvailableStrategies() {
        return Object.keys(this.strategies);
    }

    // Method to get available page types
    getAvailablePageTypes() {
        return Object.keys(this.containerConfigs);
    }

    // Method to get container configuration for a page type
    getContainerConfig(pageType) {
        return this.containerConfigs[pageType] || this.containerConfigs['generic'];
    }

    log(level, message) {
        console.log(`[${level.toUpperCase()}] EnhancedContainerExtractor: ${message}`);
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
}

module.exports = EnhancedContainerExtractorNode;
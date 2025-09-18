#!/usr/bin/env node

/**
 * Link Filter Node
 * Filters extracted links based on patterns and criteria
 */

const { BaseNode } = import '../base-node' from '../base-node';

class LinkFilterNode extends BaseNode {
    constructor(nodeId, config) {
        super(nodeId, config);
        this.filterStats = null;
    }

    async execute(context, params) {
        const startTime = Date.now();

        try {
            this.emit('log', { level: 'info', message: `Starting link filter node: ${this.id}` });

            // Get inputs
            const links = this.getInput(context, 'links');
            if (!Array.isArray(links)) {
                throw new Error('Links input must be an array');
            }

            // Get filter parameters
            const filterPatterns = this.getInput(context, 'filterPatterns') || params.filterPatterns || [];
            const includePostLinks = params.includePostLinks !== false;
            const excludePatterns = params.excludePatterns || [];
            const requireHttps = params.requireHttps !== false;
            const uniqueOnly = params.uniqueOnly !== false;

            this.emit('log', {
                level: 'info',
                message: `Filtering ${links.length} links with ${filterPatterns.length} patterns`
            });

            // Apply filters
            let filteredLinks = [...links];

            // Filter by include patterns
            if (filterPatterns.length > 0) {
                filteredLinks = filteredLinks.filter(link => {
                    const href = link.href || '';
                    return filterPatterns.some(pattern => {
                        if (pattern instanceof RegExp) {
                            return pattern.test(href);
                        }
                        return href.includes(pattern);
                    });
                });
            }

            // Exclude patterns
            if (excludePatterns.length > 0) {
                filteredLinks = filteredLinks.filter(link => {
                    const href = link.href || '';
                    return !excludePatterns.some(pattern => {
                        if (pattern instanceof RegExp) {
                            return pattern.test(href);
                        }
                        return href.includes(pattern);
                    });
                });
            }

            // Filter post links
            if (includePostLinks) {
                filteredLinks = filteredLinks.filter(link => link.isPostLink);
            }

            // Require HTTPS
            if (requireHttps) {
                filteredLinks = filteredLinks.filter(link => {
                    const href = link.href || '';
                    return href.startsWith('https://');
                });
            }

            // Remove duplicates
            if (uniqueOnly) {
                const seen = new Set();
                filteredLinks = filteredLinks.filter(link => {
                    const href = link.href || '';
                    if (seen.has(href)) {
                        return false;
                    }
                    seen.add(href);
                    return true;
                });
            }

            // Calculate filter statistics
            const stats = {
                originalCount: links.length,
                filteredCount: filteredLinks.length,
                removedCount: links.length - filteredLinks.length,
                filters: {
                    includePatterns: filterPatterns.length,
                    excludePatterns: excludePatterns.length,
                    includePostLinks,
                    requireHttps,
                    uniqueOnly
                },
                distribution: this.getLinkDistribution(filteredLinks)
            };

            this.filterStats = stats;

            this.emit('log', {
                level: 'info',
                message: `Filtered ${stats.originalCount} → ${stats.filteredCount} links`
            });

            // Set outputs
            this.setOutput(context, 'filteredLinks', filteredLinks);
            this.setOutput(context, 'filterStats', stats);

            const result = {
                success: true,
                message: `Successfully filtered ${stats.originalCount} links to ${stats.filteredCount}`,
                data: {
                    links: filteredLinks,
                    stats: stats,
                    filters: {
                        includePatterns: filterPatterns,
                        excludePatterns: excludePatterns,
                        includePostLinks,
                        requireHttps,
                        uniqueOnly
                    }
                },
                executionTime: Date.now() - startTime
            };

            this.emit('log', { level: 'info', message: `Link filter node completed: ${this.id}` });
            return result;

        } catch (error) {
            const errorResult = {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime
            };

            this.setOutput(context, 'filteredLinks', []);
            this.setOutput(context, 'filterStats', { error: error.message });

            this.emit('log', {
                level: 'error',
                message: `Link filter node failed: ${this.id} - ${error.message}`
            });
            return errorResult;
        }
    }

    // Get distribution of link types
    getLinkDistribution(links) {
        const distribution = {
            byType: {
                postLinks: 0,
                otherLinks: 0
            },
            byDomain: {},
            byContainer: {},
            byProtocol: {
                https: 0,
                http: 0,
                other: 0
            }
        };

        links.forEach(link => {
            // By type
            if (link.isPostLink) {
                distribution.byType.postLinks++;
            } else {
                distribution.byType.otherLinks++;
            }

            // By domain
            try {
                const url = new URL(link.href);
                const domain = url.hostname;
                distribution.byDomain[domain] = (distribution.byDomain[domain] || 0) + 1;
            } catch (e) {
                // Invalid URL
                distribution.byDomain['invalid'] = (distribution.byDomain['invalid'] || 0) + 1;
            }

            // By container
            if (link.containerIndex !== undefined) {
                distribution.byContainer[link.containerIndex] = (distribution.byContainer[link.containerIndex] || 0) + 1;
            }

            // By protocol
            if (link.href.startsWith('https://')) {
                distribution.byProtocol.https++;
            } else if (link.href.startsWith('http://')) {
                distribution.byProtocol.http++;
            } else {
                distribution.byProtocol.other++;
            }
        });

        return distribution;
    }

    // Predefined filter patterns for common use cases
    getPredefinedFilters() {
        return {
            weiboPosts: [
                /weibo\.com\/\d+\/[A-Za-z0-9]+/,
                /weibo\.com\/\d+\/[A-Za-z0-9_\-]+/,
                /\/detail\//,
                /\/status\//
            ],
            weiboUsers: [
                /weibo\.com\/u\/\d+/,
                /weibo\.com\/[A-Za-z0-9_]+$/
            ],
            externalLinks: [
                /^https?:\/\/(?!weibo\.com)/
            ],
            mediaLinks: [
                /\.(jpg|jpeg|png|gif|mp4|mp3|avi|mov)$/i,
                /weibo\.com\/video\//,
                /weibo\.com\/tv\//
            ],
            hashtagLinks: [
                /weibo\.com\/search\//,
                /weibo\.com\/hashtag\//
            ]
        };
    }

    // Method to create filter patterns from keywords
    createKeywordFilters(keywords) {
        return keywords.map(keyword => {
            if (keyword.startsWith('regex:')) {
                try {
                    return new RegExp(keyword.slice(5));
                } catch (e) {
                    console.warn(`Invalid regex pattern: ${keyword}`);
                    return keyword;
                }
            }
            return keyword;
        });
    }

    // Method to validate and normalize filters
    normalizeFilters(filters) {
        if (!Array.isArray(filters)) {
            filters = [filters];
        }

        return filters.map(filter => {
            if (typeof filter === 'string') {
                return {
                    pattern: filter,
                    type: 'includes'
                };
            }
            return filter;
        });
    }

    // Method to get filter statistics
    getFilterStats() {
        return this.filterStats;
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

export default LinkFilterNode;
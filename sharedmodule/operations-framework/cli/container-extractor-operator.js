#!/usr/bin/env node

/**
 * Container-Based Extractor Operator
 * Supports nested container extraction for Weibo post links
 */

const path = require('path');
const fs = require('fs').promises;

class ContainerExtractorOperator {
  constructor() {
    this.config = {
      id: 'container-extractor',
      name: 'Container Extractor Operator',
      type: 'extractor',
      description: 'Extracts data from containers using nested selector patterns',
      version: '1.0.0'
    };
    this._browserOperator = null;
  }

  setBrowserOperator(browserOperator) {
    this._browserOperator = browserOperator;
  }

  async execute(params) {
    const startTime = Date.now();

    try {
      switch (params.action) {
        case 'extractPostLinks':
          return await this.extractPostLinks(params);
        case 'extractFromContainer':
          return await this.extractFromContainer(params);
        case 'saveToFile':
          return await this.saveToFile(params);
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async extractPostLinks(params) {
    const startTime = Date.now();

    if (!this._browserOperator || !this._browserOperator.getPage()) {
      throw new Error('Browser not initialized. Please start browser first.');
    }

    try {
      console.log('🔍 Extracting post links from containers...');
      const page = this._browserOperator.getPage();

      const result = await page.evaluate((config) => {
        const {
          containerSelector = 'article',
          linkSelector = 'a[href*="/"]',
          maxPosts = 10,
          filterPostLinks = true,
          includeMetadata = true
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
              metadata: includeMetadata ? this.extractContainerMetadata(container) : null
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
            averageLinksPerPost: posts.length > 0 ? (posts.reduce((sum, p) => sum + p.postLinks.length, 0) / posts.length).toFixed(2) : 0
          }
        };

      }, {
        containerSelector: params.containerSelector || 'article',
        linkSelector: params.linkSelector || 'a[href*="/"]',
        maxPosts: params.maxPosts || 10,
        filterPostLinks: params.filterPostLinks !== false,
        includeMetadata: params.includeMetadata !== false
      });

      console.log(`✅ Extracted ${result.summary.totalLinks} links from ${result.containers.processed} containers`);
      console.log(`📊 Found ${result.summary.postLinks} post links`);

      return {
        success: true,
        data: {
          message: `Extracted ${result.summary.totalLinks} links from ${result.containers.processed} containers`,
          extraction: result,
          config: params
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Failed to extract post links: ${error.message}`);
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async extractFromContainer(params) {
    const startTime = Date.now();

    if (!this._browserOperator || !this._browserOperator.getPage()) {
      throw new Error('Browser not initialized. Please start browser first.');
    }

    try {
      console.log('🎯 Extracting from specific container...');
      const page = this._browserOperator.getPage();

      const result = await page.evaluate((config) => {
        const {
          containerSelector,
          selectors = [],
          maxItems = 50
        } = config;

        const container = document.querySelector(containerSelector);
        if (!container) {
          return { error: `Container not found: ${containerSelector}` };
        }

        const extractedData = {};

        // Extract data using each selector
        selectors.forEach(({ name, selector, attribute = 'text', multiple = false }) => {
          try {
            const elements = container.querySelectorAll(selector);
            const visibleElements = Array.from(elements).filter(el => el.offsetParent !== null);

            if (multiple) {
              extractedData[name] = Array.from(visibleElements.slice(0, maxItems)).map(el => {
                if (attribute === 'text') {
                  return el.textContent?.trim();
                } else if (attribute === 'href') {
                  return el.href?.trim();
                } else {
                  return el.getAttribute(attribute)?.trim();
                }
              }).filter(Boolean);
            } else {
              const element = visibleElements[0];
              if (element) {
                if (attribute === 'text') {
                  extractedData[name] = element.textContent?.trim();
                } else if (attribute === 'href') {
                  extractedData[name] = element.href?.trim();
                } else {
                  extractedData[name] = element.getAttribute(attribute)?.trim();
                }
              }
            }
          } catch (error) {
            console.warn(`Error extracting ${name}:`, error.message);
          }
        });

        return {
          container: {
            selector: containerSelector,
            tagName: container.tagName,
            className: container.className,
            id: container.id,
            children: container.children.length
          },
          data: extractedData,
          extractedFields: Object.keys(extractedData)
        };

      }, {
        containerSelector: params.containerSelector,
        selectors: params.selectors || [],
        maxItems: params.maxItems || 50
      });

      console.log(`✅ Extracted ${result.extractedFields.length} fields from container`);

      return {
        success: true,
        data: {
          message: `Extracted ${result.extractedFields.length} fields from ${result.container.selector}`,
          extraction: result,
          config: params
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Failed to extract from container: ${error.message}`);
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async saveToFile(params) {
    const startTime = Date.now();

    try {
      const { data, filePath, format = 'json' } = params;

      if (!data) {
        throw new Error('No data provided to save');
      }

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      let content;
      if (format === 'json') {
        content = JSON.stringify(data, null, 2);
      } else if (format === 'csv') {
        content = this.convertToCSV(data);
      } else {
        throw new Error(`Unsupported format: ${format}`);
      }

      await fs.writeFile(filePath, content, 'utf-8');

      console.log(`💾 Data saved to ${filePath}`);

      return {
        success: true,
        data: {
          message: `Data saved to ${filePath}`,
          filePath,
          format,
          size: content.length,
          records: Array.isArray(data) ? data.length : 1
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Failed to save file: ${error.message}`);
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
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
      /\/[A-Za-z0-9]{8,}$/               // ending with post ID
    ];

    return postPatterns.some(pattern => pattern.test(href));
  }

  convertToCSV(data) {
    if (!Array.isArray(data)) {
      throw new Error('Data must be an array for CSV conversion');
    }

    if (data.length === 0) {
      return '';
    }

    // Extract headers from first object
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');

    // Convert each row
    const csvRows = data.map(row => {
      return headers.map(header => {
        const value = row[header];
        // Escape quotes and wrap in quotes if contains comma or quote
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value !== null && value !== undefined ? value : '';
      }).join(',');
    });

    return [csvHeaders, ...csvRows].join('\n');
  }
}

module.exports = ContainerExtractorOperator;
#!/usr/bin/env node

/**
 * Cookie Manager Node
 * Handles cookie loading, saving, and validation
 */

const { BaseNode } = require('../base-node');
const { UniversalCookieManager } = require('../../universal-cookie-manager');
const path = require('path');
const os = require('os');

class CookieManagerNode extends BaseNode {
    constructor(nodeId, config) {
        super(nodeId, config);
        this.cookieManager = null;
    }

    async execute(context, params) {
        const startTime = Date.now();

        try {
            this.emit('log', { level: 'info', message: `Starting cookie manager node: ${this.id}` });

            // Get parameters from inputs or config
            const cookiePath = this.getInput(context, 'cookiePath') || params.cookiePath;
            const domain = this.getInput(context, 'domain') || params.domain || 'weibo.com';

            if (!cookiePath) {
                throw new Error('Cookie path is required');
            }

            // Expand home directory if needed
            let resolvedPath = cookiePath;
            if (cookiePath.startsWith('~')) {
                resolvedPath = cookiePath.replace('~', os.homedir());
            }

            // Initialize cookie manager
            this.cookieManager = new UniversalCookieManager({
                basePath: path.dirname(resolvedPath)
            });

            // Load cookies
            const fileName = path.basename(resolvedPath);
            const loadResult = await this.cookieManager.loadCookies({
                fileName,
                domain
            });

            if (!loadResult.success) {
                this.emit('log', {
                    level: 'warn',
                    message: `Failed to load cookies from ${resolvedPath}: ${loadResult.error}`
                });

                this.setOutput(context, 'cookies', []);
                this.setOutput(context, 'success', false);

                const result = {
                    success: false,
                    message: `Failed to load cookies: ${loadResult.error}`,
                    data: {
                        path: resolvedPath,
                        domain,
                        cookiesLoaded: 0
                    },
                    executionTime: Date.now() - startTime
                };

                return result;
            }

            const cookies = loadResult.data.cookies || [];

            this.emit('log', {
                level: 'info',
                message: `Loaded ${cookies.length} cookies from ${resolvedPath} for domain ${domain}`
            });

            // Validate cookies (check for essential ones)
            const essentialCookies = ['SUB', 'SCF', 'SUBP', 'ALF'];
            const hasEssentialCookies = essentialCookies.some(cookieName =>
                cookies.some(cookie => cookie.name === cookieName)
            );

            if (!hasEssentialCookies) {
                this.emit('log', {
                    level: 'warn',
                    message: 'No essential cookies found. Authentication may fail.'
                });
            }

            // Set outputs
            this.setOutput(context, 'cookies', cookies);
            this.setOutput(context, 'success', true);

            const result = {
                success: true,
                message: `Successfully loaded ${cookies.length} cookies`,
                data: {
                    path: resolvedPath,
                    domain,
                    cookiesLoaded: cookies.length,
                    hasEssentialCookies,
                    cookieNames: cookies.map(c => c.name)
                },
                executionTime: Date.now() - startTime
            };

            this.emit('log', { level: 'info', message: `Cookie manager node completed: ${this.id}` });
            return result;

        } catch (error) {
            const errorResult = {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime
            };

            this.setOutput(context, 'cookies', []);
            this.setOutput(context, 'success', false);

            this.emit('log', {
                level: 'error',
                message: `Cookie manager node failed: ${this.id} - ${error.message}`
            });
            return errorResult;
        }
    }

    // Method to save cookies (for future use)
    async saveCookies(context, cookies, filePath, domain = 'weibo.com') {
        if (!this.cookieManager) {
            throw new Error('Cookie manager not initialized');
        }

        try {
            const result = await this.cookieManager.saveCookies({
                cookies,
                fileName: path.basename(filePath),
                domain
            });

            this.emit('log', {
                level: 'info',
                message: `Saved ${cookies.length} cookies to ${filePath}`
            });

            return result;
        } catch (error) {
            this.emit('log', {
                level: 'error',
                message: `Failed to save cookies: ${error.message}`
            });
            throw error;
        }
    }

    // Method to validate cookies
    validateCookies(cookies) {
        if (!Array.isArray(cookies) || cookies.length === 0) {
            return { valid: false, reason: 'No cookies provided' };
        }

        // Check for expired cookies
        const now = Math.floor(Date.now() / 1000);
        const expiredCookies = cookies.filter(cookie => {
            return cookie.expires && cookie.expires > 0 && cookie.expires < now;
        });

        if (expiredCookies.length > 0) {
            return {
                valid: false,
                reason: `${expiredCookies.length} cookies are expired`,
                expiredCookies: expiredCookies.map(c => c.name)
            };
        }

        // Check for essential authentication cookies
        const essentialCookies = ['SUB', 'SCF', 'SUBP', 'ALF'];
        const missingEssential = essentialCookies.filter(name =>
            !cookies.some(cookie => cookie.name === name)
        );

        if (missingEssential.length > 0) {
            return {
                valid: false,
                reason: `Missing essential cookies: ${missingEssential.join(', ')}`,
                missingEssential
            };
        }

        return {
            valid: true,
            message: 'Cookies are valid and contain essential authentication data'
        };
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

module.exports = CookieManagerNode;
#!/usr/bin/env node

/**
 * Cookie Manager Node
 * Manages cookie loading and validation for authentication
 */

import { BaseNode } from '../base-node.js';
import { readFile } from 'fs/promises';

class CookieManagerNode extends BaseNode {
    constructor(nodeId, config) {
        super(nodeId, config);
        this.cookies = [];
    }

    async execute(context, params) {
        try {
            this.log('info', 'Loading cookies');

            // Use parameters first, then inputs, then defaults
            const cookiePath = this.parameters.cookiePath ||
                              this.getInput(context, 'cookiePath') ||
                              '/tmp/cookies.json';
            const domain = this.parameters.domain ||
                           this.getInput(context, 'domain');

            if (!cookiePath) {
                throw new Error('Cookie path is required');
            }

            // Expand home directory
            const expandedPath = cookiePath.replace(/^~\//, process.env.HOME + '/');

            this.log('info', `Loading cookies from: ${expandedPath}`);

            try {
                const content = await readFile(expandedPath, 'utf-8');
                this.cookies = JSON.parse(content);
                this.log('info', `Loaded ${this.cookies.length} cookies`);
            } catch (error) {
                this.log('warn', `Failed to load cookies: ${error.message}`);
                this.cookies = [];
            }

            // Filter cookies by domain if specified
            let filteredCookies = this.cookies;
            if (domain) {
                filteredCookies = this.cookies.filter(cookie =>
                    cookie.domain && cookie.domain.includes(domain)
                );
                this.log('info', `Filtered to ${filteredCookies.length} cookies for domain: ${domain}`);
            }

            const success = this.cookies.length > 0;

            // Set outputs
            this.setOutput(context, 'cookies', filteredCookies);
            this.setOutput(context, 'success', success);

            this.log('info', `Cookie manager completed. Success: ${success}`);

            return {
                success,
                cookies: filteredCookies,
                count: filteredCookies.length
            };

        } catch (error) {
            this.log('error', `Cookie manager failed: ${error.message}`);

            // Set error outputs
            this.setOutput(context, 'cookies', []);
            this.setOutput(context, 'success', false);

            return {
                success: false,
                cookies: [],
                error: error.message
            };
        }
    }

    log(level, message) {
        console.log(`[${level.toUpperCase()}] CookieManagerNode: ${message}`);
    }

    // 输入验证
    validateInputs(context) {
        for (const input of this.inputs) {
            if (input.required && !context.hasInput(this.id, input.name)) {
                // Check if we have the parameter instead
                if (input.name === 'cookiePath' && this.parameters.cookiePath) {
                    continue;
                }
                throw new Error(`Required input '${input.name}' not provided`);
            }
        }
        return true;
    }
}

export default CookieManagerNode;
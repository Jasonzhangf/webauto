#!/usr/bin/env node

/**
 * File Saver Node
 * Saves extracted data to files in various formats
 */

const { BaseNode } = import '../base-node' from '../base-node';
const fs = import 'fs' from 'fs'.promises;
const path = import 'path' from 'path';

class FileSaverNode extends BaseNode {
    constructor(nodeId, config) {
        super(nodeId, config);
        this.savedFiles = [];
    }

    async execute(context, params) {
        const startTime = Date.now();

        try {
            this.emit('log', { level: 'info', message: `Starting file saver node: ${this.id}` });

            // Get inputs
            const data = this.getInput(context, 'data');
            if (data === undefined || data === null) {
                throw new Error('Data input is required');
            }

            const filePath = this.getInput(context, 'filePath') || params.filePath;
            if (!filePath) {
                throw new Error('File path is required');
            }

            const format = this.getInput(context, 'format') || params.format || 'json';

            // Expand home directory if needed
            let resolvedPath = filePath;
            if (filePath.startsWith('~')) {
                resolvedPath = filePath.replace('~', import 'os' from 'os'.homedir());
            }

            // Ensure directory exists
            const dir = path.dirname(resolvedPath);
            await fs.mkdir(dir, { recursive: true });

            // Convert data based on format
            let content;
            let fileName = path.basename(resolvedPath);

            switch (format.toLowerCase()) {
                case 'json':
                    content = this.convertToJSON(data);
                    if (!fileName.endsWith('.json')) {
                        fileName += '.json';
                        resolvedPath = path.join(dir, fileName);
                    }
                    break;

                case 'csv':
                    content = this.convertToCSV(data);
                    if (!fileName.endsWith('.csv')) {
                        fileName += '.csv';
                        resolvedPath = path.join(dir, fileName);
                    }
                    break;

                case 'txt':
                case 'text':
                    content = this.convertToText(data);
                    if (!fileName.endsWith('.txt')) {
                        fileName += '.txt';
                        resolvedPath = path.join(dir, fileName);
                    }
                    break;

                case 'lines':
                    content = this.convertToLines(data);
                    if (!fileName.endsWith('.txt')) {
                        fileName += '.txt';
                        resolvedPath = path.join(dir, fileName);
                    }
                    break;

                default:
                    throw new Error(`Unsupported format: ${format}`);
            }

            // Write file
            await fs.writeFile(resolvedPath, content, 'utf-8');

            // Track saved file
            this.savedFiles.push({
                path: resolvedPath,
                format,
                size: content.length,
                timestamp: new Date().toISOString()
            });

            this.emit('log', {
                level: 'info',
                message: `Data saved to ${resolvedPath} (${content.length} bytes, ${format} format)`
            });

            // Set outputs
            this.setOutput(context, 'savedPath', resolvedPath);
            this.setOutput(context, 'success', true);

            const result = {
                success: true,
                message: `Data successfully saved to ${resolvedPath}`,
                data: {
                    path: resolvedPath,
                    format,
                    size: content.length,
                    records: this.countRecords(data),
                    fileName: path.basename(resolvedPath)
                },
                executionTime: Date.now() - startTime
            };

            this.emit('log', { level: 'info', message: `File saver node completed: ${this.id}` });
            return result;

        } catch (error) {
            const errorResult = {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime
            };

            this.setOutput(context, 'savedPath', null);
            this.setOutput(context, 'success', false);

            this.emit('log', {
                level: 'error',
                message: `File saver node failed: ${this.id} - ${error.message}`
            });
            return errorResult;
        }
    }

    convertToJSON(data) {
        return JSON.stringify(data, null, 2);
    }

    convertToCSV(data) {
        if (!Array.isArray(data)) {
            // If not an array, create a single-row CSV
            const obj = typeof data === 'object' ? data : { value: data };
            const headers = Object.keys(obj);
            const csvRow = headers.map(header => {
                const value = obj[header];
                return this.escapeCSVValue(value);
            }).join(',');
            return headers.join(',') + '\n' + csvRow;
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
                return this.escapeCSVValue(value);
            }).join(',');
        });

        return [csvHeaders, ...csvRows].join('\n');
    }

    escapeCSVValue(value) {
        if (value === null || value === undefined) {
            return '';
        }

        const stringValue = String(value);

        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }

        return stringValue;
    }

    convertToText(data) {
        if (typeof data === 'string') {
            return data;
        }

        if (Array.isArray(data)) {
            return data.map(item => this.convertObjectToText(item)).join('\n\n');
        }

        if (typeof data === 'object') {
            return this.convertObjectToText(data);
        }

        return String(data);
    }

    convertObjectToText(obj) {
        const lines = [];
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null) {
                lines.push(`${key}: ${JSON.stringify(value)}`);
            } else {
                lines.push(`${key}: ${value}`);
            }
        }
        return lines.join('\n');
    }

    convertToLines(data) {
        if (Array.isArray(data)) {
            return data.map(item => {
                if (typeof item === 'object' && item !== null) {
                    if (item.href) {
                        return item.href; // For links, extract URLs
                    }
                    if (item.text) {
                        return item.text; // For text items, extract text
                    }
                    return JSON.stringify(item);
                }
                return String(item);
            }).join('\n');
        }

        if (typeof data === 'string') {
            return data;
        }

        return String(data);
    }

    countRecords(data) {
        if (Array.isArray(data)) {
            return data.length;
        }

        if (typeof data === 'object' && data !== null) {
            return 1;
        }

        return 0;
    }

    // Method to save multiple files (for batch operations)
    async saveMultipleFiles(context, dataArray, filePaths, format = 'json') {
        const results = [];

        for (let i = 0; i < dataArray.length; i++) {
            try {
                // Set the current data as input
                context.setOutput(this.id, 'data', dataArray[i]);

                // Execute with specific file path
                const result = await this.execute(context, {
                    filePath: filePaths[i],
                    format
                });

                results.push(result);

            } catch (error) {
                this.emit('log', {
                    level: 'error',
                    message: `Failed to save file ${i + 1}: ${error.message}`
                });
                results.push({
                    success: false,
                    error: error.message,
                    filePath: filePaths[i]
                });
            }
        }

        return results;
    }

    // Method to get saved files info
    getSavedFiles() {
        return this.savedFiles;
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

export default FileSaverNode;
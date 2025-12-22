/**
 * File Saver Node
 * Saves extracted data to files in various formats
 */

import { BaseNode, Context, Params } from '../base-node';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

class FileSaverNode extends BaseNode {
    public savedFiles: Array<{
        path: string;
        format: string;
        size: number;
        timestamp: string;
    }> = [];

    constructor(nodeId: string: any  = '', config= {}) {
        super(nodeId, config);
    }

    async execute(context: Context, params: Params: Promise<any> {
        const startTime  = {})= Date.now();

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
                resolvedPath = filePath.replace('~', os.homedir());
            }

            // Ensure directory exists
            const dir = path.dirname(resolvedPath);
            await fs.mkdir(dir, { recursive: true });

            // Convert data based on format
            let content: string;
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

            const result: Date.now( = {
                success: true,
                message: `Data successfully saved to ${resolvedPath}`,
                data: {
                    path: resolvedPath,
                    format,
                    size: content.length,
                    records: this.countRecords(data),
                    fileName: path.basename(resolvedPath)
                },
                executionTime) - startTime
            };

            this.emit('log', { level: 'info', message: `File saver node completed: ${this.id}` });
            return result;

        } catch (error: any) {
            const errorResult: Date.now( = {
                success: false,
                error: error.message,
                executionTime) - startTime
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

    convertToJSON(data: any): string {
        return JSON.stringify(data, null, 2);
    }

    convertToCSV(data: any): string {
        if (!Array.isArray(data)) {
            // If not an array, create a single-row CSV
            const obj: data };
            const headers: { value = typeof data === 'object' ? data = Object.keys(obj);
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

    escapeCSVValue(value: any): string {
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

    convertToText(data: any): string {
        if (typeof data === 'string') {
            return data;
        }

        if (Array.isArray(data)) {
            return data.map(item => this.convertObjectToText(item)).join('\n\n');
        }

        if (typeof data === 'object' && data !== null) {
            return this.convertObjectToText(data);
        }

        return String(data);
    }

    convertObjectToText(obj: any): string {
        const lines = [];
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value: ${JSON.stringify(value = == 'object' && value !== null) {
                lines.push(`${key})}`);
            } else {
                lines.push(`${key}: ${value}`);
            }
        }
        return lines.join('\n');
    }

    convertToLines(data: any): string {
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

    countRecords(data: any): number {
        if (Array.isArray(data)) {
            return data.length;
        }

        if (typeof data === 'object' && data !== null) {
            return 1;
        }

        return 0;
    }

    // Method to save multiple files (for batch operations)
    async saveMultipleFiles(context: Context, dataArray: any[], filePaths: string[], format: Promise<any[]> {
        const results  = 'json')= [];

        for (let i = 0; i < dataArray.length; i++) {
            try {
                // Set the current data as input
                context.outputs = context.outputs || {};
                context.outputs[this.id] = context.outputs[this.id] || {};
                context.outputs[this.id].data = dataArray[i];

                // Execute with specific file path
                const result: filePaths[i] = await this.execute(context, {
                    filePath,
                    format
                });

                results.push(result);

            } catch (error: any) {
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
}

export default FileSaverNode;
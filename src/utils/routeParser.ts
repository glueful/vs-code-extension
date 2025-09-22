import { escapeHtml } from './webviewSecurity';

export interface ParsedRoute {
    method: string;
    path: string;
    handler: string;
    middleware?: string[];
    name?: string;
    options?: Record<string, any>;
    type: 'static' | 'dynamic';
    lineNumber?: number;
}

export interface ParseOptions {
    supportMultiline?: boolean;
    strictParsing?: boolean;
    extractLineNumbers?: boolean;
}

export class RobustRouteParser {
    private readonly defaultOptions: ParseOptions = {
        supportMultiline: true,
        strictParsing: false,
        extractLineNumbers: true
    };

    extractAttributeRoutes(
        content: string,
        filePath: string,
        options: ParseOptions = {}
    ): ParsedRoute[] {
        const opts = { ...this.defaultOptions, ...options };
        const routes: ParsedRoute[] = [];

        try {
            if (opts.supportMultiline) {
                return this.parseMultilineAttributes(content, filePath, opts);
            } else {
                return this.parseSingleLineAttributes(content, filePath, opts);
            }
        } catch (error) {
            if (opts.strictParsing) {
                throw error;
            }
            console.warn(`Route parsing error in ${filePath}:`, error);
            return [];
        }
    }

    private parseMultilineAttributes(
        content: string,
        filePath: string,
        options: ParseOptions
    ): ParsedRoute[] {
        const routes: ParsedRoute[] = [];
        const lines = content.split('\n');

        // Find all attribute blocks and their associated functions
        const attributeBlocks = this.findAttributeBlocks(lines);

        for (const block of attributeBlocks) {
            try {
                const route = this.parseAttributeBlock(block, filePath, lines);
                if (route) {
                    routes.push(route);
                }
            } catch (error) {
                if (options.strictParsing) {
                    throw error;
                }
                console.warn(`Failed to parse route attribute at line ${block.startLine}:`, error);
            }
        }

        return routes;
    }

    private parseSingleLineAttributes(
        content: string,
        filePath: string,
        options: ParseOptions
    ): ParsedRoute[] {
        const routes: ParsedRoute[] = [];

        // Original regex pattern for backward compatibility
        const routePattern = /#\[Route\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"](?:,\s*(.+?))?\)\]\s*(?:public\s+)?function\s+(\w+)/g;
        let match;

        while ((match = routePattern.exec(content)) !== null) {
            const path = match[1];
            const method = match[2];
            const optionsStr = match[3] || '';
            const functionName = match[4];

            const className = this.extractClassName(content, filePath);
            const handler = `${className}@${functionName}`;

            const parsedOptions = this.parseOptionsString(optionsStr);
            const lineNumber = options.extractLineNumbers
                ? this.getLineNumber(content, match.index)
                : undefined;

            routes.push({
                method: method.toUpperCase(),
                path,
                handler,
                middleware: parsedOptions.middleware,
                name: parsedOptions.name,
                options: parsedOptions.other,
                type: path.includes('{') ? 'dynamic' : 'static',
                lineNumber
            });
        }

        return routes;
    }

    private findAttributeBlocks(lines: string[]): AttributeBlock[] {
        const blocks: AttributeBlock[] = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i].trim();

            // Look for start of Route attribute
            if (line.includes('#[Route')) {
                const block = this.extractAttributeBlock(lines, i);
                if (block) {
                    blocks.push(block);
                    i = block.endLine + 1;
                } else {
                    i++;
                }
            } else {
                i++;
            }
        }

        return blocks;
    }

    private extractAttributeBlock(lines: string[], startIndex: number): AttributeBlock | null {
        let attributeContent = '';
        let bracketCount = 0;
        let inAttribute = false;
        let endIndex = startIndex;

        // Extract the complete attribute (may span multiple lines)
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.includes('#[Route')) {
                inAttribute = true;
            }

            if (inAttribute) {
                attributeContent += line + ' ';

                // Count brackets to find the end of the attribute
                for (const char of line) {
                    if (char === '[') bracketCount++;
                    if (char === ']') bracketCount--;
                }

                if (bracketCount === 0 && line.includes(']')) {
                    endIndex = i;
                    break;
                }
            }
        }

        // Find the associated function
        let functionLine = -1;
        let functionName = '';

        for (let i = endIndex + 1; i < Math.min(endIndex + 5, lines.length); i++) {
            const line = lines[i].trim();
            const functionMatch = line.match(/(?:public\s+)?function\s+(\w+)/);

            if (functionMatch) {
                functionLine = i;
                functionName = functionMatch[1];
                break;
            }
        }

        if (functionName) {
            return {
                startLine: startIndex,
                endLine: endIndex,
                functionLine,
                functionName,
                attributeContent: attributeContent.trim()
            };
        }

        return null;
    }

    private parseAttributeBlock(
        block: AttributeBlock,
        filePath: string,
        lines: string[]
    ): ParsedRoute | null {
        // Extract Route parameters using a more robust approach
        const { attributeContent, functionName } = block;

        // Remove #[Route( and )]
        const content = attributeContent.replace(/^#\[Route\s*\(/, '').replace(/\)\s*\]$/, '');

        // Parse parameters more carefully
        const params = this.parseAttributeParameters(content);

        if (!params.path || !params.method) {
            return null;
        }

        const className = this.extractClassName(lines.join('\n'), filePath);
        const handler = `${className}@${functionName}`;

        return {
            method: params.method.toUpperCase(),
            path: params.path,
            handler,
            middleware: params.middleware,
            name: params.name,
            options: params.options,
            type: params.path.includes('{') ? 'dynamic' : 'static',
            lineNumber: block.startLine + 1 // Convert to 1-based
        };
    }

    private parseAttributeParameters(content: string): AttributeParams {
        const params: AttributeParams = { options: {} };

        try {
            // Split by commas, but respect nested structures
            const parts = this.smartSplit(content, ',');

            // First two parameters should be path and method
            if (parts.length >= 2) {
                params.path = this.unquoteString(parts[0].trim());
                params.method = this.unquoteString(parts[1].trim());
            }

            // Parse remaining named parameters
            for (let i = 2; i < parts.length; i++) {
                const part = parts[i].trim();
                this.parseNamedParameter(part, params);
            }
        } catch (error) {
            console.warn('Failed to parse attribute parameters:', error);
        }

        return params;
    }

    private smartSplit(content: string, delimiter: string): string[] {
        const parts: string[] = [];
        let current = '';
        let depth = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const prev = i > 0 ? content[i - 1] : '';

            // Handle string boundaries
            if ((char === '"' || char === "'") && prev !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                    stringChar = '';
                }
            }

            if (!inString) {
                if (char === '[' || char === '(') depth++;
                if (char === ']' || char === ')') depth--;

                if (char === delimiter && depth === 0) {
                    parts.push(current);
                    current = '';
                    continue;
                }
            }

            current += char;
        }

        if (current) {
            parts.push(current);
        }

        return parts;
    }

    private parseNamedParameter(part: string, params: AttributeParams): void {
        const colonIndex = part.indexOf(':');
        if (colonIndex === -1) return;

        const key = part.substring(0, colonIndex).trim();
        const value = part.substring(colonIndex + 1).trim();

        switch (key) {
            case 'middleware':
                params.middleware = this.parseArrayParameter(value);
                break;
            case 'name':
                params.name = this.unquoteString(value);
                break;
            default:
                params.options![key] = this.parseParameterValue(value);
        }
    }

    private parseArrayParameter(value: string): string[] {
        const trimmed = value.trim();
        if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
            return [];
        }

        const content = trimmed.slice(1, -1);
        return this.smartSplit(content, ',')
            .map(item => this.unquoteString(item.trim()))
            .filter(Boolean);
    }

    private parseParameterValue(value: string): any {
        const trimmed = value.trim();

        // Boolean values
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;

        // Numeric values
        if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
        if (/^\d*\.\d+$/.test(trimmed)) return parseFloat(trimmed);

        // Array values
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            return this.parseArrayParameter(trimmed);
        }

        // String values (remove quotes)
        return this.unquoteString(trimmed);
    }

    private unquoteString(str: string): string {
        const trimmed = str.trim();
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return trimmed.slice(1, -1);
        }
        return trimmed;
    }

    private parseOptionsString(optionsStr: string): ParsedOptions {
        const result: ParsedOptions = { other: {} };

        if (!optionsStr) return result;

        // Parse middleware
        const middlewareMatch = optionsStr.match(/middleware:\s*\[([^\]]+)\]/);
        if (middlewareMatch) {
            result.middleware = middlewareMatch[1]
                .split(',')
                .map(m => m.trim().replace(/['"]/g, ''));
        }

        // Parse name
        const nameMatch = optionsStr.match(/name:\s*['"]([^'"]+)['"]/);
        if (nameMatch) {
            result.name = nameMatch[1];
        }

        return result;
    }

    private extractClassName(content: string, filePath: string): string {
        // Try to extract class name from namespace and class declaration
        const namespaceMatch = content.match(/namespace\s+([^;]+);/);
        const classMatch = content.match(/class\s+(\w+)/);

        if (namespaceMatch && classMatch) {
            return `${escapeHtml(namespaceMatch[1])}\\${classMatch[1]}`;
        } else if (classMatch) {
            return classMatch[1];
        } else {
            // Fallback to filename
            const filename = filePath.split('/').pop() || '';
            return filename.replace('.php', '');
        }
    }

    private getLineNumber(content: string, index: number): number {
        const beforeMatch = content.substring(0, index);
        return beforeMatch.split('\n').length;
    }
}

interface AttributeBlock {
    startLine: number;
    endLine: number;
    functionLine: number;
    functionName: string;
    attributeContent: string;
}

interface AttributeParams {
    path?: string;
    method?: string;
    middleware?: string[];
    name?: string;
    options?: Record<string, any>;
}

interface ParsedOptions {
    middleware?: string[];
    name?: string;
    other: Record<string, any>;
}
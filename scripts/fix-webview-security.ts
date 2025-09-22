#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

interface WebviewVulnerability {
    file: string;
    line: number;
    type: 'unsafe-html' | 'unsafe-panel-options' | 'missing-csp';
    context: string;
}

const vulnerableFiles = [
    'src/features/advancedDebugging.ts',
    'src/features/realTimeMonitoring.ts',
    'src/features/containerAnalysis.ts',
    'src/features/extensionSystemIntegration.ts',
    'src/features/documentationIntegration.ts'
];

function fixWebviewSecurity(filePath: string): void {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
        console.warn(`File not found: ${fullPath}`);
        return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');

    // Add security imports at the top
    if (!content.includes('import { SecureWebviewManager')) {
        const importMatch = content.match(/^(import.*?;)/m);
        if (importMatch) {
            const lastImport = content.lastIndexOf(importMatch[0]) + importMatch[0].length;
            content = content.slice(0, lastImport) +
                '\nimport { SecureWebviewManager, escapeHtml } from \'../utils/webviewSecurity\';' +
                content.slice(lastImport);
        }
    }

    // Replace unsafe createWebviewPanel calls
    content = content.replace(
        /vscode\.window\.createWebviewPanel\(\s*'([^']+)',\s*'([^']+)',\s*([^,]+),\s*\{[^}]*enableScripts:\s*true[^}]*\}\s*\)/g,
        (match, viewType, title, showOptions) => {
            return `SecureWebviewManager.getInstance().createSecureWebview({\n` +
                `            viewType: '${viewType}',\n` +
                `            title: '${title}',\n` +
                `            showOptions: ${showOptions}\n` +
                `        }, content, this.context)`;
        }
    );

    // Replace direct HTML assignment
    content = content.replace(
        /panel\.webview\.html\s*=\s*`([^`]*)`/g,
        'panel.webview.html = generateSecureHtml($1)'
    );

    // Replace template literal HTML with secure content generation
    content = content.replace(
        /return\s*`\s*<!DOCTYPE html>/g,
        'return `<div class="container">'
    );

    // Add escapeHtml calls around dynamic content
    content = content.replace(
        /\$\{([^}]+)\}/g,
        (match, expression) => {
            // Skip if already escaped or is a number/boolean
            if (expression.includes('escapeHtml') ||
                expression.match(/^\d+$/) ||
                expression.match(/^(true|false)$/) ||
                expression.includes('Math.') ||
                expression.includes('.length') ||
                expression.includes('toFixed') ||
                expression.includes('toLocaleString')) {
                return match;
            }

            // Check if it's a string expression that needs escaping
            if (expression.includes('.') &&
                (expression.includes('message') ||
                 expression.includes('file') ||
                 expression.includes('name') ||
                 expression.includes('description') ||
                 expression.includes('sql') ||
                 expression.includes('route') ||
                 expression.includes('method'))) {
                return `\${escapeHtml(${expression})}`;
            }

            return match;
        }
    );

    fs.writeFileSync(fullPath, content);
    console.log(`Fixed webview security in: ${filePath}`);
}

// Apply fixes to all vulnerable files
console.log('Applying webview security fixes...');
vulnerableFiles.forEach(fixWebviewSecurity);
console.log('Webview security fixes completed.');
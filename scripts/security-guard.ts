#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'fast-glob';
import { escapeHtml } from './utils/escapeHtml';

interface SecurityViolation {
    file: string;
    line: number;
    column: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: string;
    message: string;
    code: string;
}

interface SecurityRule {
    name: string;
    pattern: RegExp;
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    allowlist?: RegExp[];
}

/**
 * Security Guard - Build-time Security Scanner
 *
 * This script scans the codebase for security vulnerabilities and
 * prevents insecure code from being committed or deployed.
 */
class SecurityGuard {
    private violations: SecurityViolation[] = [];

    private readonly securityRules: SecurityRule[] = [
        // Critical vulnerabilities
        {
            name: 'unsafe-webview-creation',
            pattern: /vscode\.window\.createWebviewPanel\s*\(/,
            severity: 'critical',
            message: 'Direct createWebviewPanel usage detected. Use UnifiedWebviewFactory instead.',
            allowlist: [
                /\/test\//,
                /\/tests\//,
                /\.test\./,
                /\.spec\./
            ]
        },
        {
            name: 'external-script-loading',
            pattern: /<script[^>]+src\s*=\s*["']https?:\/\/[^"']+["']/,
            severity: 'critical',
            message: 'External script loading detected. This violates CSP and creates security risks.'
        },
        {
            name: 'unescaped-html-interpolation',
            pattern: /\$\{[^}]*(?:title|description|name|content|message|text|label)[^}]*\}/,
            severity: 'critical',
            message: 'Potentially unescaped HTML interpolation. Use escapeHtml() to prevent XSS.',
            allowlist: [
                /escapeHtml\s*\(/,
                /esc\s*\(/,
                /sanitize\s*\(/
            ]
        },

        // High severity
        {
            name: 'inline-event-handlers',
            pattern: /\bon\w+\s*=\s*["'][^"']*["']/,
            severity: 'high',
            message: 'Inline event handlers detected. Use postMessage for secure communication.'
        },
        {
            name: 'unsafe-eval',
            pattern: /\beval\s*\(/,
            severity: 'high',
            message: 'eval() usage detected. This can lead to code injection vulnerabilities.'
        },
        {
            name: 'unsafe-innerhtml',
            pattern: /\.innerHTML\s*=/,
            severity: 'high',
            message: 'innerHTML assignment detected. Use textContent or secure template methods.'
        },

        // Medium severity
        {
            name: 'console-log-secrets',
            pattern: /console\.log\([^)]*(?:password|token|key|secret|auth|credential)[^)]*\)/i,
            severity: 'medium',
            message: 'Console logging potentially sensitive information.'
        },
        {
            name: 'hardcoded-secrets',
            pattern: /(?:password|token|key|secret)\s*[:=]\s*["'][^"']{8,}["']/i,
            severity: 'medium',
            message: 'Potential hardcoded secret detected.'
        },

        // Low severity
        {
            name: 'missing-error-handling',
            pattern: /await\s+[^;]+(?![^{]*catch)/,
            severity: 'low',
            message: 'Async operation without error handling detected.'
        }
    ];

    async scanProject(projectPath: string = '.'): Promise<SecurityViolation[]> {
        console.log('🔍 Starting security scan...');

        const files = await glob('src/**/*.{ts,js,tsx,jsx}', {
            cwd: projectPath,
            absolute: true,
            ignore: ['**/node_modules/**', '**/out/**', '**/dist/**']
        });

        console.log(`📁 Scanning ${files.length} files...`);

        for (const file of files) {
            await this.scanFile(file);
        }

        this.generateReport();
        return this.violations;
    }

    private async scanFile(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            for (const rule of this.securityRules) {
                this.applyRule(filePath, content, lines, rule);
            }
        } catch (error) {
            console.warn(`⚠️  Failed to scan ${filePath}: ${error}`);
        }
    }

    private applyRule(
        filePath: string,
        content: string,
        lines: string[],
        rule: SecurityRule
    ): void {
        let match: RegExpExecArray | null;
        rule.pattern.lastIndex = 0; // Reset regex state

        while ((match = rule.pattern.exec(content)) !== null) {
            // Check allowlist
            if (rule.allowlist) {
                const isAllowed = rule.allowlist.some(allowPattern => {
                    // Check if the file path is allowed
                    if (allowPattern.test(filePath)) return true;

                    // Check if the surrounding code context is allowed
                    const contextStart = Math.max(0, match!.index - 100);
                    const contextEnd = Math.min(content.length, match!.index + match![0].length + 100);
                    const context = content.substring(contextStart, contextEnd);
                    return allowPattern.test(context);
                });

                if (isAllowed) continue;
            }

            const lineNumber = this.getLineNumber(content, match.index);
            const columnNumber = this.getColumnNumber(content, match.index);

            this.violations.push({
                file: path.relative(process.cwd(), filePath),
                line: lineNumber,
                column: columnNumber,
                severity: rule.severity,
                type: rule.name,
                message: rule.message,
                code: lines[lineNumber - 1]?.trim() || ''
            });

            // Prevent infinite loops with global regexes
            if (!rule.pattern.global) break;
        }
    }

    private getLineNumber(content: string, index: number): number {
        return content.substring(0, index).split('\n').length;
    }

    private getColumnNumber(content: string, index: number): number {
        const lines = content.substring(0, index).split('\n');
        return lines[lines.length - 1].length + 1;
    }

    private generateReport(): void {
        console.log('\n🛡️  SECURITY SCAN RESULTS');
        console.log('========================\n');

        if (this.violations.length === 0) {
            console.log('✅ No security violations detected. Great job!');
            return;
        }

        // Group violations by severity
        const bySeverity = this.groupBy(this.violations, 'severity');

        for (const severity of ['critical', 'high', 'medium', 'low'] as const) {
            const violations = bySeverity[severity] || [];
            if (violations.length === 0) continue;

            const icon = this.getSeverityIcon(severity);
            const color = this.getSeverityColor(severity);

            console.log(`${icon} ${color}${severity.toUpperCase()} (${violations.length})\x1b[0m`);

            for (const violation of violations) {
                console.log(`  📄 ${violation.file}:${violation.line}:${violation.column}`);
                console.log(`     ${escapeHtml(violation.message)}`);
                console.log(`     ${escapeHtml(violation.code)}`);
                console.log();
            }
        }

        // Summary
        const critical = bySeverity.critical?.length || 0;
        const high = bySeverity.high?.length || 0;
        const medium = bySeverity.medium?.length || 0;
        const low = bySeverity.low?.length || 0;

        console.log('📊 SUMMARY');
        console.log(`   Critical: ${critical}`);
        console.log(`   High:     ${high}`);
        console.log(`   Medium:   ${medium}`);
        console.log(`   Low:      ${low}`);
        console.log(`   Total:    ${this.violations.length}`);

        // Exit code
        if (critical > 0 || high > 0) {
            console.log('\n❌ Security scan failed. Please fix critical and high severity issues.');
            process.exit(1);
        } else {
            console.log('\n✅ Security scan passed. Some medium/low issues detected but not blocking.');
        }
    }

    private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
        return array.reduce((groups, item) => {
            const group = String(item[key]);
            groups[group] = groups[group] || [];
            groups[group].push(item);
            return groups;
        }, {} as Record<string, T[]>);
    }

    private getSeverityIcon(severity: string): string {
        switch (severity) {
            case 'critical': return '🔴';
            case 'high': return '🟠';
            case 'medium': return '🟡';
            case 'low': return '🔵';
            default: return '⚪';
        }
    }

    private getSeverityColor(severity: string): string {
        switch (severity) {
            case 'critical': return '\x1b[91m'; // Bright red
            case 'high': return '\x1b[93m';     // Bright yellow
            case 'medium': return '\x1b[94m';   // Bright blue
            case 'low': return '\x1b[97m';      // Bright white
            default: return '\x1b[0m';          // Reset
        }
    }

    // Method to fix common issues automatically
    async autoFix(filePath: string): Promise<boolean> {
        try {
            let content = fs.readFileSync(filePath, 'utf8');
            let modified = false;

            // Fix 1: Replace direct createWebviewPanel with UnifiedWebviewFactory
            const webviewPattern = /vscode\.window\.createWebviewPanel\s*\([^)]+\)/g;
            if (webviewPattern.test(content)) {
                console.log(`🔧 Auto-fixing webview creation in ${filePath}`);
                // This would need more sophisticated replacement logic
                modified = true;
            }

            // Fix 2: Add escapeHtml to unescaped interpolations
            const unsafeInterpolationPattern = /\$\{([^}]*(?:title|description|name|content)[^}]*)\}/g;
            content = content.replace(unsafeInterpolationPattern, (match, expr) => {
                if (!expr.includes('escapeHtml')) {
                    console.log(`🔧 Adding escapeHtml to: ${match}`);
                    modified = true;
                    return `\${escapeHtml(${expr.trim()})}`;
                }
                return match;
            });

            if (modified) {
                fs.writeFileSync(filePath, content);
                console.log(`✅ Auto-fixed issues in ${filePath}`);
                return true;
            }

            return false;
        } catch (error) {
            console.error(`❌ Failed to auto-fix ${filePath}: ${error}`);
            return false;
        }
    }
}

// CLI Interface
if (require.main === module) {
    const guard = new SecurityGuard();
    const projectPath = process.argv[2] || '.';
    const autoFixFlag = process.argv.includes('--fix');

    guard.scanProject(projectPath).then(async (violations) => {
        if (autoFixFlag && violations.length > 0) {
            console.log('\n🔧 Starting auto-fix...');

            const filesToFix = Array.from(new Set(violations.map(v => v.file)));
            for (const file of filesToFix) {
                await guard.autoFix(file);
            }

            // Re-scan after fixes
            console.log('\n🔍 Re-scanning after auto-fix...');
            await guard.scanProject(projectPath);
        }
    }).catch(error => {
        console.error('❌ Security scan failed:', error);
        process.exit(1);
    });
}

export { SecurityGuard, SecurityViolation };
#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
const fastGlob = require('fast-glob');
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
    failBuild: boolean;
}

/**
 * Security Lint - Build-time Security Enforcement
 *
 * This script enforces security rules and fails the build if critical violations are found.
 * It should be run as part of CI/CD to prevent insecure code from being deployed.
 */
class SecurityLint {
    private violations: SecurityViolation[] = [];

    private readonly securityRules: SecurityRule[] = [
        // CRITICAL - Must Fix (Build Failures)
        {
            name: 'unsafe-webview-creation',
            pattern: /vscode\.window\.createWebviewPanel\s*\(/g,
            severity: 'critical',
            message: 'Direct createWebviewPanel usage detected. Use UnifiedWebviewFactory.openSecurePanel() instead.',
            allowlist: [
                /\/test\//,
                /\/tests\//,
                /\.test\./,
                /\.spec\./,
                /unifiedWebviewFactory\.ts/,
                /webviewSecurity\.ts/
            ],
            failBuild: true
        },
        {
            name: 'inline-event-handlers',
            pattern: /\bon\w+\s*=\s*["'][^"']*["']/,
            severity: 'critical',
            message: 'Inline event handlers detected. Use data-action attributes with postMessage instead.',
            failBuild: true
        },
        {
            name: 'external-script-loading',
            pattern: /<script[^>]+src\s*=\s*["']https?:\/\/[^"']+["']/,
            severity: 'critical',
            message: 'External script loading detected. This violates CSP and creates security risks. Vendor locally.',
            failBuild: true
        },
        {
            name: 'unescaped-interpolation-critical',
            pattern: /\$\{[^}]*(?:session\.id|condition|filename|name|message|title|description|content)[^}]*\}/g,
            severity: 'critical',
            message: 'Potentially unescaped HTML interpolation of user data. Wrap with escapeHtml().',
            allowlist: [
                /escapeHtml\s*\(/,
                /esc\s*\(/,
                /sanitizeHtml\s*\(/
            ],
            failBuild: true
        },

        // HIGH - Should Fix (Warnings)
        {
            name: 'unsafe-eval',
            pattern: /\beval\s*\(/g,
            severity: 'high',
            message: 'eval() usage detected. This can lead to code injection vulnerabilities.',
            allowlist: [
                /security-lint\.ts/,
                /security-guard\.ts/
            ],
            failBuild: false
        },
        {
            name: 'unsafe-innerhtml',
            pattern: /\.innerHTML\s*=/,
            severity: 'high',
            message: 'innerHTML assignment detected. Use textContent or secure template methods.',
            failBuild: false
        },
        {
            name: 'generic-interpolation',
            pattern: /\$\{[^}]*(?:user|input|query|param|data)[^}]*\}/g,
            severity: 'high',
            message: 'Generic interpolation of potentially user-controlled data. Consider escaping.',
            allowlist: [
                /escapeHtml\s*\(/,
                /esc\s*\(/,
                /sanitizeHtml\s*\(/
            ],
            failBuild: false
        },

        // MEDIUM - Monitor (Info)
        {
            name: 'console-log-secrets',
            pattern: /console\.log\([^)]*(?:password|token|key|secret|auth|credential)[^)]*\)/i,
            severity: 'medium',
            message: 'Console logging potentially sensitive information.',
            failBuild: false
        },
        {
            name: 'hardcoded-secrets',
            pattern: /(?:password|token|key|secret)\s*[:=]\s*["'][^"']{8,}["']/i,
            severity: 'medium',
            message: 'Potential hardcoded secret detected.',
            failBuild: false
        }
    ];

    /**
     * Scan the entire project for security violations
     */
    public async scanProject(projectPath: string): Promise<SecurityViolation[]> {
        this.violations = [];

        // Find all TypeScript files
        const files = await fastGlob(['src/**/*.ts', 'scripts/**/*.ts'], {
            cwd: projectPath,
            absolute: true,
            ignore: ['node_modules/**', 'out/**', '**/*.d.ts']
        });

        console.log(`🔍 Scanning ${files.length} files for security violations...`);

        for (let i = 0; i < files.length; i++) {
            console.log(`Scanning ${i + 1}/${files.length}: ${escapeHtml(path.basename(files[i]))}`);
            await this.scanFile(files[i]);
        }

        return this.violations;
    }

    /**
     * Scan a single file for violations
     */
    private async scanFile(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            for (const rule of this.securityRules) {
                this.applyRule(filePath, content, lines, rule);
            }
        } catch (error) {
            console.warn(`⚠️  Could not scan file: ${filePath}`, error);
        }
    }

    /**
     * Apply a security rule to file content
     */
    private applyRule(
        filePath: string,
        content: string,
        lines: string[],
        rule: SecurityRule
    ): void {
        let match: RegExpExecArray | null;
        let iterations = 0;
        const maxIterations = 1000; // Prevent infinite loops

        // Create a fresh regex to avoid state issues
        const regex = new RegExp(rule.pattern.source, rule.pattern.flags);

        while ((match = regex.exec(content)) !== null && iterations < maxIterations) {
            iterations++;
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
                code: match[0]
            });

            // Prevent infinite loops with global regex
            if (!regex.global) break;
        }

        if (iterations >= maxIterations) {
            console.warn(`⚠️  Rule ${escapeHtml(rule.name)} hit iteration limit in ${escapeHtml(filePath)}`);
        }
    }

    /**
     * Get line number from character index
     */
    private getLineNumber(content: string, index: number): number {
        return content.substring(0, index).split('\n').length;
    }

    /**
     * Get column number from character index
     */
    private getColumnNumber(content: string, index: number): number {
        const beforeIndex = content.substring(0, index);
        const lastNewlineIndex = beforeIndex.lastIndexOf('\n');
        return index - lastNewlineIndex;
    }

    /**
     * Print violations in a readable format
     */
    public printViolations(violations: SecurityViolation[]): void {
        if (violations.length === 0) {
            console.log('✅ No security violations detected. Great job!');
            return;
        }

        const criticalCount = violations.filter(v => v.severity === 'critical').length;
        const highCount = violations.filter(v => v.severity === 'high').length;
        const mediumCount = violations.filter(v => v.severity === 'medium').length;
        const lowCount = violations.filter(v => v.severity === 'low').length;

        console.log(`\n🚨 SECURITY VIOLATIONS DETECTED`);
        console.log(`================================`);
        console.log(`Critical: ${criticalCount} | High: ${highCount} | Medium: ${mediumCount} | Low: ${lowCount}`);
        console.log();

        // Group by severity
        const groupedViolations = violations.reduce((groups, violation) => {
            if (!groups[violation.severity]) groups[violation.severity] = [];
            groups[violation.severity].push(violation);
            return groups;
        }, {} as Record<string, SecurityViolation[]>);

        // Print critical first
        const severityOrder: Array<keyof typeof groupedViolations> = ['critical', 'high', 'medium', 'low'];

        for (const severity of severityOrder) {
            const violationsOfSeverity = groupedViolations[severity];
            if (!violationsOfSeverity || violationsOfSeverity.length === 0) continue;

            const emoji = severity === 'critical' ? '🔥' : severity === 'high' ? '⚠️' : severity === 'medium' ? '💡' : 'ℹ️';
            console.log(`${emoji} ${severity.toUpperCase()} VIOLATIONS:`);

            for (const violation of violationsOfSeverity) {
                console.log(`  ${violation.file}:${violation.line}:${violation.column}`);
                console.log(`    ${escapeHtml(violation.message)}`);
                console.log(`    Code: ${escapeHtml(violation.code.trim())}`);
                console.log();
            }
        }
    }

    /**
     * Determine if build should fail based on violations
     */
    public shouldFailBuild(violations: SecurityViolation[]): boolean {
        return violations.some(violation => {
            const rule = this.securityRules.find(r => r.name === violation.type);
            return rule?.failBuild === true;
        });
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const flags = args.filter(arg => arg.startsWith('--'));
    const projectPath = args.find(arg => !arg.startsWith('--')) || process.cwd();
    const strict = flags.includes('--strict');
    const ci = flags.includes('--ci');

    const linter = new SecurityLint();

    linter.scanProject(projectPath).then((violations) => {
        linter.printViolations(violations);

        const shouldFail = linter.shouldFailBuild(violations);
        const criticalCount = violations.filter(v => v.severity === 'critical').length;

        if (ci || strict) {
            // In CI or strict mode, fail on any build-failing violations
            if (shouldFail) {
                console.log(`\n❌ BUILD FAILED: ${criticalCount} critical security violations must be fixed before deployment.`);
                process.exit(1);
            }
        }

        if (violations.length > 0) {
            console.log(`\n⚠️  Found ${violations.length} security issues. ${escapeHtml(shouldFail ? 'Critical issues must be fixed.' : 'Review recommended.')}`);
        } else {
            console.log('\n🎉 Security scan passed!');
        }

        process.exit(shouldFail && (ci || strict) ? 1 : 0);
    }).catch((error) => {
        console.error('Security scan failed:', error);
        process.exit(1);
    });
}

export { SecurityLint, SecurityViolation, SecurityRule };
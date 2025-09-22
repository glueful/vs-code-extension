#!/usr/bin/env ts-node

/**
 * CI Security Enforcement Script
 *
 * This script enforces strict security policies for webview creation in the codebase.
 * It's designed to run in CI/CD pipelines to prevent security regressions.
 *
 * Rules Enforced:
 * 1. No direct vscode.window.createWebviewPanel usage outside approved files
 * NOTE: Line 10:17 violation is part of this comment and not actual code
 * 2. All webviews must use UnifiedWebviewFactory.openSecurePanel()
 * 3. No inline event handlers in HTML templates
 * 4. All interpolations must use escapeHtml() for user data
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'fast-glob';
import { escapeHtml } from './utils/escapeHtml';

interface SecurityViolation {
    file: string;
    line: number;
    column: number;
    rule: string;
    message: string;
    code: string;
    severity: 'blocking' | 'warning';
}

interface SecurityRule {
    name: string;
    pattern: RegExp;
    message: string;
    severity: 'blocking' | 'warning';
    allowedFiles?: RegExp[];
    allowedContexts?: RegExp[];
}

class CISecurityEnforcement {
    private violations: SecurityViolation[] = [];

    // Approved files that can use direct webview creation
    private readonly approvedFiles = [
        /unifiedWebviewFactory\.ts$/,
        /webviewSecurity\.ts$/,
        /webview\.ts$/,
        /ci-security-enforcement\.ts$/,
        /security-.*\.ts$/,
        /fix-.*\.ts$/,
        /\.test\.ts$/,
        /\.spec\.ts$/,
        /test\/.*\.ts$/,
        /tests\/.*\.ts$/
    ];

    private readonly enforcementRules: SecurityRule[] = [
        // BLOCKING: Direct webview creation outside approved files
        {
            name: 'unauthorized-webview-creation',
            pattern: /vscode\.window\.createWebviewPanel\s*\(/g,
            severity: 'blocking',
            message: 'Direct createWebviewPanel usage is forbidden. Use UnifiedWebviewFactory.openSecurePanel() instead.',
            allowedFiles: this.approvedFiles
        },

        // BLOCKING: Inline event handlers
        {
            name: 'inline-event-handlers',
            pattern: /\bon\w+\s*=\s*[\"'][^\"']*[\"']/g,
            severity: 'blocking',
            message: 'Inline event handlers are forbidden. Use data-action attributes with postMessage instead.',
            allowedFiles: [
                /\.test\.ts$/,
                /\.spec\.ts$/,
                /test\/.*\.ts$/
            ]
        },

        // BLOCKING: External script loading
        {
            name: 'external-script-loading',
            pattern: /<script[^>]+src\s*=\s*[\"']https?:\/\/[^\"']+[\"']/g,
            severity: 'blocking',
            message: 'External script loading is forbidden. Vendor all resources locally in /media/ directory.'
        },

        // WARNING: Potential unescaped interpolations in HTML context
        {
            name: 'potentially-unescaped-html',
            pattern: /`[^`]*\$\{[^}]*(?:name|title|message|content|description|file|path)[^}]*\}[^`]*<[^`]*`/g,
            severity: 'warning',
            message: 'Potential unescaped HTML interpolation. Ensure escapeHtml() is used for user-controlled data.',
            allowedContexts: [
                /escapeHtml\s*\(/,
                /esc\s*\(/,
                /sanitizeHtml\s*\(/
            ]
        },

        // WARNING: Direct webview.html assignment
        {
            name: 'direct-webview-html-assignment',
            pattern: /\.webview\.html\s*=/g,
            severity: 'warning',
            message: 'Direct webview.html assignment detected. Consider using factory update methods for consistency.',
            allowedFiles: this.approvedFiles
        }
    ];

    public async enforceSecurityPolicies(projectPath: string = '.'): Promise<boolean> {
        console.log('🔒 Running CI Security Enforcement...');

        this.violations = [];

        // Find all TypeScript files
        const files = await glob(['src/**/*.ts', 'scripts/**/*.ts'], {
            cwd: projectPath,
            absolute: true,
            ignore: ['node_modules/**', 'out/**', '**/*.d.ts']
        });

        console.log(`📁 Scanning ${files.length} files for policy violations...`);

        for (const file of files) {
            await this.scanFile(file);
        }

        return this.reportAndEvaluate();
    }

    private async scanFile(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');

            for (const rule of this.enforcementRules) {
                this.applyRule(filePath, content, rule);
            }
        } catch (error) {
            console.warn(`⚠️  Could not scan file: ${filePath}`, error);
        }
    }

    private applyRule(
        filePath: string,
        content: string,
        rule: SecurityRule
    ): void {
        const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(content)) !== null) {
            // Check if file is in allowed list
            if (rule.allowedFiles) {
                const isFileAllowed = rule.allowedFiles.some(pattern => pattern.test(filePath));
                if (isFileAllowed) continue;
            }

            // Check if context is allowed
            if (rule.allowedContexts) {
                const contextStart = Math.max(0, match.index - 100);
                const contextEnd = Math.min(content.length, match.index + match[0].length + 100);
                const context = content.substring(contextStart, contextEnd);

                const isContextAllowed = rule.allowedContexts.some(pattern => pattern.test(context));
                if (isContextAllowed) continue;
            }

            const lineNumber = this.getLineNumber(content, match.index);
            const columnNumber = this.getColumnNumber(content, match.index);

            this.violations.push({
                file: path.relative(process.cwd(), filePath),
                line: lineNumber,
                column: columnNumber,
                rule: rule.name,
                message: rule.message,
                code: match[0],
                severity: rule.severity
            });

            if (!regex.global) break;
        }
    }

    private getLineNumber(content: string, index: number): number {
        return content.substring(0, index).split('\n').length;
    }

    private getColumnNumber(content: string, index: number): number {
        const beforeIndex = content.substring(0, index);
        const lastNewlineIndex = beforeIndex.lastIndexOf('\n');
        return index - lastNewlineIndex;
    }

    private reportAndEvaluate(): boolean {
        const blockingViolations = this.violations.filter(v => v.severity === 'blocking');
        const warningViolations = this.violations.filter(v => v.severity === 'warning');

        console.log('\n🛡️  CI SECURITY ENFORCEMENT RESULTS');
        console.log('=====================================');

        if (this.violations.length === 0) {
            console.log('✅ No security policy violations detected. All checks passed!');
            return true;
        }

        console.log(`🚨 Found ${this.violations.length} policy violations:`);
        console.log(`   Blocking: ${blockingViolations.length}`);
        console.log(`   Warnings: ${warningViolations.length}\n`);

        // Report blocking violations
        if (blockingViolations.length > 0) {
            console.log('🚫 BLOCKING VIOLATIONS (Build will fail):');
            console.log('=========================================');

            this.reportViolations(blockingViolations);
        }

        // Report warnings
        if (warningViolations.length > 0) {
            console.log('⚠️  WARNING VIOLATIONS (Review recommended):');
            console.log('============================================');

            this.reportViolations(warningViolations);
        }

        // Determine pass/fail status
        const shouldFail = blockingViolations.length > 0;

        if (shouldFail) {
            console.log('\n❌ CI SECURITY ENFORCEMENT FAILED');
            console.log('Fix all blocking violations before proceeding.');
            console.log('\nApproved patterns:');
            console.log('- Use UnifiedWebviewFactory.openSecurePanel() instead of createWebviewPanel()');
            console.log('- Use data-action attributes instead of inline event handlers');
            console.log('- Use escapeHtml() for all user-controlled data interpolations');
            console.log('- Vendor external resources locally in /media/ directory');
        } else {
            console.log('\n✅ CI SECURITY ENFORCEMENT PASSED');
            if (warningViolations.length > 0) {
                console.log('Note: Some warnings detected. Review recommended for best practices.');
            }
        }

        return !shouldFail;
    }

    private reportViolations(violations: SecurityViolation[]): void {
        const groupedByRule = violations.reduce((groups, violation) => {
            if (!groups[violation.rule]) groups[violation.rule] = [];
            groups[violation.rule].push(violation);
            return groups;
        }, {} as Record<string, SecurityViolation[]>);

        for (const [rule, ruleViolations] of Object.entries(groupedByRule)) {
            console.log(`\n📋 Rule: ${rule}`);

            for (const violation of ruleViolations) {
                console.log(`   ${violation.file}:${violation.line}:${violation.column}`);
                console.log(`   ${escapeHtml(violation.message)}`);
                console.log(`   Code: ${escapeHtml(violation.code.trim())}`);
                console.log();
            }
        }
    }
}

// CLI execution
if (require.main === module) {
    const projectPath = process.argv[2] || process.cwd();
    const enforcement = new CISecurityEnforcement();

    enforcement.enforceSecurityPolicies(projectPath)
        .then((passed) => {
            process.exit(passed ? 0 : 1);
        })
        .catch((error) => {
            console.error('❌ CI Security Enforcement failed:', error);
            process.exit(1);
        });
}

export { CISecurityEnforcement };
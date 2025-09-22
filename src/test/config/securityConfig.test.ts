import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityConfigManager, DEFAULT_SECURITY_CONFIG } from '../../config/securityConfig';

describe('SecurityConfig', () => {
    let manager: SecurityConfigManager;

    beforeEach(() => {
        manager = SecurityConfigManager.getInstance();
    });

    describe('SecurityConfigManager', () => {
        it('should be a singleton', () => {
            const manager1 = SecurityConfigManager.getInstance();
            const manager2 = SecurityConfigManager.getInstance();
            expect(manager1).toBe(manager2);
        });

        it('should return default thresholds', () => {
            const thresholds = manager.getThresholds();
            expect(thresholds).toEqual(DEFAULT_SECURITY_CONFIG);
        });

        it('should calculate security scores correctly', () => {
            const issues = [
                { severity: 'critical', count: 2 },
                { severity: 'high', count: 1 },
                { severity: 'medium', count: 3 }
            ];

            const score = manager.calculateSecurityScore(issues);

            // Expected: 100 - (2*10 + 1*7 + 3*3) = 100 - 36 = 64
            expect(score).toBe(64);
        });

        it('should not allow negative scores', () => {
            const issues = [
                { severity: 'critical', count: 20 }
            ];

            const score = manager.calculateSecurityScore(issues);
            expect(score).toBe(0);
        });

        it('should not allow scores above 100', () => {
            const issues: { severity: string; count: number }[] = [];
            const score = manager.calculateSecurityScore(issues);
            expect(score).toBe(100);
        });

        it('should classify security levels correctly', () => {
            expect(manager.getSecurityLevel(98)).toBe('excellent');
            expect(manager.getSecurityLevel(90)).toBe('good');
            expect(manager.getSecurityLevel(75)).toBe('warning');
            expect(manager.getSecurityLevel(40)).toBe('critical');
        });

        it('should identify slow queries', () => {
            expect(manager.isSlowQuery(50)).toBe(false);
            expect(manager.isSlowQuery(150)).toBe(true);
        });

        it('should identify high memory usage', () => {
            const lowMemory = 64 * 1024 * 1024; // 64MB
            const highMemory = 256 * 1024 * 1024; // 256MB

            expect(manager.isHighMemoryUsage(lowMemory)).toBe(false);
            expect(manager.isHighMemoryUsage(highMemory)).toBe(true);
        });

        it('should identify low cache hit rates', () => {
            expect(manager.isLowCacheHitRate(0.8)).toBe(false);
            expect(manager.isLowCacheHitRate(0.5)).toBe(true);
        });

        it('should identify slow routes', () => {
            expect(manager.isSlowRoute(300)).toBe(false);
            expect(manager.isSlowRoute(700)).toBe(true);
        });

        it('should classify vulnerability severity', () => {
            expect(manager.getVulnerabilitySeverity('SQL Injection')).toBe('critical');
            expect(manager.getVulnerabilitySeverity('Cross-Site Scripting')).toBe('high');
            expect(manager.getVulnerabilitySeverity('Information Disclosure')).toBe('medium');
            expect(manager.getVulnerabilitySeverity('Weak Password Policy')).toBe('low');
            expect(manager.getVulnerabilitySeverity('Unknown Vulnerability')).toBe('low');
        });

        it('should update thresholds', () => {
            const updates = {
                securityScore: {
                    excellent: 99,
                    good: 90,
                    warning: 80,
                    critical: 60
                }
            };

            manager.updateThresholds(updates);
            const thresholds = manager.getThresholds();

            expect(thresholds.securityScore.excellent).toBe(99);
            expect(thresholds.securityScore.good).toBe(90);
        });

        it('should update policies', () => {
            const updates = {
                webview: {
                    enableScripts: false,
                    localResourceRoots: ['custom'],
                    retainContextWhenHidden: true
                }
            };

            manager.updatePolicies(updates);
            const policies = manager.getPolicies();

            expect(policies.webview.enableScripts).toBe(false);
            expect(policies.webview.localResourceRoots).toEqual(['custom']);
        });
    });

    describe('Default Configuration', () => {
        it('should have reasonable default thresholds', () => {
            expect(DEFAULT_SECURITY_CONFIG.securityScore.excellent).toBeGreaterThan(90);
            expect(DEFAULT_SECURITY_CONFIG.securityScore.critical).toBeLessThan(60);
            expect(DEFAULT_SECURITY_CONFIG.performance.slowQueryThreshold).toBeGreaterThan(0);
            expect(DEFAULT_SECURITY_CONFIG.performance.lowCacheHitRate).toBeLessThan(1);
        });

        it('should have proper issue weights', () => {
            const weights = DEFAULT_SECURITY_CONFIG.issueWeights;
            expect(weights.critical).toBeGreaterThan(weights.high);
            expect(weights.high).toBeGreaterThan(weights.medium);
            expect(weights.medium).toBeGreaterThan(weights.low);
        });

        it('should categorize vulnerabilities properly', () => {
            const vulns = DEFAULT_SECURITY_CONFIG.vulnerabilities;
            expect(vulns.critical).toContain('sql-injection');
            expect(vulns.high).toContain('xss');
            expect(vulns.medium).toContain('information-disclosure');
            expect(vulns.low).toContain('weak-password-policy');
        });
    });
});
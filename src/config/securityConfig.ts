export interface SecurityThresholds {
    // Security scoring thresholds
    securityScore: {
        excellent: number;
        good: number;
        warning: number;
        critical: number;
    };

    // Issue severity weights for scoring
    issueWeights: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        vulnerability: number;
    };

    // Performance thresholds
    performance: {
        slowQueryThreshold: number; // milliseconds
        highMemoryThreshold: number; // bytes
        lowCacheHitRate: number; // percentage (0-1)
        slowRouteThreshold: number; // milliseconds
    };

    // Vulnerability severity levels
    vulnerabilities: {
        critical: string[];
        high: string[];
        medium: string[];
        low: string[];
    };
}

export interface SecurityPolicies {
    csp: {
        enabled: boolean;
        directives: Record<string, string>;
    };

    webview: {
        enableScripts: boolean;
        localResourceRoots: string[];
        retainContextWhenHidden: boolean;
    };

    validation: {
        sanitizeInputs: boolean;
        validateFileUploads: boolean;
        maxFileSize: number;
        allowedExtensions: string[];
    };
}

export const DEFAULT_SECURITY_CONFIG: SecurityThresholds = {
    securityScore: {
        excellent: 95,
        good: 85,
        warning: 70,
        critical: 50
    },

    issueWeights: {
        critical: 10,
        high: 7,
        medium: 3,
        low: 1,
        vulnerability: 5
    },

    performance: {
        slowQueryThreshold: 100, // 100ms
        highMemoryThreshold: 128 * 1024 * 1024, // 128MB
        lowCacheHitRate: 0.7, // 70%
        slowRouteThreshold: 500 // 500ms
    },

    vulnerabilities: {
        critical: ['remote-code-execution', 'sql-injection', 'authentication-bypass'],
        high: ['xss', 'csrf', 'privilege-escalation', 'directory-traversal'],
        medium: ['information-disclosure', 'weak-encryption', 'session-fixation'],
        low: ['weak-password-policy', 'missing-security-headers', 'insecure-cookies']
    }
};

export const DEFAULT_SECURITY_POLICIES: SecurityPolicies = {
    csp: {
        enabled: true,
        directives: {
            'default-src': "'none'",
            'script-src': "'nonce-{nonce}'",
            'style-src': "'nonce-{nonce}' 'unsafe-inline'",
            'img-src': "vscode-resource: https: data:",
            'font-src': "vscode-resource:",
            'connect-src': "'none'"
        }
    },

    webview: {
        enableScripts: true,
        localResourceRoots: ['media', 'out/media'],
        retainContextWhenHidden: false
    },

    validation: {
        sanitizeInputs: true,
        validateFileUploads: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        allowedExtensions: ['.php', '.json', '.md', '.txt', '.log']
    }
};

export class SecurityConfigManager {
    private static instance: SecurityConfigManager;
    private config: SecurityThresholds;
    private policies: SecurityPolicies;

    private constructor() {
        this.config = { ...DEFAULT_SECURITY_CONFIG };
        this.policies = { ...DEFAULT_SECURITY_POLICIES };
    }

    static getInstance(): SecurityConfigManager {
        if (!SecurityConfigManager.instance) {
            SecurityConfigManager.instance = new SecurityConfigManager();
        }
        return SecurityConfigManager.instance;
    }

    getThresholds(): SecurityThresholds {
        return this.config;
    }

    getPolicies(): SecurityPolicies {
        return this.policies;
    }

    updateThresholds(updates: Partial<SecurityThresholds>): void {
        this.config = { ...this.config, ...updates };
    }

    updatePolicies(updates: Partial<SecurityPolicies>): void {
        this.policies = { ...this.policies, ...updates };
    }

    calculateSecurityScore(issues: { severity: string; count: number }[]): number {
        const weights = this.config.issueWeights;
        let totalDeduction = 0;

        for (const issue of issues) {
            const weight = weights[issue.severity as keyof typeof weights] || weights.low;
            totalDeduction += issue.count * weight;
        }

        return Math.max(0, Math.min(100, 100 - totalDeduction));
    }

    getSecurityLevel(score: number): 'excellent' | 'good' | 'warning' | 'critical' {
        const thresholds = this.config.securityScore;

        if (score >= thresholds.excellent) return 'excellent';
        if (score >= thresholds.good) return 'good';
        if (score >= thresholds.warning) return 'warning';
        return 'critical';
    }

    isSlowQuery(executionTime: number): boolean {
        return executionTime > this.config.performance.slowQueryThreshold;
    }

    isHighMemoryUsage(memoryUsage: number): boolean {
        return memoryUsage > this.config.performance.highMemoryThreshold;
    }

    isLowCacheHitRate(hitRate: number): boolean {
        return hitRate < this.config.performance.lowCacheHitRate;
    }

    isSlowRoute(executionTime: number): boolean {
        return executionTime > this.config.performance.slowRouteThreshold;
    }

    getVulnerabilitySeverity(vulnerability: string): string {
        // Normalize common variants and spacing
        let norm = vulnerability.toLowerCase().trim();
        norm = norm.replace(/\s+/g, '-'); // spaces -> dashes (e.g., "information disclosure")
        norm = norm.replace(/cross[- ]?site[- ]?scripting/g, 'xss'); // map to xss

        for (const [severity, vulns] of Object.entries(this.config.vulnerabilities)) {
            if (vulns.some(v => norm.includes(v))) {
                return severity;
            }
        }

        return 'low';
    }
}

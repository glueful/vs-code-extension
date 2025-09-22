import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecureWebviewManager, escapeHtml, sanitizeForWebview } from '../../utils/webviewSecurity';
import { mockVscode } from '../setup';

describe('WebviewSecurity', () => {
    let manager: SecureWebviewManager;
    let mockContext: any;

    beforeEach(() => {
        manager = SecureWebviewManager.getInstance();
        mockContext = {
            extensionUri: { fsPath: '/test/extension' },
            subscriptions: []
        };
        vi.clearAllMocks();
    });

    describe('escapeHtml', () => {
        it('should escape HTML special characters', () => {
            const input = '<script>alert("xss")</script>';
            const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
            expect(escapeHtml(input)).toBe(expected);
        });

        it('should escape ampersands', () => {
            expect(escapeHtml('A & B')).toBe('A &amp; B');
        });

        it('should escape quotes', () => {
            expect(escapeHtml('He said "Hello"')).toBe('He said &quot;Hello&quot;');
            expect(escapeHtml("It's working")).toBe('It&#039;s working');
        });

        it('should handle empty strings', () => {
            expect(escapeHtml('')).toBe('');
        });

        it('should handle already escaped content correctly', () => {
            const input = '&lt;script&gt;';
            const expected = '&amp;lt;script&amp;gt;';
            expect(escapeHtml(input)).toBe(expected);
        });
    });

    describe('sanitizeForWebview', () => {
        it('should sanitize string data', () => {
            const input = '<img src="x" data-test="alert(1)">';
            const expected = '&lt;img src=&quot;x&quot; data-test=&quot;alert(1)&quot;&gt;';
            expect(sanitizeForWebview(input)).toBe(expected);
        });

        it('should sanitize object data', () => {
            const input = { name: '<script>alert("xss")</script>', value: 123 };
            const result = sanitizeForWebview(input);
            expect(result).toContain('&lt;script&gt;');
            expect(result).toContain('alert(&quot;xss&quot;)');
        });

        it('should handle null and undefined', () => {
            expect(sanitizeForWebview(null)).toBe('null');
            expect(sanitizeForWebview(undefined)).toBe('undefined');
        });

        it('should handle numbers and booleans', () => {
            expect(sanitizeForWebview(123)).toBe('123');
            expect(sanitizeForWebview(true)).toBe('true');
            expect(sanitizeForWebview(false)).toBe('false');
        });
    });

    describe('SecureWebviewManager', () => {
        it('should create secure webview panels', () => {
            const config = {
                viewType: 'test-view',
                title: 'Test Panel',
                handlers: {
                    'test-command': vi.fn()
                }
            };

            const content = '<div>Test Content</div>';
            const panel = manager.createSecureWebview(config, content, mockContext);

            expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'test-view',
                'Test Panel',
                1, // ViewColumn.One
                expect.objectContaining({
                    enableScripts: true,
                    retainContextWhenHidden: false
                })
            );
        });

        it('should reuse existing panels', () => {
            const config = {
                viewType: 'test-view',
                title: 'Test Panel'
            };

            // Create first panel
            manager.createSecureWebview(config, '<div>Content 1</div>', mockContext);

            // Create second panel with same viewType
            manager.createSecureWebview(config, '<div>Content 2</div>', mockContext);

            // Should only create one panel
            expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
        });

        it('should update content of existing panels', () => {
            const config = {
                viewType: 'test-view',
                title: 'Test Panel'
            };

            manager.createSecureWebview(config, '<div>Initial</div>', mockContext);
            manager.updateContent('test-view', '<div>Updated</div>');

            // Content should be updated without creating new panel
            expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
        });

        it('should dispose panels correctly', () => {
            const config = {
                viewType: 'test-view',
                title: 'Test Panel'
            };

            const mockPanel = {
                reveal: vi.fn(),
                webview: { html: '' },
                dispose: vi.fn(),
                onDidDispose: vi.fn()
            };

            mockVscode.window.createWebviewPanel.mockReturnValue(mockPanel);

            manager.createSecureWebview(config, '<div>Test</div>', mockContext);
            manager.disposePanel('test-view');

            expect(mockPanel.dispose).toHaveBeenCalled();
        });

        it('should dispose all panels', () => {
            const panels = ['panel1', 'panel2', 'panel3'];
            const mockPanels: any[] = [];

            panels.forEach(viewType => {
                const mockPanel = {
                    reveal: vi.fn(),
                    webview: { html: '' },
                    dispose: vi.fn(),
                    onDidDispose: vi.fn()
                };
                mockPanels.push(mockPanel);
                mockVscode.window.createWebviewPanel.mockReturnValueOnce(mockPanel);

                manager.createSecureWebview({
                    viewType,
                    title: `Panel ${viewType}`
                }, '<div>Test</div>', mockContext);
            });

            manager.disposeAll();

            mockPanels.forEach(panel => {
                expect(panel.dispose).toHaveBeenCalled();
            });
        });
    });
});
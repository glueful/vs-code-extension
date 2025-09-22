# CI Security Enforcement

This document describes the automated security enforcement system that prevents security regressions in the Glueful VS Code extension.

## Overview

The CI Security Enforcement system consists of two main components:

1. **CI Security Enforcement Script** (`scripts/ci-security-enforcement.ts`) - Strict policy enforcement
2. **Security Linter** (`scripts/security-lint.ts`) - Comprehensive vulnerability detection

These tools work together to maintain security standards and prevent the introduction of vulnerabilities.

## CI Security Enforcement Rules

### Blocking Violations (Build Fails)

These violations will cause the CI build to fail and must be fixed before merging:

#### 1. Unauthorized Webview Creation
- **Rule**: `unauthorized-webview-creation`
- **Pattern**: Direct usage of `vscode.window.createWebviewPanel()`
- **Solution**: Use `UnifiedWebviewFactory.openSecurePanel()` instead
- **Approved Files**: Only infrastructure files in `unifiedWebviewFactory.ts`, `webviewSecurity.ts`, etc.

#### 2. Inline Event Handlers
- **Rule**: `inline-event-handlers`
- **Pattern**: HTML attributes like `onclick=""`, `onload=""`, etc.
- **Solution**: Use `data-action` attributes with postMessage communication
- **Approved Files**: Only test files

#### 3. External Script Loading
- **Rule**: `external-script-loading`
- **Pattern**: `<script src="https://...">` tags
- **Solution**: Vendor all external resources locally in `/media/` directory

### Warning Violations (Review Recommended)

These violations generate warnings but don't fail the build:

#### 4. Potentially Unescaped HTML
- **Rule**: `potentially-unescaped-html`
- **Pattern**: Template literals with interpolated data in HTML context
- **Solution**: Wrap user-controlled data with `escapeHtml()`

#### 5. Direct Webview HTML Assignment
- **Rule**: `direct-webview-html-assignment`
- **Pattern**: Direct assignment to `.webview.html`
- **Solution**: Use factory update methods for consistency

## Usage

### Local Development

```bash
# Run security enforcement only
npm run security:enforce

# Run comprehensive security scan
npm run security:scan

# Run both enforcement and scan
npm run security:full

# Pre-commit hook (runs automatically)
npm run precommit
```

### Manual Execution

```bash
# Basic enforcement
npx ts-node scripts/ci-security-enforcement.ts

# Enforcement for specific directory
npx ts-node scripts/ci-security-enforcement.ts ./src

# Security linting
npx ts-node scripts/security-lint.ts --strict
```

## CI/CD Integration

### GitHub Actions

The security enforcement is automatically run on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

The workflow includes:
1. **Security Policy Enforcement** - Runs `ci-security-enforcement.ts`
2. **Security Linting** - Runs `security-lint.ts` with `--ci` flag
3. **TypeScript Compilation** - Ensures no type errors
4. **PR Comments** - Automatic feedback on policy violations

### Configuration

The GitHub Actions workflow is defined in `.github/workflows/security-enforcement.yml`.

## Approved File Patterns

The following files are exempt from certain security restrictions:

### Core Infrastructure Files
- `unifiedWebviewFactory.ts` - Factory implementation
- `webviewSecurity.ts` - Security utilities
- `webview.ts` - Base webview utilities
- `ci-security-enforcement.ts` - This enforcement script
- `security-*.ts` - Security-related scripts
- `fix-*.ts` - Fix/migration scripts

### Test Files
- `*.test.ts` - Unit test files
- `*.spec.ts` - Specification test files
- `test/**/*.ts` - Test directory files
- `tests/**/*.ts` - Tests directory files

## Bypassing Enforcement

In rare cases where a legitimate exception is needed:

### 1. Add to Approved Files
Edit `ci-security-enforcement.ts` and add the file pattern to `approvedFiles`:

```typescript
private readonly approvedFiles = [
    // ... existing patterns
    /your-special-file\.ts$/
];
```

### 2. Add Allowed Context
For specific code patterns that should be allowed, add to `allowedContexts`:

```typescript
{
    name: 'your-rule',
    // ... other config
    allowedContexts: [
        /your-safe-pattern/
    ]
}
```

### 3. Update Rule Severity
Change from `'blocking'` to `'warning'` if the violation should not fail the build:

```typescript
{
    name: 'your-rule',
    severity: 'warning', // was 'blocking'
    // ... other config
}
```

## Security Best Practices

### For Developers

1. **Always use the factory**: Replace `vscode.window.createWebviewPanel()` with `UnifiedWebviewFactory.openSecurePanel()`

2. **Escape user data**: Wrap all user-controlled interpolations with `escapeHtml()`
   ```typescript
   // ❌ Unsafe
   `<div>${userInput}</div>`

   // ✅ Safe
   `<div>${escapeHtml(userInput)}</div>`
   ```

3. **Use data-action attributes**: Replace inline event handlers
   ```html
   <!-- ❌ Unsafe -->
   <button onclick="doSomething()">Click</button>

   <!-- ✅ Safe -->
   <button data-action="doSomething">Click</button>
   ```

4. **Vendor external resources**: Never load scripts/styles from CDNs
   ```html
   <!-- ❌ Unsafe -->
   <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

   <!-- ✅ Safe -->
   <script src="./media/chart.min.js"></script>
   ```

### For Code Reviewers

1. **Check security scan results** in CI before approving PRs
2. **Verify factory usage** for any new webview panels
3. **Look for proper escaping** in HTML templates
4. **Ensure no external dependencies** are being loaded

## Troubleshooting

### Common Issues

#### "Direct createWebviewPanel usage is forbidden"
- **Cause**: Using `vscode.window.createWebviewPanel()` directly
- **Fix**: Use `UnifiedWebviewFactory.openSecurePanel()` instead
- **Documentation**: See [Security Compliance Matrix](../SECURITY_COMPLIANCE_MATRIX.md)

#### "Inline event handlers are forbidden"
- **Cause**: Using `onclick`, `onload`, etc. in HTML
- **Fix**: Use `data-action` attributes with postMessage
- **Example**: Replace `onclick="action()"` with `data-action="action"`

#### "External script loading is forbidden"
- **Cause**: Loading scripts from external URLs
- **Fix**: Download and vendor the resource in `/media/` directory
- **Security**: Prevents supply chain attacks

#### "Potential unescaped HTML interpolation"
- **Cause**: Template literal with user data in HTML context
- **Fix**: Wrap with `escapeHtml()` function
- **Example**: Replace `${userInput}` with `${escapeHtml(userInput)}`

### Debug Mode

For detailed debugging, modify the enforcement script temporarily:

```typescript
// Add debug logging
console.log('Checking rule:', rule.name, 'against:', filePath);
console.log('Match found:', match);
```

## Maintenance

### Adding New Rules

1. **Define the rule** in `enforcementRules` array
2. **Set appropriate severity** (`'blocking'` or `'warning'`)
3. **Add allowed files/contexts** if needed
4. **Test the rule** with known violations
5. **Update documentation**

### Updating Approved Files

When adding new infrastructure files:

1. **Add pattern to `approvedFiles`**
2. **Document the reason** in code comments
3. **Test that enforcement still works**
4. **Update this documentation**

---

For questions or issues with security enforcement, see the [Security Compliance Matrix](../SECURITY_COMPLIANCE_MATRIX.md) or contact the development team.
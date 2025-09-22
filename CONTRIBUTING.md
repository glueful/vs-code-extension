## Contributing to Glueful Framework Tools

Thanks for your interest in contributing! This extension focuses on secure, reliable tooling for the Glueful PHP framework. Please follow the guidelines below to keep the project consistent and safe.

### 1. Quick Start
1. Fork & clone the repo
2. Install dependencies:
   ```bash
   pnpm install || npm install
   ```
3. Build once:
   ```bash
   npm run compile
   ```
4. Launch the Extension Development Host (F5 in VS Code)

### 2. Project Structure
- Source TypeScript: `src/`
- Compiled output: `out/`
- Snippets: `snippets/`
- Security matrix: `SECURITY_COMPLIANCE_MATRIX.md`

### 3. Commit Hygiene
- Keep commits focused and logically grouped
- Use present tense: `Add routes panel filter`, not `Added`
- Reference related issue numbers when applicable (`#42`)

### 4. Coding Standards
- TypeScript strictness: prefer explicit types for exported symbols
- Avoid one-letter variable names except for trivial loops
- No inline `<script>` event handlers inside webviews
- All dynamic HTML passed through the escaping helper (see `webviewSecurity.ts`)
- Use the centralized webview factory (`openSecurePanel`) for new panels

### 5. Lint & Format (after tooling is added)
```bash
npm run lint      # Check
npm run lint:fix  # Auto-fix
npm run format    # Check formatting
npm run format:fix
```

### 6. Security Expectations
- Never introduce external CDN scripts/styles into webviews
- Maintain CSP + nonce logic in the factory
- Sanitize or escape any user / CLI / file-derived strings inserted into HTML
- If adding a new panel, update `SECURITY_COMPLIANCE_MATRIX.md`

### 7. Adding Dependencies
- Avoid heavy runtime dependencies—extension should stay lean
- Dev tooling (lint/format/test) is fine if widely adopted
- Justify any new runtime dependency in the PR description

### 8. Testing / Verification
- Manually exercise new panels & commands in Extension Host
- Run security scans (if configured):
  ```bash
  npm run security:full
  ```

### 9. Pull Request Checklist
- [ ] Follows coding & security standards
- [ ] Uses webview factory (if applicable)
- [ ] No inline handlers or external scripts
- [ ] Security matrix updated (if new panel)
- [ ] Lint & format clean
- [ ] Clear summary & rationale

### 10. Reporting Security Issues
Do NOT open a public issue—see `SECURITY.md` for the private reporting process.

### 11. License / Ownership
Content contributed is licensed under the project’s license (if specified); by submitting a PR you confirm you have the right to contribute the code.

Thanks for helping improve Glueful Framework tooling!

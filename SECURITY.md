## Security Policy

We take the security of the Glueful Framework Tools extension seriously. Thank you for helping us protect users and their applications.

### Supported Versions
Only the latest published marketplace version is actively supported for security fixes. Critical issues may trigger an out-of-band patch release.

### Reporting a Vulnerability
Please DO NOT open a public GitHub issue for security concerns.

Instead, email: `security@glueful.com` with:
1. Vulnerability summary & impact
2. Steps to reproduce / proof of concept
3. Affected extension version & VS Code version
4. Environment details (OS, Glueful framework version if relevant)

You will receive an acknowledgement within 3 business days. We may request additional detail or a secure channel for exploit information.

### Handling Process
1. Triage & reproduce
2. Assess severity (internal rubric based on exploitability & impact)
3. Prepare fix & add / update security tests or lint rules where feasible
4. Coordinate an advisory + release (may delay to batch low severity issues)
5. Credit reporter (optional—state preference in report)

### Scope
In scope:
- Extension code (TypeScript) & webview content generation
- Security scanning / CLI invocation logic
- HTML generation & CSP / escaping layers

Out of scope (report to upstream projects):
- VS Code editor vulnerabilities
- Glueful PHP framework core security issues
- Dependencies’ own vulnerabilities unless introduced by insecure usage here

### Non-Qualifying Reports (examples)
- Best-practice suggestions without clear exploit path
- Missing security headers in external domains we do not control
- Self XSS requiring modification of local extension source

### Hardening Expectations
- All dynamic HTML must be escaped before insertion
- CSP with nonce enforced for each webview
- No remote code execution via CLI argument injection (inputs sanitized)
- No inline event handlers or remote script imports

### Coordinated Disclosure
If a reported issue affects downstream users materially, we prefer coordinated disclosure with a short embargo until a patch is available.

### Questions
For general (non-sensitive) questions open a standard GitHub issue.

Thank you for helping keep Glueful users safe.

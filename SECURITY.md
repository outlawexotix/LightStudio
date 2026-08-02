# Security & Secret-Handling Guidance

This document describes immediate remediation steps if secrets are found, recommended scanning commands, and a rotation checklist.

## 1) Quick local scans (current working tree)
- Search for common tokens:
  git grep -n -I -E "api[_-]?key|apikey|client[_-]?secret|client_secret|access[_-]?key|secret|password|token|BEGIN (RSA )?PRIVATE KEY|service_account" || true

- Recommended scanner (gitleaks example):
  gitleaks detect --source . --report-path gitleaks-report.json

- Alternative scanner (detect-secrets example):
  pip install detect-secrets
  detect-secrets scan > .secrets.baseline

## 2) History-aware scanning
- Use history scanners to inspect all commits:
  gitleaks detect --source . --report-path gitleaks-history.json
  trufflehog filesystem --path . --json > trufflehog-report.json

## 3) Immediate remediation playbook (summary)
1. Identify the exposed secret(s) and the commits that introduced them.
2. Rotate/revoke the affected credentials immediately (see Rotation checklist).
3. Remove secrets from history:
   - Preferred: use a history-rewrite tool to remove files or replace text across commits (mirror-clone the repo, run replacements/invert-paths, push force).
   - Alternative: use a history-cleaning helper for simpler tasks (mirror-clone, delete, cleanup, push force).
4. Run verification scans against the cleaned repo.
5. Instruct all contributors to reclone (history rewrite rewrites commit history).
6. Update CI and deployments to use new credentials.

> Important: Rotating/revoking credentials must happen immediately. Removing secrets from history does not invalidate copies already cloned by others.

## 4) Verification after rewrite
- Re-run gitleaks / detect-secrets on the cleaned repository.
- Confirm no branches or tags still expose secrets.
- Ask all contributors to reclone or hard-reset to origin.

## 5) Rotation checklist (examples of what to rotate/revoke)
- Firebase / Google service account keys: revoke & re-issue in Google Cloud Console.
- API keys (third-party): regenerate in provider dashboards.
- Android keystores (.jks/.keystore): follow Play Console guidance; contact support if needed.
- CI tokens and stored secrets: rotate in CI secret storage (e.g., GitHub Actions secrets).
- Personal access tokens and other privileged tokens: revoke and re-issue.

## 6) Prevention & controls
- Keep sensitive files out of VCS (.gitignore entries included).
- Add pre-commit secret checks and CI gating scans.
- Use secret managers for runtime/CI secrets (GitHub Secrets, GCP Secret Manager, AWS Secrets Manager).
- Maintain this SECURITY.md and reference it in CONTRIBUTING.md.

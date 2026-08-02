# Contributing

Thanks for contributing. A few rules to keep the repository healthy and secure.

## Secret policy
- Do NOT commit secrets: API keys, service-account JSON, keystore files, `.env` files, or private keys.
- Ensure `.gitignore` contains the sensitive patterns in this repository.

## Local setup (recommended)
1. Install pre-commit:
   ```bash
   pip install pre-commit
   pre-commit install
   ```

2. (Optional) Install detect-secrets and gitleaks:
   ```bash
   pip install detect-secrets
   # gitleaks can be installed via package manager or downloaded per platform
   ```

3. Create an approved baseline for detect-secrets (only once):
   ```bash
   detect-secrets scan > .secrets.baseline
   git add .secrets.baseline
   git commit -m "Add secrets baseline"
   ```

4. Run checks before PR:
   ```bash
   pre-commit run --all-files
   gitleaks detect --source . --report-path gitleaks-local.json
   ```

## If you accidentally commit a secret
- Immediately notify maintainers.
- Follow the steps in SECURITY.md: rotate the credentials and remove them from history.
- Do not push new commits with the secret present.

## PR guidance
- Keep changes small and focused.
- Include tests or manual verification steps for behavior changes.
- Describe any configuration or secret handling changes in the PR description.

### CI/CD Documentation Removed

This repository previously duplicated extensive prose about GitHub Actions workflows (triggers, job flow, secrets, phases, optimization ideas). That material has been removed to avoid drift and keep the source of truth in code.

Source of truth:

```
.github/workflows/*.yml
```

If you need to understand or change CI/CD:

-   Open the relevant workflow file and read the steps directly.
-   Infer required secrets / permissions from the `permissions:` block and `env` usage.
-   Infrastructure deployment behavior is defined in `deploy-infrastructure.yml` alongside the Bicep templates under `infrastructure/`.

Non‑obvious (not trivially deducible) conventions retained:

-   Workflows rely on OIDC (no publish profiles or long‑lived secrets) – look for `azure/login` usage.
-   Private package access uses the standard `setup-node` registry configuration for the `@piquet-h` scope (see any job that installs dependencies).

Everything else should be read from the workflow YAML itself.

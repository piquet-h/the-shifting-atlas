# AGENTS.md (Infrastructure)

This file provides **infrastructure-specific** guidance for AI coding agents.

It is intended to apply when editing anything under `infrastructure/`.

## Scope

- This folder contains Bicep templates for provisioning Azure resources (SWA, Function App, Service Bus, Cosmos DB, Key Vault, Application Insights, Workbooks, Alerts).
- Prefer minimal, reviewable diffs; infra changes are high impact.
- Do not modify application runtime code (`backend/`, `frontend/`, `shared/`) unless explicitly requested.

## Fast orientation

- Infra overview, parameters, outputs, and changelog: `infrastructure/README.md`
- Main deployment entrypoint: `infrastructure/main.bicep`
- Workbooks JSON sources: `infrastructure/workbooks/`

## Authoring rules (high-signal)

- **Prefer Azure Verified Modules (AVM)** when introducing new Azure resource types (avoid raw resources unless necessary).
- Keep resource naming stable. Avoid renaming resources/parameters/outputs unless explicitly required.
- Avoid hardcoding subscription IDs, tenant IDs, or environment-specific hostnames.
- Never embed secrets in templates. Prefer Key Vault + Managed Identity wiring.
- Use parameters for environment variability; keep defaults safe.
- Keep templates idempotent (re-deploy should update in place, not recreate unexpectedly).

## Observability artifacts

- Workbooks should be deployable and usable immediately:
    - Parameters must exist in both the workbook `parameters[]` and any `KqlParameterItem` controls.
    - Guard KQL against blank strings / placeholder tokens before parsing.
    - Provide deploy-time defaults for thresholds.
    - Never fabricate metrics (prefer null + info banner when baseline missing).

(These rules are also captured in `.github/copilot-instructions.md` under the workbook parameter guidance.)

## Validation expectations

When editing Bicep:

- Validate templates compile (Bicep build/lint).
- Keep changes scoped and explain why a change is safe.

If you add a new resource or parameter:

- Update `infrastructure/README.md` (parameters/outputs tables + changelog entry).

## Local/prod wiring guardrails

- Backend app settings are declared in `main.bicep` and must match what the backend reads (see `backend/src/persistenceConfig.ts`).
- Prefer referencing `applicationInsights.properties.ConnectionString` or Key Vault references over duplicating values.

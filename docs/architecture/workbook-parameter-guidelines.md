# Workbook Parameter Design Guidelines

Altitude: Architecture (Layer 4). Purpose: Prescribe technical implementation rules for Azure Application Insights Workbook parameters so dashboards remain deterministic, self-explanatory, and deployable across environments without manual post-editing.

## Scope

Applies to any new or modified workbook JSON (performance, movement/navigation, AI cost, reliability, partition pressure, etc.) and associated Bicep templates.

## Core Principles (Derived Nov 2025)

| ID  | Principle                 | What It Means                                                                                                                                                                                         | Why It Matters                                                                                                                                                          |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Dual Surfaces Consistency | Define parameters BOTH in root `parameters[]` AND inside any `KqlParameterItem` control with identical `name`, `label`, `value`, `description`.                                                       | Prevents drift where deploy-time defaults exist but UI pills show blank (or vice versa); guarantees idempotent infra + usable portal view immediately after deployment. |
| P2  | Placeholder Guarding      | In KQL, treat an _unset_ parameter as either empty string **or** its literal placeholder token (e.g. `{MaxRuPerInterval:escape}`). Guard with `raw != '' and raw != '{Param:escape}'` before parsing. | Workbook placeholder strings resolve before user sets values; failing to detect them leads to parsing errors or false calculations using the placeholder text.          |
| P3  | Deploy-Time Defaults      | Every required analytical parameter must include a reasonable default `value` in JSON (not just rely on user entry). Fallback values must be safe (non-alerting, non-zero that causes divide).        | Enables zero-touch environment provisioning; avoids silent panels or misleading 0% metrics due to missing baseline.                                                     |
| P4  | Explanatory Descriptions  | Provide concise `description` clarifying calculation intent (e.g., "Total RU capacity per 5-min interval (RU/s \* 300)"). Avoid narrative fluff.                                                      | Reduces operator misconfiguration (e.g., confusing RU/s with RU per interval); boosts trust and decreases future code edits for clarification.                          |

## Implementation Checklist

```
Given a new parameter
When adding to workbook JSON
Then:
  - Add to root parameters[] with name/label/value/description
  - Add to KqlParameterItem control (if UI exposed) with matching fields
  - Choose stable default (see Decision Matrix)
  - Add placeholder guards in associated KQL queries
  - Use `coalesce` and conditional expressions to suppress derived metrics when baseline invalid
```

## KQL Guard Pattern

```kusto
let raw = '{MaxRuPerInterval:escape}';
let hasValue = raw != '' and raw != '{MaxRuPerInterval:escape}';
let parsed = todouble(raw);
let baseline = iff(hasValue and parsed > 0, parsed, real(null));
```

Use `real(null)` to ensure downstream arithmetic yields null rather than 0 when invalid (preventing false healthy percentages). For percentage metrics:

```kusto
| extend RUPercent = iff(isnotnull(baseline), round(100.0 * TotalRU / baseline, 2), real(null))
```

## Visual Layering Rules

1. Primary metric series (e.g., `RUPercent`) always present (may be null when baseline invalid).
2. High threshold overlay series (e.g., `RUPercentHigh`) emitted only when primary metric exceeds dynamic threshold.
3. Sustained-condition annotation uses separate query/panel (avoid mixing instantaneous overlay logic with duration checks).
4. Informational banners replace missing-baseline or low-sample states (never fabricate metrics).

## Parameter Naming & Defaults Matrix

| Parameter                   | Default                                     | Description Style                                   | Fallback Behavior                     |
| --------------------------- | ------------------------------------------- | --------------------------------------------------- | ------------------------------------- |
| `MaxRuPerInterval`          | ProvisionedRU \* bucketSec (example 120000) | "Total RU capacity per interval (RU/s \* seconds)." | Null RU% + config banner when invalid |
| `SustainedThresholdPercent` | 70                                          | "Base sustained RU% threshold (amber)."             | Use 70 when placeholder/blank         |
| `HighThresholdOffset`       | 10                                          | "Additional percent above base for red threshold."  | Use 10 when placeholder/blank         |

## Decision Matrix for Adding a New Parameter

| Scenario                                           | Add Parameter?      | Justification                       |
| -------------------------------------------------- | ------------------- | ----------------------------------- |
| Operator needs runtime tuning (threshold / factor) | Yes                 | Prevent redeploy for simple tuning  |
| Static constant (e.g., bucket size 5m universally) | No (document only)  | Avoid parameter sprawl              |
| Experimental outlier filter toggle                 | Yes (flag + factor) | Enables safe A/B without code churn |

## Anti-Patterns

| Pattern                            | Why Wrong                                       | Corrective Action                          |
| ---------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| Only root parameter defined        | UI control pills show blank; operator confusion | Mirror parameter in KqlParameterItem       |
| Hard-coded thresholds in KQL       | Redeploy required for tuning                    | Externalize via parameters (Base + Offset) |
| Treat placeholder token as numeric | NaN or silent null computations                 | Implement placeholder guard (P2)           |
| Return 0% when baseline missing    | False sense of stability                        | Return null + informational banner         |

## Example Composite Query (Pressure Trend)

```kusto
let rawMax = '{MaxRuPerInterval:escape}';
let hasMax = rawMax != '' and rawMax != '{MaxRuPerInterval:escape}';
let parsedMax = todouble(rawMax);
let maxIntervalRU = iff(hasMax and parsedMax > 0, parsedMax, real(null));
let baseStr = '{SustainedThresholdPercent:escape}';
let baseThreshold = iff(baseStr == '' or baseStr == '{SustainedThresholdPercent:escape}', 70.0, todouble(baseStr));
let offsetStr = '{HighThresholdOffset:escape}';
let offsetVal = iff(offsetStr == '' or offsetStr == '{HighThresholdOffset:escape}', 10.0, todouble(offsetStr));
let highThreshold = baseThreshold + offsetVal;
// ... data prep ...
| extend RUPercent = iff(isnotnull(maxIntervalRU), round(100.0 * TotalRU / maxIntervalRU, 2), real(null))
| extend RUPercentHigh = iff(isnotnull(RUPercent) and RUPercent > highThreshold, RUPercent, real(null))
```

## Telemetry (Optional Future)

Emit `Dashboard.Parameter.Changed` when parameter adjustments are applied (capture name, oldValue, newValue, actor). Defer until operator workflow established.

## ADR Trigger Criteria

Create or update an ADR when adopting a new parameter pattern that changes:

-   Threshold derivation formula
-   Overlay series semantics
-   Sustained-condition detection logic

## Integration With Copilot Instructions

Copilot agent should:

1. Search for existing parameters before adding new ones.
2. Apply P1–P4 rules automatically when editing workbook JSON.
3. Explain placeholder guard insertion in PR description.

## Color Semantics (Palette Selection)

Purpose: Enforce consistent meaning for gradient palettes so operators can infer health without re-learning color mappings per panel.

| Metric Pattern                                                                   | Desired Interpretation            | Palette                                | Reasoning (Low → High)                                               |
| -------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| High value is good (Success%, Throughput, Availability)                          | Green at high end, Red at low end | `redGreen`                             | Starts at red (bad), ends at green (healthy).                        |
| High value is bad (Error%, Blocked%, Latency, Cost per Operation)                | Red at high end, Green at low end | `greenRed`                             | Starts at green (acceptable), escalates to red (critical).           |
| Bi-modal or neutral distribution (Shares, proportions without inherent polarity) | Highlight extremes symmetrically  | Consider `blue` or discrete thresholds | Avoid misleading red/green bias when neither end is inherently good. |

Rules:

1. Never invert palettes mid-dashboard for the same semantic (e.g., success rate vs another success rate panel). Consistency reduces cognitive load.
2. Use threshold formatters (icons/colors) for categorical states (Normal/Warning/Critical) instead of relying solely on gradient endpoints.
3. Reserve `redBright` exclusively for critical discrete states (e.g., sustained high RU, critical latency) not for gradient midpoints.
4. For dual metrics (SuccessRate & BlockedRate), ensure their palettes oppose each other (SuccessRate `redGreen`, BlockedRate `greenRed`) to align with semantics without custom legends.
5. Do not apply gradient to sparse counts (<10 points); prefer solid color or icon to avoid false precision.

Verification Checklist (Color):

```
Given a new or modified metric tile
When selecting a palette
Then:
  - Confirm metric polarity (high good / high bad / neutral)
  - Choose palette per table above
  - Scan existing dashboard for conflicts
  - Ensure threshold legends align (green ↔ healthy, red ↔ unhealthy)
```

Anti-Patterns:
| Problem | Example | Correction |
|---------|---------|-----------|
| 100% success shows red | SuccessRate using `greenRed` | Switch to `redGreen` |
| Latency gradient ends in green at 1000ms | Palette `redGreen` for latency | Use `greenRed` or threshold colors |
| Mixed palette for same metric across panels | SuccessRate greenRed in table, redGreen in tile | Standardize to one palette (`redGreen`) |

Future Guardrail (optional): Add script `scripts/verify-workbook-palettes.mjs` to assert success-oriented fields do not use `greenRed` and latency/error fields do not use `redGreen`.

_Last updated: 2025-11-10_

---
description: Language & formatting style rules (Prettier, ESLint, naming)
applyTo: '**'
---

# Copilot Language & Style Guide

Single source for per-language generation hints. Keep this concise; link here instead of embedding long rationale blocks in settings or other instruction files.

## Global Principles

-   Prefer TypeScript for new backend/frontend code; JavaScript only for minimal bootstrap scripts.
-   ES Modules everywhere; no CommonJS.
-   Use async/await for all I/O.
-   Keep functions small, composable, pure where practical.
-   Telemetry/event names must come from shared constants (never inline literal strings).

## Tooling Precedence (Authoritative Style Stack)

1. Prettier formats code automatically. Do NOT handcraft alternate spacing, semicolons, or wrapping beyond what Prettier emits.
2. ESLint enforces correctness + selective stylistic gaps not covered by Prettier (domain rules, a11y, telemetry custom rules).
3. TypeScript compiler provides typing / structural guarantees; avoid suppressing errors with `any` or `// @ts-ignore` unless documented.
4. Domain & architectural conventions (this guide + compact guide) sit above for design decisions, not micro‑formatting.

Copilot: When generating code, assume Prettier will post-process; emit code already matching its settings to reduce churn.

## Formatting (Driven by Prettier)

| Setting          | Value               | Intent                                                      |
| ---------------- | ------------------- | ----------------------------------------------------------- |
| `printWidth`     | 140                 | Favor wider lines given domain naming & telemetry constants |
| `tabWidth`       | 4 (YAML override 2) | Readability + explicit nesting; YAML conventional 2         |
| `useTabs`        | false               | Spaces for alignment in mixed environments                  |
| `singleQuote`    | true                | Consistent JS/TS string style                               |
| `trailingComma`  | none                | Minimize noisy diff churn                                   |
| `semi`           | false               | Cleaner minimal syntax (ES modules)                         |
| `arrowParens`    | always              | Explicit clarity for single params                          |
| `bracketSpacing` | true                | Improve object readability                                  |

YAML: inherit indentation 2 spaces via Prettier override.

Copilot MUST:

-   Omit semicolons at statement ends.
-   Use single quotes for strings (except JSON / YAML / Markdown code fences where double quotes may be required or canonical).
-   Wrap arrow function params in parentheses even if single.
-   Avoid adding trailing commas.
-   Use 4-space indentation (2 in YAML) and respect 140 column soft wrap.

Avoid reflowing long narrative strings; prefer template literals only when interpolation or multi-line formatting is required.

## Naming & Patterns

| Concern                | Convention             | Example                 |
| ---------------------- | ---------------------- | ----------------------- |
| Azure Function (HTTP)  | `Http<Verb><Domain>`   | `HttpMovePlayer`        |
| Azure Function (Queue) | `Queue<Process><Item>` | `QueueProcessNPCStep`   |
| Domain Models          | Nouns, singular        | `Player`, `Location`    |
| Utility Modules        | verb-noun kebab        | `validate-direction.ts` |

## TypeScript / JavaScript

-   Always add explicit return types on exported functions.
-   Narrow unknown/any at boundaries only; avoid propagating `any`.
-   Prefer discriminated unions over enums when modeling state progressions.
-   Avoid default exports.
-   For React (frontend): Functional components, hooks; no legacy class components.
-   Keep side effects isolated (initialization modules or Function triggers).
-   Prefer named imports/exports; avoid default exports for clearer refactors.
-   Avoid broad barrel files unless they demonstrably reduce import churn without circular deps.

### Error Handling

-   Throw domain-specific errors (extend `Error`) at boundaries; map to HTTP status in HTTP triggers.
-   Avoid swallowing errors—log with telemetry helper including correlation ID.

## React / JSX / TSX

-   Co-locate component + styles (Tailwind utility classes inline; no separate SCSS).
-   Use semantic HTML; accessibility (aria attributes) for interactive elements.
-   Keep components ≤ ~150 lines; split when state/effect complexity grows.

## Markdown

-   Keep lines wrapped at ~100 chars for readability unless tables or code blocks.
-   Use reference links for repeated URLs.
-   Prefer linking design docs instead of duplicating large narrative blocks.

## JSON / YAML

-   Structural data only; no comments inside JSON (use adjacent README if rationale needed).
-   YAML indentation: 2 spaces, no tabs.
-   Stable key ordering for config to reduce diff churn.

## Shell (sh)

-   Target POSIX sh compatibility where feasible; avoid Bash-only features unless required.
-   `set -euo pipefail` at top for non-trivial scripts.
-   Quote all variable expansions (`"$VAR"`).

## MJS / MTS

-   Use `.mts` for TypeScript ESM modules where Node resolution benefits, else `.ts`.
-   Use `.mjs` only for runtime JavaScript modules that must remain JS (tooling constraints).

## Copilot Inline Suggestion Policy

| Language         | Inline Suggestions  | Rationale                                           |
| ---------------- | ------------------- | --------------------------------------------------- |
| TypeScript / TSX | Enabled             | High velocity, patterns benefit from AI scaffolding |
| JavaScript / JSX | Enabled             | Similar to TS where types not required              |
| Markdown         | Disabled by default | Reduce distraction while writing prose              |
| JSON / YAML      | Enabled             | Structural key/value scaffolding helpful            |
| Shell            | Enabled             | Quick command snippet generation                    |

## Removed Predictive Ordering / Scheduling

All former implementation ordering, predictive scheduling, and variance mechanisms are retired. Do not attempt to recreate numeric ordering fields or provisional schedule heuristics. Prioritize manually using milestone, dependency, and scope impact.

## Anti-Patterns (Reject Suggestions That)

-   Insert polling loops instead of queue triggers.
-   Hardcode telemetry event names.
-   Duplicate scope/type labels or suggest legacy label prefixes.
-   Inline large lore/story blocks—reference docs instead.

## When Unsure

Prefer a minimal, well-typed stub + TODO with pointer to relevant doc rather than guessing domain logic.

---

Update this file when adding a new language, style shift, or enabling/disabling Copilot inline suggestions globally. Keep the compact and quickref guides free from per-language verbosity.

_Last reviewed: 2026-03-02_

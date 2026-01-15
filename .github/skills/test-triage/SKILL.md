---
name: test-triage
description: Debugs failing tests, flaky tests, and Node processes that won't exit after tests complete. Use when backend/shared/frontend tests fail or hang.
---

# Test triage

Use this skill when you are asked to:

- Fix a failing test (local or CI).
- Investigate a hanging test run (“tests pass but the process never exits”).
- Identify what’s keeping Node alive (timers, sockets, handles).

## Principles

1. Logs first: capture the failing command + error output before proposing changes.
2. Minimize the reproduction: run the smallest scope that reproduces the failure.
3. Fix the root cause (common culprits: long timers without `.unref()`, open sockets, background watchers).

## Canonical workflows

### Backend test runs

Use the wrapper script to run a targeted backend test scope:

- `scripts/run-backend-tests.mjs`

Default is **unit tests** (fast). Use `--scope integration` or `--scope all` when required.

### “Node won’t exit” / hanging tests

Preferred workflow:

1. Re-run the smallest test scope.
2. If the process hangs, run the hang-diagnose wrapper:
    - `scripts/diagnose-backend-hang.mjs`
3. If you confirm a long-lived timer is the culprit, apply the repo rule:
    - Any long `setTimeout` / `setInterval` must use `.unref()` unless explicitly required to keep the process alive.

---

Last reviewed: 2026-01-15

---
agent: agent
---

Goal: Deep dive a GitHub Epic issue and either (A) close it under a closure rule I choose for this epic, or (B) rescope it and create follow-on epics/issues to close remaining gaps.

Repo: piquet-h/the-shifting-atlas
Epic: #<EPIC_NUMBER>

Context:

- I want a requirements-based audit: subtask states, implementation reality, and doc correctness.
- Documentation must remain MECE-compliant and non-redundant.

Constraints:

- Epic issues are coordination shells: do not put implementation acceptance criteria inside epics.
- Avoid duplicate issues: search before creating; if a near-duplicate exists, propose updating/augmenting it instead of creating a new one.
- Documentation rules (MECE, non-redundant):
    - Design Modules / Concept: gameplay/system invariants and player-facing rules (no planning/checklists).
    - Architecture / ADR: technical contracts, tradeoffs, and decisions.
    - Roadmap + GitHub issues: sequencing and execution tracking.
- Prefer minimal changes. Doc edits should correct misleading/contradictory statements and add cross-links, not restate status/backlogs.
- If a requirement cannot be validated from the repo, explicitly say: Not found in workspace.

Success criteria:

- [ ] All child issues/subtasks are enumerated with state and mapped to concrete artifacts (files/symbols/tests/docs/PRs).
- [ ] Gaps are identified, severity-tagged (blocker vs non-blocker), and converted into a short dependency-aware plan (3-6 steps).
- [ ] If gaps exist, follow-on epic(s) and/or atomic issues are created in the correct milestones with dependency notes.
- [ ] If no gaps exist, the epic is closed with a concise closing comment.
- [ ] Doc updates proposed/applied are MECE-compliant and minimal (no redundant status tables).

Risk: choose the highest applicable tag from: LOW | DATA-MODEL | RUNTIME-BEHAVIOR | BUILD-SCRIPT | INFRA

Workflow:

0. Identify the Epic

- Ask which Epic issue is being referenced.
- If the user provided multiple candidates (or an ambiguous description), present the likely options and ask them to pick one Epic number.

After the Epic is identified, proceed with this workflow:

1. Gather epic facts

- Fetch Epic #<EPIC_NUMBER>: title/body, labels, milestone, checklists, linked issues/PRs, referenced docs.

2. Enumerate subtasks

- Identify all child issues/subtasks (checklists, links, mentions).
- Produce a table: Issue #, title, state, milestone, PR(s), and evidence pointers.

3. Validate implementation

- For each requirement/subtask: locate corresponding code/tests/scripts/infra.
- Cite exact file paths and symbol names; note missing coverage.

4. Validate documentation (MECE + non-redundant)

- Read docs referenced by the epic and any directly-related docs.
- Identify only misleading/contradictory statements.
- Propose minimal corrections (prefer 1-2 line fixes + links to issues/ADRs).

5. Decide: close vs rescope

- If complete under the chosen closure rule: draft closing comment + close epic.
- If not complete: rescope epic to match what is actually delivered, and create follow-on epic(s)/issues for remaining work.

6. Create decision placeholders as ADRs (only when needed)

- If a gap is a decision rather than an implementation task, create a Proposed ADR that includes:
    - Decision statement
    - Options + tradeoffs
    - Revisit triggers (explicit conditions that force reopening)
    - References (epic + key docs)

Required output format:

- Epic summary (intent + current state)
- Subtasks table (issue -> state -> mapped artifacts)
- Gaps (blocker/non-blocker)
- Doc corrections (minimal, MECE-safe)
- Closure recommendation (with rationale)
- If rescoping: new epic(s)/issues to create (titles, labels, milestone, dependencies)
- Ready-to-post closing comment text (or rescope comment text)

MANDATORY QUESTIONS (in order):

1. Ask me exactly ONE question before proceeding:

- Which Epic issue number should we audit/close? (Provide the Epic number, e.g. 497)

2. After Step 4 (Validate documentation), ask me exactly ONE question to decide close vs rescope:

Choose the closure rule for THIS epic:

-   1. Scaffolding landed - close when core components + tests exist; integration/productization deferred.
-   2. End-to-end usable - close only when player-visible wiring exists and an end-to-end proof/test exists.

---
title: Accessibility Guidelines
status: draft
version: 0.1.0
authors: ['@system', '@contributors']
updated: 2025-09-15
related:
  modules: ['navigation', 'player-identity', 'quest-dialogue', 'world-rules']
  components: ['App', 'Nav', 'Homepage', 'DemoForm']
---

# Accessibility Guidelines (Core Tenet)

Accessibility is a foundational, non‑negotiable pillar of The Shifting Atlas. All gameplay, UI, narrative delivery, and systems must be perceivable, operable, understandable, and robust (POUR). We target at least WCAG 2.2 AA from the earliest prototypes and design for progression toward AAA where feasible.

> Treat accessibility debt the same as security or data integrity debt: do not merge features that knowingly regress baseline a11y criteria.

## Principles

1. Text‑First Advantage: Leverage the inherently screen‑reader‑friendly nature of a text adventure; do not sabotage it with inaccessible custom widgets.
2. Keyboard is First‑Class: Every interactive action must be reachable and operable with a standard keyboard (no timing traps, no forced pointer gestures).
3. Progressive Enrichment: Core narrative and state updates delivered via semantic HTML first; visual or animated embellishments layered after with graceful degradation.
4. Respect Player Pace: Avoid auto‑advancing content without explicit opt‑in; provide pause/disable for motion or timed sequences.
5. Consistent Spatial & Structural Landmarks: Use `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>` appropriately so assistive tech can map the world.
6. Announce Dynamic World Changes: Queue driven world updates must be surfaced via ARIA live regions in a controlled and non‑spammy manner.
7. Player Configuration: Plan for per‑player preferences (font size scaling, reduced motion, high contrast, dyslexia‑friendly mode) persisted to profile.
8. Localizable & Inclusive Language: Narrative strings must be externalizable; avoid idioms that do not translate. Avoid gendered assumptions.
9. Color is Assistive, not Exclusive: Never rely solely on color to communicate state (use icons, text labels, shapes, patterns).
10. Test Early with Real Assistive Tech: NVDA + Firefox (baseline), VoiceOver + Safari (macOS/iOS), JAWS (periodic pass), keyboard‑only runs, and automated linting.

## WCAG 2.2 AA Mapping (High Impact Areas)

| Category       | Focus for Game               | Implementation Notes                                                                                                         |
| -------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Perceivable    | Text structure & landmarks   | Semantic headings (no skipping levels), ARIA only to enhance, never to replace HTML semantics.                               |
| Perceivable    | Color contrast               | Minimum 4.5:1 for text < 24px or < 700 weight; 3:1 for large/bold. Build tailwind theme tokens with enforced contrast tests. |
| Perceivable    | Motion / flashing            | Avoid flashes > 3/sec; provide `prefers-reduced-motion` CSS fallbacks.                                                       |
| Operable       | Keyboard navigation          | Visible focus ring (custom but WCAG compliant), skip link, logical tab order ensures world updates do not steal focus.       |
| Operable       | Pointer target size          | Minimum 44x44 CSS pixel interactive regions on touch.                                                                        |
| Operable       | Timing                       | No unpausable timed advancement; event feed is user‑paced.                                                                   |
| Understandable | Consistent terminology       | Reuse glossary of world nouns; no ambiguous verbs.                                                                           |
| Understandable | Error prevention & messaging | Forms (e.g., action input) must have inline, programmatically associated errors and ARIA `aria-invalid`/`aria-describedby`.  |
| Robust         | Assistive tech compatibility | Avoid role misapplication; test live region announcements for queue events.                                                  |

## Patterns & Components

### 1. Skip Link

Provide a visually hidden "Skip to main world content" link at top of DOM that becomes visible on focus.

### 2. Live Region / Event Announcer

A shared `LiveAnnouncer` component that:

- Offers two politeness channels (`polite`, `assertive`).
- Coalesces rapid queue events (debounce 500ms) to avoid screen reader flooding.
- Can be toggled per player (persist preference) and has a history log retrievable for reread.

### 3. Focus Management

- On route change: set focus to top `<h1>` of new screen.
- After major action submission: move focus to confirmation message or first validation error.
- Never auto‑focus without intent (avoid page load traps).

### 4. Interactive Elements

Use native elements first (`<button>`, `<a>`, `<input>`). Custom composites require ARIA role pattern compliance (refer to WAI‑ARIA Authoring Practices).

### 5. Forms & Commands

- Associate labels with every input via `<label>` + `htmlFor`.
- Provide contextual help via `aria-describedby`.
- Use progressive disclosure for advanced parameters (collapsible but keyboard accessible).

### 6. Theme / Tokens

Introduce design tokens for:

- Color pairs with guaranteed contrast.
- Motion durations referencing `--motion-scale` which reduces to 0 for reduced motion users.

### 7. Responsive & Zoom

Design assumes 200% browser zoom without horizontal scroll on primary flows. Test at 320px width min.

### 8. Internationalization Prep

All narrative strings to funnel through a message catalog (future). Avoid concatenating raw dynamic string pieces (use interpolation with full sentences).

### 9. Error & Status Messaging

- Use role="alert" for critical issues.
- Use `aria-live="polite"` for world narrative ticks.
- Provide textual state for loading spinners (`aria-busy` on container while fetching).

### 10. Testing Strategy (Initial)

- Lint: `eslint-plugin-jsx-a11y` (CI blocking for new violations).
- Unit tests for announcer coalescing.
- Cypress (future) keyboard traversal spec for core flows.
- Axe automated scan on each page in CI preview.

## Roadmap Enhancements

| Phase   | Enhancement                                               | Notes                                        |
| ------- | --------------------------------------------------------- | -------------------------------------------- |
| 0 (Now) | Guidelines doc + skip link + landmarks + a11y linting     | Establish baseline.                          |
| 1       | LiveAnnouncer + focus management utilities                | Support dynamic event feed.                  |
| 2       | Player accessibility preferences stored in profile        | Persisted settings per GUID.                 |
| 3       | High contrast & dyslexia font modes                       | Toggle with local storage fallback.          |
| 4       | Localization harness                                      | Extract strings & implement language switch. |
| 5       | Automated CI axe scans & screen reader regression scripts | Guard rails.                                 |

## Definition of Done Addendum (All Features)

A feature PR is incomplete unless:

- Keyboard-only path validated (no mouse).
- No new eslint-plugin-jsx-a11y errors introduced.
- Landmarks remain singular & meaningful (one `<main>` per page view layer).
- Focus order after interaction is predictable & verified.
- Color contrast of new UI checked (tool: `@axe-core/cli` or browser extension).
- Dynamic announcements (if any) verified via NVDA or VoiceOver notes in PR description.

## Open Questions

- Event Flood Control: May need priority channels (quest-critical vs ambient) for announcements.
- Localization Timing: When to introduce i18n layer without over‑engineering early protos.

---

Status: draft – iterate with implementation feedback.

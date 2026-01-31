# Frontend Component Architecture & Style Guide

---

**Status**: Living Document  
**Version**: 1.0.0  
**Last Updated**: 2025-12-08  
**Related**:

- [Accessibility Guidelines](../ux/accessibility-guidelines.md)
- [UX Documentation](../ux/README.md)
- [Frontend API Contract](../architecture/frontend-api-contract.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Component Tree](#component-tree)
3. [Architecture Patterns](#architecture-patterns)
4. [Style Guide](#style-guide)
5. [Accessibility Requirements](#accessibility-requirements)
6. [Component Examples](#component-examples)
7. [Third-Party Integrations](#third-party-integrations)
8. [Testing Conventions](#testing-conventions)

---

## Overview

The Shifting Atlas frontend is a React SPA built with Vite, TypeScript, and Tailwind CSS. It follows a **text-first**, **accessibility-first** design philosophy, where all interactive features must be keyboard-operable and screen-reader friendly from day one.

### Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS 3 with custom theme
- **State Management**: React Context + TanStack Query (React Query)
- **Routing**: React Router 6
- **Hosting**: Azure Static Web Apps
- **Authentication**: Azure AD (Entra ID) via SWA Easy Auth

### Core Principles

1. **Semantic HTML First**: Use native elements (`<button>`, `<a>`, `<input>`) before custom components
2. **Progressive Enhancement**: Core functionality works without JavaScript; enhancements layer on top
3. **Accessibility by Default**: WCAG 2.2 AA compliance is non-negotiable (see [Accessibility Guidelines](../ux/accessibility-guidelines.md))
4. **Mobile-First Responsive**: Design for 320px minimum width, scale up to widescreen (1920px+)
5. **Performance Budget**: Target <500ms p95 for all user actions; use optimistic updates where appropriate

---

## Component Tree

```
App.tsx (root)
├── Nav.tsx (global navigation header)
├── LiveAnnouncer.tsx (screen reader announcements)
└── Routes
    ├── Homepage.tsx (landing page)
    │   └── Logo.tsx (hero logo)
    ├── Game.tsx (authenticated game experience)
    │   └── GameView.tsx (main game interface)
    │       ├── LocationPanel (location name & description)
    │       │   └── DescriptionRenderer.tsx (markdown → sanitized HTML)
    │       ├── ExitsPanel (visual compass of available exits)
    │       ├── PlayerStatsPanel (health, location, inventory)
    │       ├── NavigationUI.tsx (clickable directional buttons + keyboard shortcuts)
    │       ├── CommandInterface.tsx (command orchestration)
    │       │   ├── CommandInput.tsx (input with autocomplete & history)
    │       │   └── CommandOutput.tsx (command results & errors)
    │       └── CommandHistoryPanel (recent actions log)
    ├── Profile.tsx (user profile management)
    ├── Settings.tsx (player preferences)
    ├── LearnMore.tsx (game mechanics documentation)
    ├── Help.tsx (help and support)
    ├── About.tsx (game information)
    └── NotFound.tsx (404 error page)

Utility Components
├── ResponsiveLayout.tsx (breakpoint-aware layout wrapper)
├── ProtectedRoute.tsx (auth guard for authenticated pages)
└── SoftDenialOverlay.tsx (exit generation request overlay)
```

### Component Responsibilities

| Component                 | Type         | Responsibility                                                           | State Scope   |
| ------------------------- | ------------ | ------------------------------------------------------------------------ | ------------- |
| `App.tsx`                 | Layout       | Root component, routing, global contexts (AuthContext, PlayerContext)    | Global        |
| `Nav.tsx`                 | Navigation   | Global navigation header, authentication status, user menu               | Read-only     |
| `LiveAnnouncer.tsx`       | Utility      | ARIA live regions for screen reader announcements                        | Internal      |
| `GameView.tsx`            | Container    | Game state orchestration, location display, command handling             | Local + Query |
| `CommandInput.tsx`        | Form         | Command entry with autocomplete, validation, and history navigation      | Internal      |
| `CommandInterface.tsx`    | Orchestrator | Command lifecycle (parse, execute, track), telemetry integration         | Local         |
| `NavigationUI.tsx`        | Interactive  | Directional navigation buttons with keyboard shortcuts (WASD, arrows)    | Props         |
| `StatusPanel.tsx`         | Display      | Persistent player status (health, location, inventory, session duration) | Props         |
| `DescriptionRenderer.tsx` | Utility      | Markdown rendering + HTML sanitization (XSS prevention)                  | Stateless     |

---

## Architecture Patterns

### 1. Container/Presentation Pattern

**Containers** (smart components):

- Handle data fetching, state management, side effects
- Use React Query hooks, context consumers
- Examples: `GameView.tsx`, `CommandInterface.tsx`

**Presentation** (dumb components):

- Receive data via props, render UI
- No side effects, minimal internal state
- Examples: `CommandInput.tsx`, `ExitsPanel`, `PlayerStatsPanel`

### 2. Context for Cross-Cutting Concerns

- **PlayerContext** (`contexts/PlayerContext.tsx`): Player GUID, current location, authentication state
- **AuthContext**: (Future) User authentication and authorization state

### 3. React Query for Server State

- Use `useQuery` for data fetching (locations, player data)
- Use `useMutation` for actions (move, commands)
- Automatic cache invalidation and refetching
- See `frontend/src/hooks/` and `frontend/src/pages/Game.tsx` for current usage.

### 4. Custom Hooks for Reusable Logic

- **`useMediaQuery`** (`hooks/useMediaQueries.ts`): Responsive breakpoint detection
- **`useSessionTimer`** (`hooks/useSessionTimer.ts`): Session duration tracking
- **`usePlayerLocation`** (`hooks/usePlayerLocation.ts`): Location data fetching with TanStack Query

See `frontend/src/hooks/` for the canonical hooks and their usage.

### 5. Telemetry Integration

All user actions emit telemetry events via the frontend telemetry service. Event names are centralized (do not inline literals).

---

## Style Guide

### Tailwind Configuration

Theme tokens live in `frontend/tailwind.config.ts`.

### Responsive Breakpoints

Breakpoints are defined in `frontend/tailwind.config.ts`.

### Class Naming Patterns

#### Responsive Text Sizes

Use responsive utility classes (see Tailwind config for canonical tokens).

Available sizes:

- `text-responsive-sm` → 12px/14px (mobile/desktop)
- `text-responsive-base` → 14px/16px
- `text-responsive-lg` → 16px/18px
- `text-responsive-xl` → 20px/24px

#### Color Usage

**Text colors**:

- Primary: `text-white` (body text)
- Secondary: `text-slate-300` (labels)
- Muted: `text-slate-400` (helper text)
- Accent: `text-atlas-accent` (links, highlights)
- Success: `text-emerald-400`
- Warning: `text-amber-400`
- Error: `text-red-400`

**Background colors**:

- Default: `bg-atlas-bg`
- Cards: `bg-slate-800/95` (with transparency)
- Overlays: `bg-slate-900/80`

#### Interactive States

All interactive elements must include visible focus styles and clear hover/active states.

**Required interactive classes**:

- `focus:outline-none` — Remove default outline
- `focus-visible:ring-2` — Visible focus ring (keyboard only)
- `focus-visible:ring-atlas-accent` — Accent color ring
- `focus-visible:ring-offset-2` — Offset for better visibility

### Touch Targets (Mobile)

All interactive elements must meet **minimum 44x44 CSS pixel** target size.

### Responsive Layout Patterns

See `frontend/src/pages/` for the current responsive layout implementations.

### Card Component Pattern

Use consistent card styling for hierarchy; avoid one-off styling without a clear reason.

---

## Accessibility Requirements

All components must satisfy **WCAG 2.2 Level AA** baseline. See [Accessibility Guidelines](../ux/accessibility-guidelines.md) for full requirements.

### Focus Management

#### Skip Links

Every page must include a skip link at the top of the DOM.

#### Focus Order

- Logical tab order (top to bottom, left to right)
- No focus traps (unless in modal dialogs)
- Focus moves to meaningful target after actions (e.g., to error message or success confirmation)

### ARIA Live Regions for Dynamic Content

Use `LiveAnnouncer.tsx` for screen reader announcements.

- **Polite**: Non-urgent updates (e.g., "Location loaded")
- **Assertive**: Urgent messages (e.g., "Low health warning")

### Keyboard Shortcuts

Document all keyboard shortcuts in `Help.tsx` and provide alternative mouse/touch actions.

**Navigation UI shortcuts** (`NavigationUI.tsx`):

- Arrow keys: Cardinal directions (↑ North, ↓ South, ← West, → East)
- WASD: Cardinal directions (W North, S South, A West, D East)
- QEZC: Intercardinal (Q Northwest, E Northeast, Z Southwest, C Southeast)
- U/N: Vertical (U Up, N Down)
- I/O: Radial (I In, O Out)

**Command Input shortcuts** (`CommandInput.tsx`):

- ↑/↓: Navigate command history
- Tab/Enter: Accept autocomplete suggestion
- Esc: Close autocomplete dropdown

### ARIA Attributes

For detailed ARIA patterns, use `docs/ux/accessibility-guidelines.md` as the canonical reference.

---

## Component Examples

Avoid duplicating large example snippets in documentation.

For canonical implementations, see:

- `frontend/src/pages/` (page composition and orchestration)
- `frontend/src/components/` (UI components)
- `frontend/src/hooks/` (data fetching, auth, reusable UI logic)

---

## Third-Party Integrations

### Markdown Rendering (marked)

**Library**: `marked` v11.x  
**Usage**: Convert backend-provided markdown to HTML  
**Configuration**: Default settings, no custom renderers

See `frontend/src/` for the canonical wrapper components and configuration.

### HTML Sanitization (DOMPurify)

**Library**: `isomorphic-dompurify` (works in SSR)  
**Usage**: Prevent XSS attacks from LLM-generated content  
**Configuration**: Strict allowlist of safe tags and attributes

See `frontend/src/` for the canonical wrapper components and configuration.

**Wrapper pattern**: Always wrap third-party libraries in utility components (`DescriptionRenderer.tsx`) to centralize configuration and security policies.

### TanStack Query (React Query)

**Library**: `@tanstack/react-query` v5.x  
**Usage**: Server state management, caching, mutations  
**Configuration**: `QueryClientProvider` in `App.tsx`

See `frontend/src/` for the canonical QueryClient setup.

### React Router

**Library**: `react-router-dom` v6.x  
**Usage**: Client-side routing  
**Protected routes**: Use `ProtectedRoute.tsx` wrapper for authenticated pages

See `frontend/src/` for the canonical route definitions.

---

## Testing Conventions

### Unit Tests

- **Location**: `frontend/test/unit/`
- **Framework**: Vitest + React Testing Library
- **Scope**: Component logic, hooks, utilities
- **Example**: Input validation, state transitions, event handlers

See `frontend/test/` for canonical test examples.

### Integration Tests

- **Location**: `frontend/test/integration/`
- **Framework**: Vitest + MSW (Mock Service Worker)
- **Scope**: Component interactions with API, context, and hooks
- **Example**: Navigation flow, command execution, error handling

### E2E Tests

- **Location**: `frontend/e2e/`
- **Framework**: Playwright
- **Scope**: Full user flows, cross-browser testing
- **Example**: Complete navigation journey, authentication flows

### Accessibility Tests

- **Tool**: `@axe-core/playwright` (automated WCAG checks)
- **Manual**: Screen reader testing (NVDA + Firefox, VoiceOver + Safari)
- **Checklist**: Keyboard-only navigation, focus order, ARIA attributes

See `frontend/e2e/` and `frontend/scripts/` for canonical a11y scans and Playwright usage.

---

## Best Practices Summary

### Do

✅ Use semantic HTML first (`<button>`, `<a>`, `<input>`)  
✅ Include focus-visible rings on all interactive elements  
✅ Test with keyboard-only navigation  
✅ Provide ARIA labels for screen readers  
✅ Use TanStack Query for server state  
✅ Emit telemetry for all user actions  
✅ Sanitize all LLM-generated content  
✅ Follow mobile-first responsive patterns  
✅ Document keyboard shortcuts in `Help.tsx`

### Don't

❌ Use `div` or `span` for clickable elements  
❌ Remove focus outlines without providing alternatives  
❌ Rely on color alone to convey state  
❌ Hard-code API URLs (use `utils/apiClient.ts`)  
❌ Skip ARIA attributes for dynamic content  
❌ Bypass DOMPurify sanitization  
❌ Use `any` type in TypeScript  
❌ Create touch targets smaller than 44x44px

---

## Related Resources

- [Accessibility Guidelines](../ux/accessibility-guidelines.md) — WCAG 2.2 AA compliance patterns
- [UX Documentation](../ux/README.md) — Wireframes, user flows, templates
- [Frontend API Contract](../architecture/frontend-api-contract.md) — Backend API schemas
- [Tailwind CSS Documentation](https://tailwindcss.com/docs) — Official Tailwind docs
- [React Testing Library](https://testing-library.com/react) — Testing best practices
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) — ARIA patterns guide

---

## Changelog

| Version | Date       | Changes                              | Author   |
| ------- | ---------- | ------------------------------------ | -------- |
| 1.0.0   | 2025-12-08 | Initial component architecture guide | @copilot |

---

**For questions or suggestions**, open an issue with label `docs` and `scope:devx`.

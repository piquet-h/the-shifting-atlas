# Frontend Component Architecture & Style Guide

---

**Status**: Living Document  
**Version**: 1.0.0  
**Last Updated**: 2025-12-08  
**Related**:

-   [Accessibility Guidelines](../ux/accessibility-guidelines.md)
-   [UX Documentation](../ux/README.md)
-   [Frontend API Contract](../architecture/frontend-api-contract.md)

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

-   **Framework**: React 18 with TypeScript
-   **Build Tool**: Vite 5
-   **Styling**: Tailwind CSS 3 with custom theme
-   **State Management**: React Context + TanStack Query (React Query)
-   **Routing**: React Router 6
-   **Hosting**: Azure Static Web Apps
-   **Authentication**: Azure AD (Entra ID) via SWA Easy Auth

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

| Component              | Type        | Responsibility                                                           | State Scope   |
| ---------------------- | ----------- | ------------------------------------------------------------------------ | ------------- |
| `App.tsx`              | Layout      | Root component, routing, global contexts (AuthContext, PlayerContext)   | Global        |
| `Nav.tsx`              | Navigation  | Global navigation header, authentication status, user menu              | Read-only     |
| `LiveAnnouncer.tsx`    | Utility     | ARIA live regions for screen reader announcements                        | Internal      |
| `GameView.tsx`         | Container   | Game state orchestration, location display, command handling             | Local + Query |
| `CommandInput.tsx`     | Form        | Command entry with autocomplete, validation, and history navigation      | Internal      |
| `CommandInterface.tsx` | Orchestrator | Command lifecycle (parse, execute, track), telemetry integration         | Local         |
| `NavigationUI.tsx`     | Interactive | Directional navigation buttons with keyboard shortcuts (WASD, arrows)    | Props         |
| `StatusPanel.tsx`      | Display     | Persistent player status (health, location, inventory, session duration) | Props         |
| `DescriptionRenderer.tsx` | Utility  | Markdown rendering + HTML sanitization (XSS prevention)                  | Stateless     |

---

## Architecture Patterns

### 1. Container/Presentation Pattern

**Containers** (smart components):

-   Handle data fetching, state management, side effects
-   Use React Query hooks, context consumers
-   Examples: `GameView.tsx`, `CommandInterface.tsx`

**Presentation** (dumb components):

-   Receive data via props, render UI
-   No side effects, minimal internal state
-   Examples: `CommandInput.tsx`, `ExitsPanel`, `PlayerStatsPanel`

### 2. Context for Cross-Cutting Concerns

-   **PlayerContext** (`contexts/PlayerContext.tsx`): Player GUID, current location, authentication state
-   **AuthContext**: (Future) User authentication and authorization state

### 3. React Query for Server State

-   Use `useQuery` for data fetching (locations, player data)
-   Use `useMutation` for actions (move, commands)
-   Automatic cache invalidation and refetching
-   Example: `usePlayerLocation` hook in `GameView.tsx`

```typescript
const { location, isLoading, error, refetch } = usePlayerLocation(currentLocationId)
```

### 4. Custom Hooks for Reusable Logic

-   **`useMediaQuery`** (`hooks/useMediaQueries.ts`): Responsive breakpoint detection
-   **`useSessionTimer`** (`hooks/useSessionTimer.ts`): Session duration tracking
-   **`usePlayerLocation`** (`hooks/usePlayerLocation.ts`): Location data fetching with TanStack Query

Example usage:

```typescript
const isMobile = useMediaQuery('(max-width: 639px)')
const isTablet = useMediaQuery('(min-width: 640px) and (max-width: 1023px)')
const isDesktop = useMediaQuery('(min-width: 1024px)')
```

### 5. Telemetry Integration

All user actions emit telemetry events via `trackGameEventClient` (from `services/telemetry.ts`). Events follow the `Domain.Subject.Action` naming convention.

```typescript
import { trackGameEventClient, getSessionId } from '../services/telemetry'

// Track UI interaction
trackGameEventClient('UI.Navigate.Button', {
    correlationId,
    direction,
    fromLocationId: location?.id || null
})
```

---

## Style Guide

### Tailwind Configuration

Custom theme tokens defined in `tailwind.config.ts`:

```typescript
colors: {
  atlas: {
    accent: '#6ee7b7',      // Emerald-300 for CTAs and highlights
    bg: '#0f1724',          // Dark blue-gray background
    bgDark: '#071226',      // Darker variant for depth
    card: '#0b1220',        // Card backgrounds
    muted: '#9aa4b2',       // Muted text
    glass: 'rgba(255,255,255,0.04)' // Glass morphism overlays
  }
}
```

### Responsive Breakpoints

```css
/* Mobile-first approach */
/* Default: <640px (mobile) */
sm: 640px   /* Small tablets */
md: 768px   /* Tablets */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large desktop */
3xl: 1920px /* Widescreen */
```

### Class Naming Patterns

#### Responsive Text Sizes

Use utility classes with responsive prefixes:

```html
<p class="text-responsive-sm sm:text-responsive-base lg:text-responsive-lg">
    <!-- Text scales with viewport -->
</p>
```

Available sizes:

-   `text-responsive-sm` → 12px/14px (mobile/desktop)
-   `text-responsive-base` → 14px/16px
-   `text-responsive-lg` → 16px/18px
-   `text-responsive-xl` → 20px/24px

#### Color Usage

**Text colors**:

-   Primary: `text-white` (body text)
-   Secondary: `text-slate-300` (labels)
-   Muted: `text-slate-400` (helper text)
-   Accent: `text-atlas-accent` (links, highlights)
-   Success: `text-emerald-400`
-   Warning: `text-amber-400`
-   Error: `text-red-400`

**Background colors**:

-   Default: `bg-atlas-bg`
-   Cards: `bg-slate-800/95` (with transparency)
-   Overlays: `bg-slate-900/80`

#### Interactive States

All interactive elements must include:

```html
<button
    class="focus:outline-none focus-visible:ring-2 focus-visible:ring-atlas-accent focus-visible:ring-offset-2 hover:bg-emerald-600 active:scale-95"
>
    <!-- Focus ring + hover + active states -->
</button>
```

**Required interactive classes**:

-   `focus:outline-none` — Remove default outline
-   `focus-visible:ring-2` — Visible focus ring (keyboard only)
-   `focus-visible:ring-atlas-accent` — Accent color ring
-   `focus-visible:ring-offset-2` — Offset for better visibility

### Touch Targets (Mobile)

All interactive elements must meet **minimum 44x44 CSS pixel** target size:

```html
<button class="touch-target px-4 py-2 min-h-[44px] min-w-[44px]">
    <!-- Meets WCAG 2.5.5 (AAA) touch target size -->
</button>
```

### Responsive Layout Patterns

#### Single Column (Mobile <640px)

```tsx
<div className="flex flex-col gap-4">
    <LocationPanel />
    <ExitsPanel />
    <PlayerStatsPanel collapsible={true} />
    <CommandInterface />
</div>
```

#### Two Column (Tablet 640px-1024px)

```tsx
<div className="grid grid-cols-12 gap-4">
    <div className="col-span-8">
        {/* Main content */}
    </div>
    <aside className="col-span-4">
        {/* Sidebar */}
    </aside>
</div>
```

#### Three Column (Desktop ≥1024px)

```tsx
<div className="grid grid-cols-12 gap-5">
    <div className="col-span-7">
        {/* Main content */}
    </div>
    <aside className="col-span-5">
        {/* Stats + History */}
    </aside>
</div>
```

### Card Component Pattern

Standard card styling for consistent visual hierarchy:

```tsx
<section className="card rounded-xl p-4 sm:p-5 bg-slate-800/95 ring-1 ring-white/10">
    {/* Card content */}
</section>
```

---

## Accessibility Requirements

All components must satisfy **WCAG 2.2 Level AA** baseline. See [Accessibility Guidelines](../ux/accessibility-guidelines.md) for full requirements.

### Focus Management

#### Skip Links

Every page must include a skip link at the top of the DOM:

```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4">
    Skip to main content
</a>
```

#### Focus Order

-   Logical tab order (top to bottom, left to right)
-   No focus traps (unless in modal dialogs)
-   Focus moves to meaningful target after actions (e.g., to error message or success confirmation)

### ARIA Live Regions for Dynamic Content

Use `LiveAnnouncer.tsx` component for screen reader announcements:

```tsx
<LiveAnnouncer />
```

-   **Polite**: Non-urgent updates (e.g., "Location loaded")
-   **Assertive**: Urgent messages (e.g., "Low health warning")

### Keyboard Shortcuts

Document all keyboard shortcuts in `Help.tsx` and provide alternative mouse/touch actions.

**Navigation UI shortcuts** (`NavigationUI.tsx`):

-   Arrow keys: Cardinal directions (↑ North, ↓ South, ← West, → East)
-   WASD: Cardinal directions (W North, S South, A West, D East)
-   QEZC: Intercardinal (Q Northwest, E Northeast, Z Southwest, C Southeast)
-   U/N: Vertical (U Up, N Down)
-   I/O: Radial (I In, O Out)

**Command Input shortcuts** (`CommandInput.tsx`):

-   ↑/↓: Navigate command history
-   Tab/Enter: Accept autocomplete suggestion
-   Esc: Close autocomplete dropdown

### ARIA Attributes

#### Forms

```tsx
<input
    type="text"
    aria-label="Command"
    aria-autocomplete="list"
    aria-controls="command-autocomplete"
    aria-expanded={showAutocomplete}
    aria-invalid={hasError ? 'true' : undefined}
    aria-describedby={hasError ? 'command-error' : undefined}
/>
<p id="command-error" role="alert">
    {errorMessage}
</p>
```

#### Progress Indicators

```tsx
<div
    role="progressbar"
    aria-valuenow={health}
    aria-valuemin={0}
    aria-valuemax={maxHealth}
    aria-label="Player health"
>
    <div className="progress-bar" style={{ width: `${healthPercent}%` }} />
</div>
```

#### Semantic Landmarks

```tsx
<header role="banner">
    <Nav />
</header>
<main id="main-content" role="main" aria-labelledby="page-title">
    <h1 id="page-title">Game</h1>
    {/* Page content */}
</main>
<aside role="complementary" aria-labelledby="stats-title">
    <h2 id="stats-title">Player Status</h2>
    {/* Stats panel */}
</aside>
```

---

## Component Examples

### GameView.tsx (Container Component)

Main game interface orchestrating location display, navigation, and command execution.

**Key features**:

-   Responsive layout (mobile/tablet/desktop)
-   TanStack Query for location data
-   Optimistic navigation updates
-   Soft-denial overlay for exit generation

**Example structure**:

```tsx
export default function GameView({ className }: GameViewProps): React.ReactElement {
    const isDesktop = useMediaQuery('(min-width: 1024px)')
    const { playerGuid, currentLocationId } = usePlayer()
    const { location, isLoading, error, refetch } = usePlayerLocation(currentLocationId)

    const navigateMutation = useMutation({
        mutationFn: async ({ direction }) => {
            // POST to /api/player/{playerId}/move
            // Returns new LocationResponse
        },
        onSuccess: (newLocation) => {
            updateCurrentLocationId(newLocation.id)
            queryClient.invalidateQueries({ queryKey: ['location'] })
        }
    })

    return (
        <div className="flex flex-col gap-4">
            {isDesktop ? (
                /* Three-column layout */
            ) : (
                /* Single/two-column layout */
            )}
        </div>
    )
}
```

### CommandInput.tsx (Form Component)

Accessible command input with autocomplete and validation.

**Key features**:

-   Autocomplete for directions and commands
-   Command history navigation (↑/↓)
-   Inline validation with suggestions
-   ARIA attributes for screen readers

**Example usage**:

```tsx
<CommandInput
    placeholder="Enter a command (e.g., ping)"
    onSubmit={async (cmd) => {
        await executeCommand(cmd)
    }}
    availableExits={['north', 'south', 'east']}
    commandHistory={previousCommands}
    disabled={busy}
    busy={isExecuting}
/>
```

**Validation pattern**:

```tsx
function validateCommand(cmd: string): { valid: boolean; suggestion?: string; error?: string } {
    const trimmed = cmd.trim().toLowerCase()
    const parts = trimmed.split(/\s+/)
    const command = parts[0]

    if (command === 'move') {
        const direction = parts[1]
        if (!DIRECTIONS.includes(direction)) {
            return {
                valid: false,
                error: `"${direction}" is not a valid direction`,
                suggestion: `Did you mean "move ${findClosestMatch(direction, DIRECTIONS)}"?`
            }
        }
    }

    return { valid: true }
}
```

### StatusPanel.tsx (Display Component)

Persistent player status display with collapsible mobile layout.

**Key features**:

-   Health bar with color-coded warnings
-   Session duration timer
-   Collapsible on mobile (<640px)
-   Low health animation

**Example usage**:

```tsx
<StatusPanel
    health={75}
    maxHealth={100}
    locationName="The Ancient Library"
    inventoryCount={5}
    className="fixed top-4 right-4"
/>
```

**Low health indicator**:

```tsx
{
    isLowHealth && !isDefeated && (
        <p className="text-xs text-red-400 animate-pulse" role="status">
            ⚠️ Low health!
        </p>
    )
}
```

### NavigationUI.tsx (Interactive Component)

Directional navigation with keyboard shortcuts.

**Key features**:

-   Visual compass layout (cardinal + intercardinal directions)
-   Keyboard shortcuts (arrows, WASD, QEZC)
-   Touch-friendly 44x44px minimum targets
-   Available/blocked exit visual feedback

**Example usage**:

```tsx
<NavigationUI
    availableExits={[
        { direction: 'north', description: 'A narrow passage' },
        { direction: 'east', description: 'Sunlight streams through' }
    ]}
    onNavigate={(direction) => handleMove(direction)}
    disabled={isMoving}
/>
```

**Keyboard handler pattern**:

```tsx
useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
        if (disabled) return

        const direction = KEY_DIRECTION_MAP[e.key]
        if (direction && isExitAvailable(direction)) {
            e.preventDefault()
            onNavigate(direction)
        }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
}, [disabled, onNavigate])
```

### DescriptionRenderer.tsx (Utility Component)

Markdown rendering with XSS sanitization.

**Security pattern**:

```tsx
import DOMPurify from 'isomorphic-dompurify'
import { marked } from 'marked'

function processContent(content: string, format: 'markdown' | 'html'): string {
    // Convert markdown to HTML
    let html = format === 'markdown' ? marked.parse(content) : content

    // Sanitize with strict allowlist
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'code', 'a'],
        ALLOWED_ATTR: ['href', 'title'],
        ALLOW_DATA_ATTR: false
    })
}
```

**Usage**:

```tsx
<DescriptionRenderer
    content={location.description.text}
    format="markdown"
    className="prose prose-invert"
    onXSSDetected={(original, sanitized) => {
        console.error('XSS attempt blocked:', { original, sanitized })
    }}
/>
```

---

## Third-Party Integrations

### Markdown Rendering (marked)

**Library**: `marked` v11.x  
**Usage**: Convert backend-provided markdown to HTML  
**Configuration**: Default settings, no custom renderers

```typescript
import { marked } from 'marked'
const html = marked.parse(markdownText) as string
```

### HTML Sanitization (DOMPurify)

**Library**: `isomorphic-dompurify` (works in SSR)  
**Usage**: Prevent XSS attacks from LLM-generated content  
**Configuration**: Strict allowlist of safe tags and attributes

```typescript
import DOMPurify from 'isomorphic-dompurify'

const clean = DOMPurify.sanitize(dirtyHTML, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false
})
```

**Wrapper pattern**: Always wrap third-party libraries in utility components (`DescriptionRenderer.tsx`) to centralize configuration and security policies.

### TanStack Query (React Query)

**Library**: `@tanstack/react-query` v5.x  
**Usage**: Server state management, caching, mutations  
**Configuration**: `QueryClientProvider` in `App.tsx`

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            retry: 1
        }
    }
})
```

### React Router

**Library**: `react-router-dom` v6.x  
**Usage**: Client-side routing  
**Protected routes**: Use `ProtectedRoute.tsx` wrapper for authenticated pages

```tsx
<Route path="/game" element={<ProtectedRoute><Game /></ProtectedRoute>} />
```

---

## Testing Conventions

### Unit Tests

-   **Location**: `frontend/test/unit/`
-   **Framework**: Vitest + React Testing Library
-   **Scope**: Component logic, hooks, utilities
-   **Example**: Input validation, state transitions, event handlers

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommandInput from '../CommandInput'

test('validates invalid direction and shows suggestion', async () => {
    const onSubmit = vi.fn()
    render(<CommandInput onSubmit={onSubmit} availableExits={['north']} />)

    const input = screen.getByLabelText(/command/i)
    await userEvent.type(input, 'move nrth')
    await userEvent.click(screen.getByText(/run/i))

    expect(screen.getByText(/did you mean "move north"/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
})
```

### Integration Tests

-   **Location**: `frontend/test/integration/`
-   **Framework**: Vitest + MSW (Mock Service Worker)
-   **Scope**: Component interactions with API, context, and hooks
-   **Example**: Navigation flow, command execution, error handling

### E2E Tests

-   **Location**: `frontend/e2e/`
-   **Framework**: Playwright
-   **Scope**: Full user flows, cross-browser testing
-   **Example**: Complete navigation journey, authentication flows

### Accessibility Tests

-   **Tool**: `@axe-core/playwright` (automated WCAG checks)
-   **Manual**: Screen reader testing (NVDA + Firefox, VoiceOver + Safari)
-   **Checklist**: Keyboard-only navigation, focus order, ARIA attributes

```typescript
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('game view has no accessibility violations', async ({ page }) => {
    await page.goto('/game')
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze()
    expect(accessibilityScanResults.violations).toEqual([])
})
```

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

-   [Accessibility Guidelines](../ux/accessibility-guidelines.md) — WCAG 2.2 AA compliance patterns
-   [UX Documentation](../ux/README.md) — Wireframes, user flows, templates
-   [Frontend API Contract](../architecture/frontend-api-contract.md) — Backend API schemas
-   [Tailwind CSS Documentation](https://tailwindcss.com/docs) — Official Tailwind docs
-   [React Testing Library](https://testing-library.com/react) — Testing best practices
-   [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) — ARIA patterns guide

---

## Changelog

| Version | Date       | Changes                              | Author      |
| ------- | ---------- | ------------------------------------ | ----------- |
| 1.0.0   | 2025-12-08 | Initial component architecture guide | @copilot    |

---

**For questions or suggestions**, open an issue with label `docs` and `scope:devx`.

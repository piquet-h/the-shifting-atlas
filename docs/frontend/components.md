# Frontend Component Architecture & Style Guide

**Purpose:** This document provides comprehensive guidance for frontend contributors on component architecture, folder structure, styling conventions, and accessibility patterns used in The Shifting Atlas.

**Target Audience:** Frontend developers contributing to the player experience (Epic #389).

**Related Resources:**
- [Accessibility Guidelines](../ux/accessibility-guidelines.md) - Core accessibility tenets (WCAG 2.2 AA baseline)
- [Frontend README](../../frontend/README.md) - Complete frontend architecture documentation
- [Azure Auth Notes](../ux/azure-auth-notes.md) - Authentication integration details

---

## Table of Contents

1. [Component Tree & Responsibilities](#component-tree--responsibilities)
2. [Style Guide](#style-guide)
3. [Accessibility Patterns](#accessibility-patterns)
4. [Component Examples](#component-examples)
5. [Third-Party Components](#third-party-components)
6. [Testing Components](#testing-components)

---

## Component Tree & Responsibilities

### High-Level Architecture

```
App (Root)
├── Skip Link (accessibility)
├── Nav (global navigation)
│   ├── Logo
│   └── Auth Controls (sign in/out)
├── Router
│   ├── Homepage (landing page)
│   │   ├── Hero Section
│   │   └── Auth-aware Welcome
│   └── Game (protected route)
│       └── GameView (main game interface)
│           ├── LocationPanel
│           ├── ExitsPanel
│           ├── NavigationUI
│           ├── PlayerStatsPanel (StatusPanel)
│           ├── CommandInterface
│           │   ├── CommandInput
│           │   └── CommandOutput
│           └── CommandHistoryPanel
└── LiveAnnouncer (ARIA live region)
```

### Component Responsibilities

#### Core Layout Components

**`<App />`** (`src/App.tsx`)
- **Purpose:** Root application component with global router, skip link, and main landmark
- **Responsibilities:**
  - Provides single global `<main id="main">` landmark (pages must NOT add their own)
  - Skip navigation link for keyboard users
  - `RouteFocusManager` for screen reader navigation announcements
  - Global `<LiveAnnouncer>` for dynamic content updates
- **Key Feature:** Ensures consistent landmark structure across all pages

**`<Nav />`** (`src/components/Nav.tsx`)
- **Purpose:** Primary navigation bar with authentication controls
- **Responsibilities:**
  - Sticky header with backdrop blur on desktop
  - Sign in/out controls with loading states
  - Auth status indicator
  - Mobile-responsive menu
- **State:** Uses `useAuth()` hook for authentication state

**`<ResponsiveLayout />`** (`src/components/ResponsiveLayout.tsx`)
- **Purpose:** Wrapper providing responsive container constraints
- **Responsibilities:**
  - Centered layout with max-width constraints
  - Background effects and padding
  - Mobile-first responsive behavior

#### Page Components

**`<Homepage />`** (`src/components/Homepage.tsx`)
- **Purpose:** Landing page with marketing content and sign-in CTA
- **Responsibilities:**
  - New vs. returning user differentiation
  - Auth-aware hero section
  - Guest GUID bootstrap integration
  - Welcome toast notifications
- **State Dependencies:**
  - `useAuth()` - Authentication state
  - `usePlayerGuid()` - Player session state
  - `useVisitState()` - First-visit detection
  - `useLinkGuestOnAuth()` - Guest account linking

**`<Game />`** (`src/pages/Game.tsx`)
- **Purpose:** Protected game page wrapper requiring authentication
- **Responsibilities:**
  - Auto-redirects unauthenticated users to homepage
  - Loading state during auth check
  - Wraps `<GameView>` component
- **Protection:** Uses `ProtectedRoute` pattern

#### Game Components

**`<GameView />`** (`src/components/GameView.tsx`)
- **Purpose:** Main game interface orchestrating location, exits, stats, and commands
- **Responsibilities:**
  - Responsive layout management (single column mobile, multi-column desktop)
  - Location display with description truncation
  - Exit compass visualization
  - Player stats sidebar
  - Command history panel
  - Integrated command interface
- **Layout Breakpoints:**
  - Mobile (<640px): Single column, collapsible stats
  - Tablet (640px-1024px): Two-column layout with navigation sidebar
  - Desktop (≥1024px): Three-column layout with dedicated history panel
- **Sub-components:**
  - `LocationPanel` - Current location name and description
  - `ExitsPanel` - Visual compass showing available exits
  - `PlayerStatsPanel` - Health, location, inventory stats
  - `CommandHistoryPanel` - Recent command log

**`<CommandInterface />`** (`src/components/CommandInterface.tsx`)
- **Purpose:** Command input/output lifecycle with built-in command parsing
- **Responsibilities:**
  - Command history navigation (up/down arrows)
  - Auto-focus on component mount
  - Correlation ID tracking per command
  - Error handling with user-friendly messages
  - Session storage for current location
- **Built-in Commands:**
  - `ping [message]` - Backend health check
  - `move <direction>` - Player movement
  - `look [locationId]` - Location inspection
  - `clear` - Clear command history

**`<CommandInput />`** (`src/components/CommandInput.tsx`)
- **Purpose:** Accessible command input with autocomplete and validation
- **Responsibilities:**
  - Autocomplete suggestions for directions and commands
  - History navigation (arrow up/down)
  - Input validation with fuzzy matching
  - "Did you mean" suggestions for typos
  - ARIA combobox pattern implementation
- **Accessibility:** Full keyboard navigation, proper ARIA semantics
- **Key Features:**
  - Tab/Enter to accept suggestions
  - Escape to close autocomplete
  - Visual indicators for available exits

**`<CommandOutput />`** (`src/components/CommandOutput.tsx`)
- **Purpose:** Display command execution history with responses
- **Responsibilities:**
  - Auto-scroll to latest output
  - Timestamp display
  - Error vs. success styling
  - Truncation for long output
- **Accessibility:** Live region for screen reader announcements

**`<NavigationUI />`** (`src/components/NavigationUI.tsx`)
- **Purpose:** Directional navigation via clickable buttons and keyboard shortcuts
- **Responsibilities:**
  - Clickable exit buttons for available directions
  - Keyboard shortcuts: arrow keys + WASD for cardinal directions
  - Visual indication of blocked directions
  - Mobile-friendly touch targets (≥44px)
  - Screen reader accessible with ARIA labels
- **Layout:** 3x3 grid for cardinal/intercardinal + horizontal row for vertical/radial
- **Keyboard Mappings:**
  - Arrow keys / WASD: Cardinal directions
  - Q/E/Z/C: Intercardinal directions (NW/NE/SW/SE)
  - U/N: Up/Down
  - I/O: In/Out

**`<StatusPanel />` (PlayerStatsPanel)** (`src/components/StatusPanel.tsx`)
- **Purpose:** Persistent status panel displaying player vital information
- **Responsibilities:**
  - Player health bar with visual indicators
  - Current location name (truncated)
  - Inventory item count (99+ cap)
  - Session duration timer
  - Collapsible on mobile to save space
- **Visual Indicators:**
  - Low health (<25%): Red color with pulse animation
  - Defeated state (health = 0): Gray with banner
  - Health bar color coding: green (>60%), amber (30-60%), red (<30%)
- **Edge Cases:**
  - Long location names: Truncated with ellipsis after 30 chars
  - Large inventory: Shows "99+" for counts >99

#### Utility Components

**`<LiveAnnouncer />`** (`src/components/LiveAnnouncer.tsx`)
- **Purpose:** Screen reader announcements for dynamic content (ARIA live region)
- **Responsibilities:**
  - Provides polite and assertive announcement channels
  - Coalesces rapid updates to avoid flooding screen readers
  - Maintains announcement history for user review
- **Usage:** Rendered globally in App.tsx, triggered via event system

**`<Logo />`** (`src/components/Logo.tsx`)
- **Purpose:** Branded logo component with consistent styling
- **Variants:**
  - `default` - Full logo with branding
  - `compact` - Minimal version for tight spaces

**`<SoftDenialOverlay />`** (`src/components/SoftDenialOverlay.tsx`)
- **Purpose:** Overlay shown when exit generation is requested
- **Responsibilities:**
  - Display narrative feedback for unavailable exits
  - Context-aware messaging based on location type
  - Action buttons: Retry, Explore (dismiss), Learn More
  - Correlation ID tracking for debugging

**`<DescriptionRenderer />`** (`src/components/DescriptionRenderer.tsx`)
- **Purpose:** Render location descriptions with format support
- **Formats:** Plain text, Markdown (future: rich media)
- **Features:** Sanitization, link handling, responsive text

---

## Style Guide

### Design Tokens (Tailwind Config)

The project uses custom design tokens defined in `tailwind.config.ts` for consistent theming:

```typescript
colors: {
  atlas: {
    accent: '#6ee7b7',        // Emerald-300 - primary interactive color
    bg: '#0f1724',            // Dark blue-gray - main background
    bgDark: '#071226',        // Darker blue-gray - gradient endpoint
    card: '#0b1220',          // Card background
    muted: '#9aa4b2',         // Muted text
    glass: 'rgba(255,255,255,0.04)' // Glass morphism effect
  }
}
```

### Class Naming Conventions

#### Component Classes (Tailwind Utilities)

**✅ Preferred Pattern: Utility-First**
```tsx
// Combine Tailwind utilities directly in className
<button className="px-4 py-2 rounded-lg bg-atlas-accent text-emerald-900 font-semibold hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
  Submit
</button>
```

**✅ Custom Component Classes (when utilities are insufficient)**
```css
/* src/tailwind.css - @layer components */
.card {
  @apply p-4 rounded-lg bg-white/5 ring-1 ring-white/10;
}
```

**❌ Anti-Pattern: Inline Styles**
```tsx
// AVOID unless truly dynamic (e.g., percentage widths)
<div style={{ padding: '16px', backgroundColor: '#0f1724' }}>
```

#### Reusable Component Classes

Use these predefined classes from `src/tailwind.css`:

| Class | Purpose | Example Usage |
|-------|---------|---------------|
| `.page-container` | Full-page background with gradient | Wrap entire page content |
| `.card` | Content card with glass morphism | Sections, panels, modals |
| `.code-inline` | Inline code snippets | Command references |
| `.btn-primary` | Primary call-to-action button | Sign in, submit actions |
| `.touch-target` | Minimum 44px touch target | Mobile buttons, links |
| `.text-responsive-*` | Fluid typography (sm/base/lg/xl/2xl) | Responsive text sizing |
| `.heading-clamp` | Clamped heading sizes | Large hero headings |
| `.max-w-readable` | Constrain text width to 75ch | Long-form content |

### Responsive Design Patterns

**Mobile-First Approach**

Always start with mobile base styles, then add breakpoints:

```tsx
// Base = mobile (default)
// sm = 640px+
// md = 768px+
// lg = 1024px+
// xl = 1280px+
// 2xl = 1536px+
// 3xl = 1920px+ (custom breakpoint)

<div className="
  text-sm          {/* mobile base */}
  md:text-base     {/* tablet+ */}
  lg:text-lg       {/* desktop+ */}
  grid grid-cols-1 {/* mobile: single column */}
  md:grid-cols-2   {/* tablet: two columns */}
  lg:grid-cols-3   {/* desktop: three columns */}
">
```

**Responsive Layout Example: GameView**

```tsx
// Mobile (<640px): Single column stacked layout
{!isTablet && (
  <>
    <LocationPanel />
    <ExitsPanel />
    <PlayerStatsPanel collapsible={true} />
    <CommandInterface />
  </>
)}

// Tablet (640-1024px): Two-column layout
{isTablet && !isDesktop && (
  <div className="grid grid-cols-12 gap-4">
    <div className="col-span-8">{/* Main content */}</div>
    <aside className="col-span-4">{/* Sidebar */}</aside>
  </div>
)}

// Desktop (≥1024px): Three-column layout
{isDesktop && (
  <div className="grid grid-cols-12 gap-5">
    <div className="col-span-7">{/* Main content */}</div>
    <aside className="col-span-5">{/* Stats + History */}</aside>
  </div>
)}
```

**Media Query Hooks**

Use custom hooks from `src/hooks/useMediaQueries.ts`:

```typescript
import { useMediaQuery, usePointerFine, usePrefersReducedMotion } from '../hooks/useMediaQueries'

function MyComponent() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const hasFineMouse = usePointerFine() // true if mouse vs touch
  const reducedMotion = usePrefersReducedMotion()
  
  return (
    <>
      {isDesktop && <DesktopOnlyFeature />}
      {hasFineMouse && <TooltipOnHover />}
      {!reducedMotion && <AnimatedTransition />}
    </>
  )
}
```

### Tailwind Usage Patterns

#### Colors

**Interactive Elements**
```tsx
// Primary actions - emerald accent
<button className="bg-atlas-accent text-emerald-900 hover:bg-emerald-400">

// Available/success states - emerald/green
<div className="bg-emerald-700/60 ring-1 ring-emerald-500/50 text-emerald-100">

// Unavailable/disabled states - slate gray
<div className="bg-slate-800/30 ring-1 ring-slate-700/30 text-slate-500">

// Error states - red
<div className="bg-red-900/20 ring-1 ring-red-500/30 text-red-400">

// Warning states - amber
<div className="text-amber-400">
```

**Text Colors**
```tsx
// Primary text
className="text-white"           // Headings, emphasis
className="text-slate-100"       // Body text
className="text-slate-200"       // Secondary text
className="text-slate-300/400"   // Tertiary text, labels
className="text-slate-500"       // Disabled/muted text
```

**Backgrounds**
```tsx
// Page backgrounds
className="bg-atlas-bg"                                    // Base
className="bg-gradient-to-b from-atlas-bg to-atlas-bgDark" // Gradient

// Card/section backgrounds
className="bg-white/5"           // Subtle glass effect
className="bg-slate-800/95"      // Translucent card
className="backdrop-blur-sm"     // Blur effect (sticky nav)
```

#### Spacing

**Consistent Spacing Scale**
```tsx
// Gap between elements
className="gap-2"     // 0.5rem (8px)  - tight
className="gap-3"     // 0.75rem (12px) - default
className="gap-4"     // 1rem (16px)    - comfortable
className="gap-5"     // 1.25rem (20px) - spacious

// Padding
className="p-4 sm:p-5"  // Responsive padding (16px → 20px)

// Margins
className="mb-3"        // Bottom margin (12px)
className="mt-4"        // Top margin (16px)
```

#### Borders & Rings

```tsx
// Subtle borders
className="border border-white/15"

// Ring focus indicators
className="ring-1 ring-white/10"                           // Subtle outline
className="ring-1 ring-emerald-500/50"                     // Colored ring
className="focus-visible:ring-2 focus-visible:ring-atlas-accent" // Focus ring
className="focus-visible:ring-offset-2 focus-visible:ring-offset-atlas-bg" // Ring offset

// Rounded corners
className="rounded-lg"   // 0.5rem (8px) - default
className="rounded-xl"   // 0.75rem (12px) - cards
className="rounded-full" // Pills, progress bars
```

#### Typography

**Responsive Text Sizes** (fluid with clamp)
```tsx
className="text-responsive-sm"   // 0.75-0.875rem (12-14px)
className="text-responsive-base" // 0.875-1rem (14-16px)
className="text-responsive-lg"   // 1-1.125rem (16-18px)
className="text-responsive-xl"   // 1.125-1.25rem (18-20px)
className="text-responsive-2xl"  // 1.25-1.5rem (20-24px)
```

**Font Weights**
```tsx
className="font-normal"    // 400 - body text
className="font-medium"    // 500 - emphasis
className="font-semibold"  // 600 - headings
className="font-bold"      // 700 - strong emphasis
```

**Special Typography**
```tsx
className="font-mono"      // Monospace font (command input, code)
className="antialiased"    // Font smoothing (applied globally)
className="truncate"       // Single line with ellipsis
className="line-clamp-1"   // Multiline with ellipsis after 1 line
className="whitespace-pre-wrap" // Preserve whitespace (descriptions)
```

#### Interactive States

**Standard Button Pattern**
```tsx
<button className="
  px-4 py-2                      {/* Padding */}
  rounded-lg                     {/* Border radius */}
  bg-atlas-accent                {/* Background */}
  text-emerald-900               {/* Text color */}
  font-semibold                  {/* Font weight */}
  hover:bg-emerald-400           {/* Hover state */}
  active:scale-95                {/* Pressed state */}
  disabled:opacity-50            {/* Disabled state */}
  transition-colors              {/* Smooth transition */}
  focus:outline-none             {/* Remove default outline */}
  focus-visible:ring-2           {/* Keyboard focus ring */}
  focus-visible:ring-offset-2
  focus-visible:ring-white
  focus-visible:ring-offset-atlas-bg
">
  Button Text
</button>
```

**Link Pattern**
```tsx
<a className="
  text-atlas-accent
  hover:underline
  focus:outline-none
  focus-visible:ring-2
  focus-visible:ring-atlas-accent
">
  Link Text
</a>
```

#### Layout Utilities

**Flexbox**
```tsx
// Common flex patterns
className="flex items-center justify-between"  // Space between
className="flex flex-col gap-4"                // Vertical stack
className="flex flex-wrap gap-2"               // Wrap with gap
```

**Grid**
```tsx
// Responsive grid
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"

// 12-column layout (GameView)
className="grid grid-cols-12 gap-5"
className="col-span-7"  // Main content (7/12)
className="col-span-5"  // Sidebar (5/12)
```

**Positioning**
```tsx
// Fixed positioning (StatusPanel)
className="fixed top-4 right-4 z-50"

// Sticky navigation
className="sticky top-0 z-40"
```

### Dynamic Styles

**When to Use Inline Styles**

Only use inline styles for truly dynamic values that can't be expressed with Tailwind utilities:

```tsx
// ✅ Good - dynamic percentage
<div 
  className="h-2 bg-emerald-500 transition-all duration-300"
  style={{ width: `${healthPercent}%` }}
/>

// ✅ Good - dynamic color from API
<div style={{ backgroundColor: layer.color }}>

// ❌ Bad - static values that should be utilities
<div style={{ padding: '16px', borderRadius: '8px' }}>
  {/* Use className="p-4 rounded-lg" instead */}
</div>
```

**Conditional Classes**

Use array `.join()` pattern for conditional classes:

```tsx
// Clean conditional styling
<button className={[
  'px-4 py-2 rounded-lg transition-colors',
  isActive 
    ? 'bg-atlas-accent text-emerald-900'
    : 'bg-slate-800 text-slate-300',
  disabled && 'opacity-50 cursor-not-allowed'
].join(' ')}>
  Button
</button>

// With filter for falsy values
<div className={[
  'card',
  isHighlighted && 'ring-2 ring-atlas-accent',
  className // Allow parent to pass additional classes
].filter(Boolean).join(' ')}>
```

---

## Accessibility Patterns

**Reference:** See [Accessibility Guidelines](../ux/accessibility-guidelines.md) for comprehensive WCAG 2.2 AA requirements.

### Core Accessibility Principles

1. **Semantic HTML First:** Use native elements (`<button>`, `<input>`, `<nav>`) before adding ARIA
2. **Keyboard Navigation:** All interactive elements must be keyboard accessible
3. **Focus Management:** Visible focus indicators and logical focus flow
4. **Screen Reader Support:** Proper ARIA labels and live regions
5. **Color Independence:** Never rely solely on color to convey information

### Focus Handling

**Focus Indicators**

All interactive elements must have visible focus indicators:

```tsx
// Standard focus ring pattern
className="
  focus:outline-none                      {/* Remove browser default */}
  focus-visible:ring-2                    {/* 2px ring on keyboard focus */}
  focus-visible:ring-atlas-accent         {/* Accent color ring */}
  focus-visible:ring-offset-2             {/* 2px offset */}
  focus-visible:ring-offset-atlas-bg      {/* Offset matches background */}
"

// Alternative: Use .focus-outline-enhanced utility class
className="focus-outline-enhanced"
```

**Focus Management on Route Changes**

The `RouteFocusManager` automatically moves focus to the first `<h1>` or `<main>` after route changes:

```tsx
// Automatically handled by App.tsx
// No action needed in page components
// Ensure each page has an <h1> for focus target
```

**Skip Link**

Provided globally in App.tsx for keyboard users:

```tsx
// Automatically rendered - visible only on keyboard focus
<a href="#main" className="skip-link sr-only focus:not-sr-only">
  Skip to main content
</a>
```

### ARIA Live Regions

**LiveAnnouncer Component**

Use for dynamic content that screen readers should announce:

```tsx
// Rendered globally in App.tsx
<LiveAnnouncer />

// Trigger announcements from components using aria-live regions
<div role="status" aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>

// For urgent announcements
<div role="alert" aria-live="assertive">
  {criticalError}
</div>
```

**When to Use Live Regions:**

- ✅ Command execution results (success/error)
- ✅ Loading state changes
- ✅ World event notifications
- ✅ Navigation completion messages
- ❌ Static content (use semantic HTML)
- ❌ Content that updates more than once per second (debounce)

### ARIA Patterns

**Combobox (CommandInput)**

```tsx
<input
  type="text"
  role="combobox"
  aria-autocomplete="list"
  aria-controls="command-autocomplete"
  aria-expanded={showAutocomplete}
  aria-invalid={hasError}
  aria-describedby="command-help"
/>
<div
  id="command-autocomplete"
  role="listbox"
>
  <div role="option" aria-selected={isSelected}>Option</div>
</div>
```

**Progress Bar (Health Display)**

```tsx
<div
  role="progressbar"
  aria-valuenow={health}
  aria-valuemin={0}
  aria-valuemax={maxHealth}
  aria-label="Player health"
>
  {/* Visual progress bar */}
</div>
```

**Button vs Link**

```tsx
// ✅ Use <button> for actions
<button onClick={handleSubmit}>Submit Command</button>

// ✅ Use <a> for navigation
<a href="/game">Enter Game</a>

// ❌ Don't use div with role="button"
<div role="button" onClick={handleClick}>Bad</div>
```

### Keyboard Shortcuts

**NavigationUI Keyboard Mappings**

Document keyboard shortcuts in the UI where appropriate:

```tsx
<p className="text-xs text-slate-400 text-center">
  Keyboard: <span className="font-mono">Arrow keys</span> or{' '}
  <span className="font-mono">WASD</span> for cardinal directions
</p>
```

**Keyboard Event Handling**

```tsx
function NavigationUI() {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Ignore if modifier keys are pressed
    if (event.ctrlKey || event.altKey || event.metaKey) return
    
    // Ignore if typing in input
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    
    // Handle navigation
    const direction = keyMap.get(event.key)
    if (direction) {
      event.preventDefault() // Prevent default browser behavior
      onNavigate(direction)
    }
  }, [keyMap, onNavigate])
  
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
```

**Keyboard Shortcuts Reference**

| Keys | Action | Component |
|------|--------|-----------|
| Arrow Keys / WASD | Cardinal navigation (N/S/E/W) | NavigationUI |
| Q/E/Z/C | Intercardinal navigation (NW/NE/SW/SE) | NavigationUI |
| U/N | Vertical navigation (Up/Down) | NavigationUI |
| I/O | Radial navigation (In/Out) | NavigationUI |
| Arrow Up/Down | History navigation / Autocomplete | CommandInput |
| Tab | Accept autocomplete suggestion | CommandInput |
| Escape | Close autocomplete | CommandInput |
| Enter | Submit command | CommandInput |

### Screen Reader Considerations

**Proper Labeling**

```tsx
// ✅ Label with visible text
<label htmlFor="command-input">Command</label>
<input id="command-input" />

// ✅ Label with aria-label (no visible label)
<button aria-label="Move north">N</button>

// ✅ Label with aria-labelledby (reference existing text)
<section aria-labelledby="stats-title">
  <h3 id="stats-title">Player Status</h3>
</section>

// ❌ Unlabeled interactive element
<button><span aria-hidden="true">→</span></button> {/* BAD */}
```

**Descriptive Text**

```tsx
// ✅ Provide context in aria-label
<button
  aria-label="Move north exit, click to navigate"
  title="Move north (arrow up or W)"
>
  N
</button>

// ✅ Additional context with aria-describedby
<input
  aria-describedby="password-requirements"
  aria-invalid={hasError}
/>
<div id="password-requirements">
  Must be at least 8 characters
</div>
```

**Loading States**

```tsx
// ✅ Announce loading state
<section aria-busy={isLoading} aria-live="polite">
  {isLoading ? (
    <div className="flex items-center gap-3">
      <div className="animate-spin rounded-full border-2 border-atlas-accent border-t-transparent h-5 w-5" />
      <span>Loading location...</span>
    </div>
  ) : (
    <LocationContent />
  )}
</section>
```

### Touch Targets

**Minimum Size: 44×44 CSS pixels** (WCAG 2.1 Level AAA)

```tsx
// Use .touch-target utility
<button className="touch-target px-4 py-2">
  Button
</button>

// Or explicit min dimensions
<button className="min-h-[44px] min-w-[44px]">
  Icon Button
</button>
```

### Color Contrast

**Minimum Contrast Ratios:**
- Normal text (<24px): 4.5:1
- Large text (≥24px or ≥18.66px bold): 3:1
- UI components and graphical objects: 3:1

**Tested Combinations:**
```css
/* ✅ Pass - text on backgrounds */
text-white on bg-atlas-bg          /* 21:1 */
text-slate-100 on bg-atlas-bg      /* 18:1 */
text-slate-300 on bg-slate-800     /* 8:1 */
text-emerald-300 on bg-emerald-900 /* 7:1 */
text-red-400 on bg-red-900/20      /* 5:1 */

/* ❌ Avoid - low contrast */
text-slate-500 on bg-slate-800     /* 3:1 - only for large text */
```

---

## Component Examples

### GameView Example

**Responsive Layout Structure:**

```tsx
export default function GameView({ className }: GameViewProps): React.ReactElement {
  const isTablet = useMediaQuery('(min-width: 640px)')
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  
  return (
    <div className={['flex flex-col gap-4 sm:gap-5', className].filter(Boolean).join(' ')}>
      {isDesktop ? (
        // Desktop: Three-column layout
        <div className="grid grid-cols-12 gap-4 lg:gap-5">
          <div className="col-span-7 flex flex-col gap-4 lg:gap-5">
            <LocationPanel />
            <ExitsPanel />
            <NavigationUI />
            <CommandInterface />
          </div>
          <aside className="col-span-5 flex flex-col gap-4 lg:gap-5">
            <PlayerStatsPanel />
            <CommandHistoryPanel />
          </aside>
        </div>
      ) : isTablet ? (
        // Tablet: Two-column layout
        <div className="grid grid-cols-12 gap-4 sm:gap-5">
          <div className="col-span-8">
            {/* Main content */}
          </div>
          <aside className="col-span-4">
            {/* Sidebar */}
          </aside>
        </div>
      ) : (
        // Mobile: Single column
        <>
          <LocationPanel />
          <ExitsPanel />
          <PlayerStatsPanel collapsible={true} />
          <NavigationUI />
          <CommandInterface />
        </>
      )}
    </div>
  )
}
```

### CommandInput Example

**Accessible Input with Autocomplete:**

```tsx
export default function CommandInput({
  disabled,
  busy,
  placeholder = 'Enter a command',
  onSubmit,
  availableExits = [],
  commandHistory = []
}: CommandInputProps): React.ReactElement {
  const [value, setValue] = useState('')
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Keyboard navigation handler
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      // Navigate autocomplete or history
    }
    if (e.key === 'Tab' && showAutocomplete) {
      e.preventDefault()
      // Accept autocomplete suggestion
    }
    if (e.key === 'Escape') {
      setShowAutocomplete(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Command entry">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className="w-full touch-target rounded-md bg-white/5 border border-white/15 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-atlas-accent"
          placeholder={placeholder}
          aria-label="Command"
          aria-autocomplete="list"
          aria-controls={showAutocomplete ? 'command-autocomplete' : undefined}
          role="combobox"
          aria-expanded={showAutocomplete}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoComplete="off"
        />
        
        {/* Autocomplete dropdown */}
        {showAutocomplete && (
          <div
            id="command-autocomplete"
            role="listbox"
            className="absolute z-10 w-full mt-1 bg-slate-800 border border-white/20 rounded-md shadow-lg max-h-48 overflow-auto"
          >
            {autocompleteOptions.map((option, index) => (
              <div
                key={option}
                role="option"
                aria-selected={index === selectedOptionIndex}
                className={[
                  'px-3 py-2 cursor-pointer transition-colors',
                  index === selectedOptionIndex
                    ? 'bg-atlas-accent/20 text-atlas-accent'
                    : 'text-slate-200 hover:bg-white/10'
                ].join(' ')}
                onClick={() => handleSelectOption(option)}
              >
                {option}
              </div>
            ))}
          </div>
        )}
      </div>
      
      <button
        type="submit"
        disabled={disabled || busy || !value.trim()}
        className="touch-target mt-2 px-4 py-2 rounded-md bg-atlas-accent text-emerald-900 font-semibold disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {busy ? 'Running…' : 'Run'}
      </button>
    </form>
  )
}
```

### PlayerStatusPanel (StatusPanel) Example

**Collapsible Panel with Health Bar:**

```tsx
export default function StatusPanel({
  health,
  maxHealth,
  locationName,
  inventoryCount,
  className
}: StatusPanelProps): React.ReactElement {
  const isMobile = !useMediaQuery('(min-width: 640px)')
  const [isCollapsed, setIsCollapsed] = useState(isMobile)
  const { duration } = useSessionTimer()

  const healthPercent = maxHealth > 0 ? Math.round((health / maxHealth) * 100) : 0
  const isLowHealth = healthPercent < 25
  const isDefeated = health === 0

  const healthColor = isDefeated
    ? 'bg-gray-500'
    : isLowHealth
    ? 'bg-red-500'
    : healthPercent > 60
    ? 'bg-emerald-500'
    : 'bg-amber-500'

  return (
    <aside
      className={[
        'bg-slate-800/95 backdrop-blur-sm ring-1 ring-white/10 rounded-xl shadow-xl',
        isMobile ? 'fixed top-4 right-4 left-4 z-50' : 'fixed top-4 right-4 z-50 w-80',
        className
      ].filter(Boolean).join(' ')}
      aria-labelledby="status-panel-title"
      aria-live="polite"
      aria-atomic="false"
    >
      {/* Header - clickable on mobile only */}
      <button
        onClick={() => isMobile && setIsCollapsed(!isCollapsed)}
        className={[
          'w-full flex items-center justify-between p-4',
          isMobile ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-atlas-accent' : ''
        ].join(' ')}
        aria-expanded={!isCollapsed}
        aria-controls="status-panel-content"
        disabled={!isMobile}
      >
        <h2 id="status-panel-title" className="text-responsive-base font-semibold text-white">
          Player Status
        </h2>
        {isMobile && <span aria-hidden="true">{isCollapsed ? '▼' : '▲'}</span>}
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div id="status-panel-content" className="px-4 pb-4 space-y-3">
          {/* Defeated state banner */}
          {isDefeated && (
            <div className="p-2 rounded-lg bg-red-900/40 ring-1 ring-red-500/40 text-center" role="alert">
              <span className="text-responsive-sm text-red-300 font-semibold">Defeated</span>
            </div>
          )}

          {/* Health bar with progress role */}
          <div>
            <div className="flex justify-between text-responsive-sm mb-1">
              <span className="text-slate-300">Health</span>
              <span className={isLowHealth && !isDefeated ? 'text-red-400 animate-pulse font-medium' : 'text-white font-medium'}>
                {health}/{maxHealth}
              </span>
            </div>
            <div
              className="h-2 bg-slate-700 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={health}
              aria-valuemin={0}
              aria-valuemax={maxHealth}
              aria-label="Player health"
            >
              <div
                className={`h-full ${healthColor} transition-all duration-300`}
                style={{ width: `${healthPercent}%` }}
              />
            </div>
            {isLowHealth && !isDefeated && (
              <p className="text-xs text-red-400 mt-1" role="status">
                ⚠️ Low health!
              </p>
            )}
          </div>

          {/* Location */}
          <div className="flex justify-between text-responsive-sm">
            <span className="text-slate-300">Location</span>
            <span className="text-white font-medium truncate max-w-[60%]" title={locationName}>
              {locationName.length > 30 ? locationName.slice(0, 30) + '...' : locationName}
            </span>
          </div>

          {/* Inventory */}
          <div className="flex justify-between text-responsive-sm">
            <span className="text-slate-300">Inventory</span>
            <span className="text-white font-medium">
              {inventoryCount > 99 ? '99+' : inventoryCount} items
            </span>
          </div>

          {/* Session duration */}
          <div className="flex justify-between text-responsive-sm pt-2 border-t border-white/10">
            <span className="text-slate-300">Session</span>
            <span className="text-white font-mono font-medium">{duration}</span>
          </div>
        </div>
      )}
    </aside>
  )
}
```

### NavigationUI Example

**Directional Navigation with Keyboard Shortcuts:**

```tsx
export default function NavigationUI({
  availableExits,
  onNavigate,
  disabled = false
}: NavigationUIProps): React.ReactElement {
  // Build exit map for quick lookup
  const exitMap = React.useMemo(() => {
    const map = new Map<Direction, ExitInfo>()
    availableExits.forEach((exit) => map.set(exit.direction, exit))
    return map
  }, [availableExits])

  // Keyboard shortcut handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Ignore if modifier keys or typing in input
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    const direction = keyMap.get(event.key)
    if (direction && exitMap.has(direction) && !disabled) {
      event.preventDefault()
      onNavigate(direction)
    }
  }, [keyMap, exitMap, onNavigate, disabled])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <section className="card rounded-xl p-4 sm:p-5" aria-labelledby="navigation-title">
      <h3 id="navigation-title" className="text-responsive-base font-semibold text-white mb-3">
        Navigate
      </h3>

      {/* Cardinal & Intercardinal: 3x3 Grid */}
      <div className="mb-3" role="group" aria-label="Cardinal and intercardinal directions">
        <div className="grid grid-cols-3 gap-2 max-w-[300px] mx-auto">
          {/* NW  N  NE */}
          {/* W   ◉  E  */}
          {/* SW  S  SE */}
          <DirectionButton
            config={DIRECTIONS.find(d => d.direction === 'northwest')!}
            exitInfo={exitMap.get('northwest')}
            disabled={disabled}
            onClick={() => onNavigate('northwest')}
          />
          {/* ... other buttons ... */}
        </div>
      </div>

      {/* Vertical & Radial: Horizontal Row */}
      <div className="flex justify-center gap-2 flex-wrap" role="group" aria-label="Vertical and radial directions">
        {verticals.map((config) => (
          <DirectionButton key={config.direction} {...config} />
        ))}
      </div>

      {/* Keyboard hint */}
      <p className="mt-3 text-xs text-slate-400 text-center">
        Keyboard: <span className="font-mono">Arrow keys</span> or <span className="font-mono">WASD</span>
      </p>
    </section>
  )
}
```

---

## Third-Party Components

**When to Use Third-Party Libraries**

The project minimizes third-party UI component dependencies to maintain control over accessibility and styling. Before adding a new library:

1. Check if the functionality can be implemented with native HTML + Tailwind
2. Verify the library meets WCAG 2.2 AA accessibility standards
3. Confirm it supports keyboard navigation and screen readers
4. Ensure it's compatible with Tailwind's utility-first approach

**Current Third-Party Components**

| Library | Purpose | Usage |
|---------|---------|-------|
| React Router | Client-side routing | Page navigation |
| TanStack Query | Server state management | (Planned for data fetching) |
| @tailwindcss/forms | Form styling | Better form defaults |
| @tailwindcss/typography | Prose styling | Long-form content |

**Wrapping Third-Party Components**

If you must use a third-party component, wrap it in a custom component to enforce accessibility:

```tsx
// Wrapper example for hypothetical modal library
import ThirdPartyModal from 'some-modal-library'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function AccessibleModal({ isOpen, onClose, title, children }: ModalProps) {
  return (
    <ThirdPartyModal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel={title} // Required for accessibility
      closeTimeoutMS={200}
      className="modal-content" // Custom Tailwind styles
      overlayClassName="modal-overlay"
      // Enforce accessibility props
      aria={{ modal: true }}
      role="dialog"
      shouldCloseOnOverlayClick={true}
      shouldCloseOnEsc={true}
      shouldFocusAfterRender={true}
      shouldReturnFocusAfterClose={true}
    >
      <div className="p-6">
        <h2 id="modal-title" className="text-responsive-xl font-semibold mb-4">
          {title}
        </h2>
        {children}
      </div>
    </ThirdPartyModal>
  )
}
```

**Required Accessibility Props for Wrappers**

When wrapping third-party components, ensure:

- ✅ `role` is set appropriately (dialog, menu, listbox, etc.)
- ✅ `aria-label` or `aria-labelledby` provides accessible name
- ✅ Keyboard navigation works (Tab, Escape, Arrow keys)
- ✅ Focus is trapped within modal/overlay components
- ✅ Focus returns to trigger element on close
- ✅ `aria-hidden` on background content when modal open

---

## Testing Components

### Accessibility Testing

**Automated Testing with axe**

```bash
# Run accessibility tests
npm run a11y

# Scan specific pages
A11Y_PATHS="/,/game,/about" npm run a11y
```

**Manual Testing Checklist**

Before submitting a PR with UI changes:

- [ ] Keyboard-only navigation works (no mouse)
- [ ] All interactive elements have visible focus indicators
- [ ] Tab order is logical and doesn't trap focus
- [ ] Screen reader announces all dynamic content changes
- [ ] Color contrast meets WCAG 2.2 AA standards (4.5:1 for text)
- [ ] Component works with 200% browser zoom
- [ ] Component works in mobile viewport (320px width minimum)

**Screen Reader Testing**

Test with at least one screen reader:

- **Windows:** NVDA (free) + Firefox
- **macOS:** VoiceOver (built-in) + Safari
- **Quick test:** Use browser extensions like axe DevTools

**Testing Example:**

```tsx
// test/accessibility.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import GameView from '../src/components/GameView'

describe('GameView accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(<GameView />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has proper landmark structure', () => {
    render(<GameView />)
    // Should NOT have its own <main> (provided by App.tsx)
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
    // Should have sections with proper headings
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('has keyboard accessible navigation', () => {
    render(<GameView />)
    const buttons = screen.getAllByRole('button')
    buttons.forEach(button => {
      expect(button).toHaveAttribute('tabIndex')
      expect(button).not.toHaveAttribute('aria-hidden', 'true')
    })
  })
})
```

### Component Testing

**Unit Test Example:**

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommandInput from '../src/components/CommandInput'

describe('CommandInput', () => {
  it('shows autocomplete suggestions', async () => {
    const user = userEvent.setup()
    render(
      <CommandInput
        onSubmit={vi.fn()}
        availableExits={['north', 'south']}
      />
    )

    const input = screen.getByRole('combobox')
    await user.type(input, 'move n')

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /north/i })).toBeInTheDocument()
    })
  })

  it('accepts autocomplete with Tab key', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <CommandInput onSubmit={onSubmit} availableExits={['north']} />
    )

    const input = screen.getByRole('combobox')
    await user.type(input, 'move n')
    await user.keyboard('{Tab}')

    expect(input).toHaveValue('move north')
  })
})
```

### Visual Regression Testing

(Planned for future milestones)

For now, manually verify:
- Component appearance at mobile/tablet/desktop breakpoints
- Focus states visibility
- Loading/error states
- Hover/active states

---

## Summary

This guide covers the essential patterns for contributing to The Shifting Atlas frontend:

1. **Component Architecture:** Follow the established tree structure; GameView orchestrates game UI
2. **Style Guide:** Use Tailwind utilities; follow mobile-first responsive patterns
3. **Accessibility:** WCAG 2.2 AA compliance is non-negotiable; use semantic HTML, proper ARIA, keyboard support
4. **Code Examples:** Reference GameView, CommandInput, and StatusPanel for common patterns
5. **Testing:** Run `npm run a11y` before PRs; test with keyboard only; verify screen reader support

**For detailed implementation guidance:**
- [Frontend README](../../frontend/README.md) - Complete architecture documentation
- [Accessibility Guidelines](../ux/accessibility-guidelines.md) - WCAG 2.2 AA requirements
- [Frontend API Contract](../architecture/frontend-api-contract.md) - Backend integration

**Questions?** Open an issue or refer to existing components as examples.

---

_Last updated: 2025-12-07 (Initial documentation for Epic #389)_

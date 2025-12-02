# Frontend Architecture Documentation

Player-facing SPA built with Vite, React, and Tailwind CSS. This document provides comprehensive guidance for frontend contributors.

**Quick Start:** New to the project? Start with [Developer Setup](#developer-setup), then read [Architecture Overview](#architecture-overview) and [Component Catalog](#component-catalog).

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Component Catalog](#component-catalog)
- [State Management](#state-management)
- [API Integration](#api-integration)
- [Developer Setup](#developer-setup)
- [Testing Guide](#testing-guide)
- [Scripts Reference](#scripts-reference)
- [Code Conventions](#code-conventions)
- [Telemetry & Observability](#telemetry--observability)
- [Authentication](#authentication)
- [Accessibility (A11y)](#accessibility-a11y)
- [Progressive Enhancement](#progressive-enhancement-desktop)
- [Notable Files](#notable-files)
- [Roadmap](#roadmap)

---

## Architecture Overview

### Technology Stack

- **Build Tool:** Vite (fast HMR, ESM-native)
- **Framework:** React 18 (functional components, hooks)
- **Styling:** Tailwind CSS with Typography and Forms plugins
- **Routing:** React Router v6
- **Type Safety:** TypeScript (strict mode)
- **Testing:** Vitest + happy-dom
- **Deployment:** Azure Static Web Apps

### Design Principles

1. **Separation of Concerns:** Keep UI free of game logic; backend handles all world state
2. **Stateless Components:** Prefer pure functional components with explicit props
3. **Accessibility First:** WCAG 2.1 AA compliance is non-negotiable
4. **Progressive Enhancement:** Mobile baseline, desktop enhancements
5. **Type Safety:** Explicit types, no implicit `any`
6. **Telemetry by Default:** All user actions tracked with correlation IDs

---

## Component Catalog

This section provides a reference for all major components with their props, usage patterns, and examples.

### Layout Components

#### `<App />`
**File:** `src/App.tsx`  
**Purpose:** Root application component with global router, skip link, and main landmark.

**Key Features:**
- Global `<main id="main">` landmark (pages must NOT add their own)
- Skip navigation link for keyboard users
- `RouteFocusManager` for screen reader navigation announcements
- Global `<LiveAnnouncer>` for dynamic content updates

**Example:**
```tsx
// App.tsx is the entry point - no direct usage needed
// Rendered from main.tsx
```

#### `<ResponsiveLayout />`
**File:** `src/components/ResponsiveLayout.tsx`  
**Purpose:** Wrapper providing responsive container constraints and background effects.

**Props:**
```typescript
interface ResponsiveLayoutProps {
    children: React.ReactNode
    className?: string
}
```

**Example:**
```tsx
<ResponsiveLayout>
    <YourPageContent />
</ResponsiveLayout>
```

#### `<Nav />`
**File:** `src/components/Nav.tsx`  
**Purpose:** Primary navigation bar with authentication controls and branding.

**Features:**
- Sticky header with backdrop blur on desktop
- Sign in/out controls
- Auth status indicator
- Mobile-responsive menu

**Example:**
```tsx
// Nav is rendered globally in App.tsx
// Auth state automatically managed via useAuth hook
```

### Page Components

#### `<Homepage />`
**File:** `src/components/Homepage.tsx`  
**Purpose:** Landing page with marketing content and sign-in CTA.

**Features:**
- New vs. returning user differentiation
- Auth-aware hero section
- Guest GUID bootstrap integration
- Welcome toast notifications

**State Dependencies:**
- `useAuth()` - Authentication state
- `usePlayerGuid()` - Player session state
- `useVisitState()` - First-visit detection
- `useLinkGuestOnAuth()` - Guest account linking

**Example:**
```tsx
<Route path="/" element={<Homepage />} />
```

#### `<Game />`
**File:** `src/pages/Game.tsx`  
**Purpose:** Protected game page wrapping GameView, requires authentication.

**Features:**
- Auto-redirects unauthenticated users to homepage
- Loading state during auth check
- Wraps `<GameView>` component

**Example:**
```tsx
<Route path="/game" element={<Game />} />
```

### Game Components

#### `<GameView />`
**File:** `src/components/GameView.tsx`  
**Purpose:** Main game interface orchestrating location, exits, stats, and commands.

**Props:**
```typescript
interface GameViewProps {
    className?: string
}
```

**Features:**
- Responsive layout (single column mobile, multi-column desktop)
- Location panel with description truncation
- Exit compass visualization
- Player stats sidebar
- Command history panel
- Integrated `<CommandInterface>`

**Sub-components:**
- `LocationPanel` - Current location name and description
- `ExitsPanel` - Visual compass showing available exits
- `PlayerStatsPanel` - Health, location, inventory stats
- `CommandHistoryPanel` - Recent command log

**Example:**
```tsx
import GameView from '../components/GameView'

export default function Game() {
    return <GameView />
}
```

#### `<CommandInterface />`
**File:** `src/components/CommandInterface.tsx`  
**Purpose:** Command input/output lifecycle with built-in command parsing.

**Props:**
```typescript
interface CommandInterfaceProps {
    className?: string
}
```

**Built-in Commands:**
- `ping [message]` - Backend health check with latency display
- `move <direction>` - Player movement (e.g., `move north`)
- `look [locationId]` - Location inspection
- `clear` - Clear command history

**Features:**
- Command history navigation (up/down arrows)
- Auto-focus on component mount
- Correlation ID tracking per command
- Error handling with user-friendly messages
- Session storage for current location

**Example:**
```tsx
<CommandInterface className="my-4" />
```

#### `<CommandInput />`
**File:** `src/components/CommandInput.tsx`  
**Purpose:** Text input with command submission and history navigation.

**Props:**
```typescript
interface CommandInputProps {
    onSubmit: (command: string) => void
    disabled?: boolean
    autoFocus?: boolean
}
```

**Features:**
- Arrow key navigation through history
- Enter to submit
- Auto-focus support
- Disabled state styling

**Example:**
```tsx
<CommandInput 
    onSubmit={(cmd) => handleCommand(cmd)}
    disabled={isProcessing}
    autoFocus={true}
/>
```

#### `<CommandOutput />`
**File:** `src/components/CommandOutput.tsx`  
**Purpose:** Displays command execution history with responses and errors.

**Props:**
```typescript
interface CommandOutputProps {
    records: CommandRecord[]
    maxRecords?: number
}

interface CommandRecord {
    id: string
    command: string
    response?: string
    error?: string
    ts: number
}
```

**Features:**
- Auto-scroll to latest
- Timestamp display
- Error vs. success styling
- Truncation for long output

**Example:**
```tsx
<CommandOutput 
    records={commandHistory}
    maxRecords={50}
/>
```

### Utility Components

#### `<LiveAnnouncer />`
**File:** `src/components/LiveAnnouncer.tsx`  
**Purpose:** Screen reader announcements for dynamic content changes (ARIA live region).

**Usage:**
```tsx
// Rendered globally in App.tsx
// Announcements triggered via event system or imperative API
```

#### `<Logo />`
**File:** `src/components/Logo.tsx`  
**Purpose:** Branded logo component with consistent styling.

**Props:**
```typescript
interface LogoProps {
    className?: string
    variant?: 'default' | 'compact'
}
```

---

## State Management

The frontend uses **React Context** for cross-cutting concerns and **local component state** for UI-specific data. No Redux/Zustand required for MVP scope.

### Context Providers

#### AuthContext
**File:** `src/hooks/useAuth.tsx`  
**Purpose:** Manages Azure Static Web Apps authentication state.

**Provider:**
```tsx
import { AuthProvider } from './hooks/useAuth'

<AuthProvider>
    <App />
</AuthProvider>
```

**Hook API:**
```typescript
const {
    loading: boolean,           // Auth check in progress
    user: ClientPrincipal | null,  // Authenticated user info
    isAuthenticated: boolean,   // Convenience flag
    error: string | null,       // Auth error if any
    signIn: (provider, redirectPath) => void,
    signOut: (redirectPath) => void,
    refresh: () => void         // Force re-check auth state
} = useAuth()
```

**Usage Example:**
```tsx
import { useAuth } from '../hooks/useAuth'

function MyComponent() {
    const { isAuthenticated, user, signIn, signOut } = useAuth()
    
    if (!isAuthenticated) {
        return <button onClick={() => signIn('msa')}>Sign In</button>
    }
    
    return (
        <div>
            <p>Welcome, {user.userDetails}</p>
            <button onClick={() => signOut()}>Sign Out</button>
        </div>
    )
}
```

**Cross-Tab Synchronization:**  
Sign-out broadcasts to other tabs via `localStorage` events, ensuring consistent state across browser tabs.

### Custom Hooks

#### `usePlayerGuid()`
**File:** `src/hooks/usePlayerGuid.ts`  
**Purpose:** Manages player GUID bootstrap and persistence.

**Returns:**
```typescript
{
    playerGuid: string | null,
    loading: boolean,
    created: boolean | null,    // null until first response
    error: string | null,
    refresh: () => void
}
```

**Behavior:**
- Reads from `localStorage` (key: `tsa.playerGuid`)
- Validates existing GUID with backend
- Allocates new GUID if none exists
- Prevents concurrent bootstrap requests (race condition guard)
- Emits telemetry events (`Onboarding.GuestGuid.*`)

**Usage Example:**
```tsx
function MyGameComponent() {
    const { playerGuid, loading, error } = usePlayerGuid()
    
    if (loading) return <Spinner />
    if (error) return <Error message={error} />
    if (!playerGuid) return <p>No session</p>
    
    return <GameView playerGuid={playerGuid} />
}
```

#### `useMediaQueries()`
**File:** `src/hooks/useMediaQueries.ts`  
**Purpose:** Reactive media query hooks for responsive behavior.

**Available Hooks:**
```typescript
useMediaQuery(query: string): boolean
usePointerFine(): boolean  // true if precise pointer (mouse)
usePrefersReducedMotion(): boolean
```

**Usage Example:**
```tsx
import { useMediaQuery, usePointerFine } from '../hooks/useMediaQueries'

function ResponsiveComponent() {
    const isDesktop = useMediaQuery('(min-width: 768px)')
    const hasFineMouse = usePointerFine()
    
    return (
        <div>
            {isDesktop && <Sidebar />}
            {hasFineMouse && <TooltipOnHover />}
        </div>
    )
}
```

#### `useVisitState()`
**File:** `src/hooks/useVisitState.ts`  
**Purpose:** First-visit detection for onboarding flows.

**Returns:**
```typescript
{
    isNewUser: boolean,
    acknowledge: () => void  // Mark user as returning
}
```

#### `useLinkGuestOnAuth()`
**File:** `src/hooks/useLinkGuestOnAuth.ts`  
**Purpose:** Automatically links guest GUID to authenticated identity on sign-in.

**Returns:**
```typescript
{
    linking: boolean,
    linked: boolean,
    error: string | null
}
```

#### `usePing()`
**File:** `src/hooks/usePing.ts`  
**Purpose:** Backend health check with latency measurement.

**Returns:**
```typescript
{
    ping: () => Promise<void>,
    loading: boolean,
    latency: number | null,  // milliseconds
    error: string | null
}
```

### Data Flow Patterns

**1. Server State (API Data)**
- Fetched in components via `fetch()` + `useState/useEffect`
- Wrapped in envelope format (see [API Integration](#api-integration))
- Correlation IDs attached to every request
- Loading/error states managed locally

**2. Client State (UI State)**
- Local `useState` for component-specific UI (modals, inputs, etc.)
- `sessionStorage` for per-tab persistence (current location)
- `localStorage` for cross-tab persistence (player GUID, visit state)

**3. Global State (Auth, Player)**
- React Context for auth (`useAuth`)
- Custom hooks for player session (`usePlayerGuid`)
- No prop drilling - contexts accessed via hooks

**Example: Typical Data Flow**
```
User Action
    ↓
Component Event Handler
    ↓
Generate Correlation ID
    ↓
API Call (fetch + correlation headers)
    ↓
Update Local State (loading → success/error)
    ↓
Emit Telemetry Event
    ↓
Re-render with New Data
```

---

## API Integration

All backend communication uses the centralized utilities in `src/utils/apiClient.ts` and follows the **envelope pattern** for consistent response handling.

### Base API URL

Local development: `http://localhost:7071/api` (Azure Functions)  
Production: `/api` (proxied by SWA)

Vite dev server can proxy `/api` to backend if needed (configure in `vite.config.ts`).

### Request Utilities

#### Building URLs

```typescript
import { buildPlayerUrl, buildLocationUrl, buildMoveRequest } from '../utils/apiClient'

// Player operations
const url = buildPlayerUrl(playerGuid)  // /api/player/{guid}
// throws Error if GUID invalid

// Location operations
const url = buildLocationUrl(locationId)  // /api/location/{guid}
const url = buildLocationUrl(null)        // /api/location (default)

// Move operation
const { url, method, body } = buildMoveRequest(
    playerGuid, 
    'north', 
    currentLocationId
)
// POST /api/player/{guid}/move
// body: { direction: 'north', fromLocationId: '...' }
```

#### Building Headers

```typescript
import { buildHeaders, buildCorrelationHeaders, generateCorrelationId } from '../utils/...'

const correlationId = generateCorrelationId()
const headers = buildHeaders({
    ...buildCorrelationHeaders(correlationId),
    'Content-Type': 'application/json'
})

fetch(url, { headers })
```

### Response Envelope Pattern

All backend responses use an envelope format for consistent error handling:

```typescript
// Success envelope
{
    success: true,
    data: { /* actual response payload */ }
}

// Error envelope
{
    success: false,
    error: {
        code: 'INVALID_DIRECTION',
        message: 'Direction must be one of: north, south, east, west',
        details?: { /* additional context */ }
    }
}
```

#### Unwrapping Responses

```typescript
import { unwrapEnvelope } from '../utils/envelope'
import { extractErrorMessage } from '../utils/apiResponse'

const res = await fetch(url, { headers, method, body })
const json = await res.json().catch(() => ({}))
const unwrapped = unwrapEnvelope<YourResponseType>(json)

if (!res.ok || (unwrapped.isEnvelope && !unwrapped.success)) {
    const errorMsg = extractErrorMessage(res, json, unwrapped)
    // Handle error: show to user, emit telemetry, etc.
} else if (unwrapped.data) {
    // Success: use unwrapped.data
    const data: YourResponseType = unwrapped.data
}
```

### Adding a New Backend Endpoint

**Step-by-step guide:**

1. **Define the API contract in `@piquet-h/shared`:**
   ```typescript
   // shared/src/apiContracts.ts
   export interface MyNewRequest {
       param1: string
       param2?: number
   }
   
   export interface MyNewResponse {
       result: string
       metadata: Record<string, unknown>
   }
   ```

2. **Create the backend Function:**
   ```typescript
   // backend/src/functions/myNewFunction.ts
   import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
   import { MyNewRequest, MyNewResponse } from '@piquet-h/shared'
   
   app.http('myNewFunction', {
       methods: ['POST'],
       route: 'my-endpoint',
       handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
           const body: MyNewRequest = await req.json()
           // ... handle request
           return {
               status: 200,
               jsonBody: {
                   success: true,
                   data: { result: '...', metadata: {} } satisfies MyNewResponse
               }
           }
       }
   })
   ```

3. **Add utility to `apiClient.ts`:**
   ```typescript
   // frontend/src/utils/apiClient.ts
   export function buildMyNewRequestUrl(id: string): string {
       if (!isValidGuid(id)) {
           throw new Error('ID must be valid GUID')
       }
       return `/api/my-endpoint/${id}`
   }
   ```

4. **Create a service wrapper (optional but recommended):**
   ```typescript
   // frontend/src/services/myNewService.ts
   import type { MyNewRequest, MyNewResponse } from '@piquet-h/shared'
   import { buildHeaders } from '../utils/apiClient'
   import { unwrapEnvelope } from '../utils/envelope'
   import { trackGameEventClient } from './telemetry'
   
   export async function myNewOperation(
       params: MyNewRequest
   ): Promise<MyNewResponse> {
       trackGameEventClient('MyFeature.Started')
       
       const res = await fetch('/api/my-endpoint', {
           method: 'POST',
           headers: buildHeaders({ 'Content-Type': 'application/json' }),
           body: JSON.stringify(params)
       })
       
       const json = await res.json()
       const unwrapped = unwrapEnvelope<MyNewResponse>(json)
       
       if (!res.ok || !unwrapped.success) {
           throw new Error('Operation failed')
       }
       
       trackGameEventClient('MyFeature.Completed')
       return unwrapped.data!
   }
   ```

5. **Use in components:**
   ```tsx
   import { myNewOperation } from '../services/myNewService'
   
   function MyComponent() {
       const [loading, setLoading] = useState(false)
       
       const handleAction = async () => {
           setLoading(true)
           try {
               const result = await myNewOperation({ param1: 'value' })
               // Handle success
           } catch (err) {
               // Handle error
           } finally {
               setLoading(false)
           }
       }
       
       return <button onClick={handleAction}>Do Thing</button>
   }
   ```

### Best Practices

- **Always validate GUIDs** before sending requests
- **Always attach correlation IDs** for request tracing
- **Always use envelope unwrapping** for consistent error handling
- **Always emit telemetry** for user actions and API calls
- **Never expose API keys or secrets** in frontend code
- **Cache responses** when appropriate (use React Query or similar for production)

---

## Developer Setup

### Prerequisites

- **Node.js:** 22.x (see `.nvmrc` - CI enforces this)
- **npm:** ≥10.0.0
- **Git:** Any recent version
- **Code Editor:** VS Code recommended (settings included in `.vscode/`)

### Initial Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/piquet-h/the-shifting-atlas.git
   cd the-shifting-atlas/frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.development.example .env.development
   ```
   
   Edit `.env.development` with your values:
   ```bash
   # Application Insights (optional - telemetry disabled if not set)
   VITE_APPINSIGHTS_CONNECTION_STRING=InstrumentationKey=your-key;IngestionEndpoint=https://...
   
   # Backend API (default: http://localhost:7071 for local Functions)
   # VITE_API_BASE_URL=http://localhost:7071
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```
   
   Frontend will be available at `http://localhost:5173`

5. **Start the backend (in separate terminal):**
   ```bash
   cd ../backend
   npm install
   npm start
   ```
   
   Backend will be available at `http://localhost:7071`

### Environment Variables

All environment variables must be prefixed with `VITE_` to be accessible in the browser.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `VITE_APPINSIGHTS_CONNECTION_STRING` | No | undefined | Application Insights telemetry (gracefully disabled if not set) |
| `VITE_API_BASE_URL` | No | `/api` | Backend API base URL (uses relative path by default for SWA proxy) |

**Accessing in code:**
```typescript
const apiBase = import.meta.env.VITE_API_BASE_URL || '/api'
const telemetryKey = import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING
```

**Type definitions:**  
Extend types in `src/vite-env.d.ts` if you add custom environment variables:
```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APPINSIGHTS_CONNECTION_STRING?: string
    readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
```

### Debugging Tips

#### Browser DevTools

1. **React DevTools:** Install the React DevTools extension for component tree inspection
2. **Network Tab:** Monitor API calls, check headers (especially `x-correlation-id`)
3. **Console:** Watch for telemetry events (if enabled) and error messages
4. **Application Tab:** Inspect localStorage/sessionStorage for player GUID and session state

#### VS Code Debugging

Launch configuration (`.vscode/launch.json`):
```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "chrome",
            "request": "launch",
            "name": "Launch Chrome against localhost",
            "url": "http://localhost:5173",
            "webRoot": "${workspaceFolder}/frontend/src"
        }
    ]
}
```

Set breakpoints in `.tsx` files and press F5 to debug.

#### Common Issues

**Issue:** `Cannot find module '@piquet-h/shared'`  
**Solution:** Ensure `@piquet-h/shared` is published to GitHub Packages and version in `package.json` is correct. Run `npm install` again.

**Issue:** `ECONNREFUSED` when calling API  
**Solution:** Ensure backend Functions app is running on `http://localhost:7071`. Check `VITE_API_BASE_URL` if custom.

**Issue:** White screen / blank page  
**Solution:** Check browser console for errors. Often a missing environment variable or import error. Run `npm run typecheck` to catch type errors.

**Issue:** Auth not working locally  
**Solution:** SWA auth requires the SWA CLI: `npm run swa` instead of `npm run dev`. See [Authentication](#authentication) section.

**Issue:** `Error: Player ID must be a valid GUID`  
**Solution:** Player GUID bootstrap may have failed. Clear localStorage and refresh. Check backend logs for bootstrap endpoint failures.

### Hot Module Replacement (HMR)

Vite provides instant updates without full page refresh:
- **Component edits:** React Fast Refresh preserves state
- **CSS edits:** Injected immediately
- **Config changes:** Require full restart (`npm run dev` again)

If HMR breaks, refresh the page manually or restart the dev server.

---

## Testing Guide

### Test Stack

- **Test Runner:** Vitest (Vite-native, fast)
- **DOM Environment:** happy-dom (lightweight jsdom alternative)
- **Assertions:** Vitest assertions (Jest-compatible API)
- **Accessibility:** @axe-core/cli for automated a11y testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run accessibility tests
npm run a11y
```

### Test File Organization

```
test/
├── accessibility.test.tsx        # A11y compliance tests
├── apiClient.test.ts             # API utility unit tests
├── apiClient.integration.test.ts # API integration tests
├── apiResponse.test.ts           # Response parsing tests
├── commandInterface.enablement.test.tsx  # Command UI tests
├── correlation.test.ts           # Correlation ID tests
├── correlation.integration.test.ts
├── envelope.test.ts              # Envelope unwrapping tests
├── gameView.test.tsx             # GameView component tests
├── telemetry.test.ts             # Telemetry service tests
├── services/
│   └── playerService.test.ts    # Player service tests
└── utils/
    └── localStorage.test.ts      # Storage utility tests
```

### Writing Unit Tests

**Component test example:**
```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MyComponent from '../src/components/MyComponent'

describe('MyComponent', () => {
    it('renders heading', () => {
        render(<MyComponent title="Hello" />)
        expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument()
    })
    
    it('handles button click', async () => {
        const { user } = render(<MyComponent />)
        await user.click(screen.getByRole('button', { name: 'Submit' }))
        expect(screen.getByText('Submitted')).toBeInTheDocument()
    })
})
```

**Service test example:**
```typescript
import { describe, it, expect, vi } from 'vitest'
import { myService } from '../src/services/myService'

describe('myService', () => {
    it('calls API with correct params', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, data: { result: 'ok' } })
        })
        global.fetch = mockFetch
        
        await myService.doThing('param')
        
        expect(mockFetch).toHaveBeenCalledWith(
            '/api/my-endpoint',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('param')
            })
        )
    })
})
```

### Writing Accessibility Tests

Accessibility tests run against a live dev server using axe-core CLI:

```typescript
// test/accessibility.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'

describe('Homepage accessibility', () => {
    it('has no axe violations', async () => {
        const { container } = render(<Homepage />)
        const results = await axe(container)
        expect(results).toHaveNoViolations()
    })
    
    it('has landmark regions', () => {
        render(<Homepage />)
        expect(screen.getByRole('main')).toBeInTheDocument()
        expect(screen.getByRole('navigation')).toBeInTheDocument()
    })
})
```

**Automated axe tests:**
```bash
npm run a11y
```

This:
1. Starts Vite dev server on port 5173
2. Runs axe-core CLI against configured routes
3. Fails build if violations found
4. Generates reports in `frontend/axe-report/`

Configure additional routes in `scripts/run-axe.mjs`:
```javascript
const paths = process.env.A11Y_PATHS?.split(',') || ['/']
```

### Test Best Practices

1. **Test behavior, not implementation:** Focus on user-facing behavior
2. **Use semantic queries:** Prefer `getByRole` over `getByTestId`
3. **Mock external dependencies:** Mock `fetch`, timers, localStorage
4. **Test error states:** Don't just test happy paths
5. **Keep tests isolated:** Each test should be independent
6. **Use descriptive names:** Test names should explain the scenario

**Anti-patterns to avoid:**
- Testing internal component state directly
- Shallow rendering (use full render)
- Testing implementation details (CSS classes, internal methods)
- Large snapshot tests (brittle, hard to maintain)

---

## Scripts Reference

Complete list of available npm scripts:

| Script              | Purpose                                                               | When to Use |
| ------------------- | --------------------------------------------------------------------- | ----------- |
| `npm run dev`       | Start Vite dev server (React Fast Refresh).                           | Local development with fast HMR |
| `npm run build`     | Create production build (Vite).                                       | Before deployment, in CI |
| `npm run preview`   | Preview production build locally.                                     | Test production build locally |
| `npm run swa`       | Run with SWA CLI (includes auth emulation).                           | Test authentication flows locally |
| `npm run typecheck` | Run `tsc --noEmit` for full type safety.                              | Before committing, in CI |
| `npm run lint`      | Run ESLint on `src/` and `test/` directories.                        | Before committing, in CI |
| `npm run format`    | Format code with Prettier.                                            | Code cleanup, manual formatting |
| `npm run format:check` | Check code formatting without changes.                             | In CI, pre-commit hooks |
| `npm test`          | Run all Vitest tests once.                                            | CI, pre-commit validation |
| `npm run test:watch`| Run tests in watch mode (reruns on file changes).                    | During test development |
| `npm run test:coverage` | Run tests with coverage report.                                   | Coverage analysis |
| `npm run a11y`      | Run accessibility tests with axe-core.                                | Before merging, in CI |
| `npm run a11y:serve`| Start dev server for a11y tests (internal).                          | Used by `npm run a11y` |
| `npm run a11y:scan` | Run axe-core CLI scan (internal).                                     | Used by `npm run a11y` |
| `npm run clean`     | Remove build artifacts (`dist/`, `.cache/`, `coverage/`).             | Clean build, troubleshooting |

**Common workflows:**

**Local Development:**
```bash
# Terminal 1: Start backend
cd backend && npm start

# Terminal 2: Start frontend
cd frontend && npm run dev
```

**Pre-commit checklist:**
```bash
npm run typecheck  # Type safety
npm run lint       # Code quality
npm test           # Unit tests
npm run a11y       # Accessibility
```

**Testing auth flows:**
```bash
# Use SWA CLI instead of regular dev server
npm run swa
# Opens at http://localhost:4280 with auth emulation
```

---

## Code Conventions

### TypeScript

- **Strict Mode:** All checks enabled in `tsconfig.json`
- **Module Resolution:** `Bundler` (no file extensions in imports)
- **Explicit Returns:** Component functions typed as `React.ReactElement`
- **No `any`:** Use `unknown` and type guards instead
- **Props Interfaces:** Define explicit interfaces for component props

**Example:**
```typescript
// ✅ Good
interface MyComponentProps {
    title: string
    count?: number
}

export default function MyComponent({ title, count = 0 }: MyComponentProps): React.ReactElement {
    return <h1>{title}: {count}</h1>
}

// ❌ Bad (implicit types)
export default function MyComponent({ title, count }) {
    return <h1>{title}: {count}</h1>
}
```

### Component Structure

**Functional components only** (no class components):
```typescript
// Component structure template
import React, { useState, useEffect } from 'react'

interface Props {
    // Props interface
}

export default function ComponentName({ prop1, prop2 }: Props): React.ReactElement {
    // 1. Hooks
    const [state, setState] = useState()
    
    // 2. Effects
    useEffect(() => {
        // Side effects
    }, [])
    
    // 3. Event handlers
    const handleClick = () => {
        // Handler logic
    }
    
    // 4. Render
    return (
        <div>
            {/* JSX */}
        </div>
    )
}
```

### Styling Conventions

**Tailwind classes only** (no inline styles unless dynamic):
```tsx
// ✅ Good - Tailwind utility classes
<button className="px-4 py-2 bg-atlas-accent text-white rounded-lg hover:bg-atlas-accent-dark">
    Click me
</button>

// ❌ Bad - inline styles
<button style={{ padding: '8px 16px', backgroundColor: '#3b82f6' }}>
    Click me
</button>

// ✅ OK - dynamic styles when necessary
<div style={{ width: `${percentage}%` }} className="bg-blue-500">
```

**Responsive classes:**
```tsx
// Mobile-first approach
<div className="text-sm md:text-base lg:text-lg">
    {/* Base = mobile, md = tablet, lg = desktop */}
</div>
```

**Custom CSS classes:**  
Add to `tailwind.css` only for truly reusable patterns:
```css
/* src/tailwind.css */
@layer components {
    .btn-primary {
        @apply px-4 py-2 bg-atlas-accent text-white rounded-lg;
    }
}
```

### Naming Conventions

- **Components:** PascalCase (`GameView`, `CommandInput`)
- **Hooks:** camelCase with `use` prefix (`useAuth`, `usePlayerGuid`)
- **Utilities:** camelCase (`buildHeaders`, `unwrapEnvelope`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_RETRIES`, `API_BASE_URL`)
- **Types/Interfaces:** PascalCase (`LocationResponse`, `CommandRecord`)

### File Organization

- **One component per file** (except tiny sub-components)
- **Co-locate types** with components when specific to that component
- **Shared types** in `@piquet-h/shared` package
- **Index exports** avoided (explicit imports preferred)

### Import Order

```typescript
// 1. External dependencies
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// 2. Shared package imports
import type { LocationResponse } from '@piquet-h/shared'

// 3. Internal absolute imports (utils, services)
import { buildHeaders } from '../utils/apiClient'
import { trackGameEventClient } from '../services/telemetry'

// 4. Internal relative imports (components, hooks)
import MyComponent from './MyComponent'
import { useAuth } from '../hooks/useAuth'

// 5. Styles (if any separate CSS modules)
import styles from './MyComponent.module.css'
```

### Comment Guidelines

**When to comment:**
- Complex business logic that's not self-evident
- Workarounds for browser/library bugs
- "Why" not "what" (code should be self-documenting for "what")
- Public API documentation (JSDoc for exported functions)

**When NOT to comment:**
- Obvious code (`// Set x to 5` - NO)
- Commented-out code (delete it - it's in git history)
- TODO comments (create an issue instead)

**JSDoc for exported utilities:**
```typescript
/**
 * Validates a string is a valid GUID format (UUID v4).
 * @param guid - String to validate
 * @returns true if valid GUID, false otherwise
 * @example
 * isValidGuid('550e8400-e29b-41d4-a716-446655440000') // true
 * isValidGuid('not-a-guid') // false
 */
export function isValidGuid(guid: string | null | undefined): guid is string {
    // ...
}
```

---

---

## Telemetry & Observability

The frontend integrates with Azure Application Insights to track user interactions, measure performance, and correlate frontend events with backend operations.

### Enabling Telemetry

Set the `VITE_APPINSIGHTS_CONNECTION_STRING` environment variable in your `.env.development` or `.env.production` file:

```bash
VITE_APPINSIGHTS_CONNECTION_STRING=InstrumentationKey=your-key;IngestionEndpoint=https://...
```

If not set, telemetry is gracefully disabled (no-op).

### Features

- **Session tracking**: `Session.Start` and `Session.End` events with unique session IDs
- **Automatic error tracking**: Unhandled exceptions and promise rejections captured as `UI.Error` events
- **Page view tracking**: Route changes automatically emit pageView telemetry
- **Player action tracking**: `Player.Navigate` and `Player.Command` events for user actions
- **Backend correlation**: `x-correlation-id` header propagated for cross-service tracing
- **Debounce utility**: `debounceTrack()` for high-frequency events (e.g., typing)

### Edge Cases Handled

- **Ad blocker present**: Telemetry fails silently with no user impact
- **Offline mode**: SDK queues events and sends on reconnect
- **High-frequency events**: Use `debounceTrack()` wrapper to avoid flooding

### Correlation Headers

When telemetry is enabled, the frontend automatically:

- Generates a unique `correlationId` for each player action (move, look)
- Attaches the `x-correlation-id` header to backend HTTP requests
- Tracks UI events (`UI.Move.Command`, `UI.Location.Look`) with the correlationId
- Enables Application Insights join queries across frontend and backend events

### Event Attributes

All frontend telemetry events include:

| Attribute | Description |
|-----------|-------------|
| `game.session.id` | Unique session ID (UUID) generated on page load |
| `game.user.id` | Microsoft Account ID from SWA auth (when authenticated) |
| `game.action.type` | Type of player action (e.g., 'navigate', 'move', 'look') |
| `game.latency.ms` | Latency in milliseconds for API calls |
| `game.error.code` | Error classification for UI.Error events |
| `game.event.correlation.id` | Correlation ID for backend request tracing |

### Implementation Details

- **Telemetry Service**: `src/services/telemetry.ts` - Application Insights initialization, event tracking, session management
- **Correlation Utilities**: `src/utils/correlation.ts` - Generate and manage correlation IDs

### API Reference

```typescript
import { 
    initTelemetry,          // Initialize App Insights (called in main.tsx)
    trackEvent,             // Track custom event
    trackGameEventClient,   // Track validated game event
    trackUIError,           // Track UI.Error with error details
    trackPlayerNavigate,    // Track Player.Navigate event
    trackPlayerCommand,     // Track Player.Command event
    debounceTrack,          // Create debounced tracker
    setUserId,              // Set authenticated user ID
    getSessionId,           // Get current session ID
    isTelemetryEnabled      // Check if telemetry is active
} from './services/telemetry'

// Track navigation with latency and correlation
trackPlayerNavigate('north', 150, correlationId)

// Track command with action type
trackPlayerCommand('go north', 'move', 100, correlationId)

// Debounce high-frequency events (e.g., typing)
const debouncedTrack = debounceTrack(trackEvent, 300)
debouncedTrack('Typing.Character', { char: 'a' })
```

### Querying Correlated Events

In Application Insights, join frontend and backend events using the correlationId:

```kusto
let correlationId = "your-correlation-id";
union
    (customEvents | where timestamp > ago(1h) and customDimensions.correlationId == correlationId),
    (requests | where timestamp > ago(1h) and customDimensions["x-correlation-id"] == correlationId)
| order by timestamp asc
```

See `docs/observability.md` for full telemetry specifications and dashboard queries.

---

## Authentication

The frontend uses **Azure Static Web Apps (SWA) built-in authentication** with Azure AD (Entra ID) as the identity provider.

### Authentication Flow

**Authentication States:**

- **Loading:** Spinner on homepage until identity resolved.
- **Unauthenticated:** Marketing hero + CTA that calls `signIn('msa')` (redirect to provider).
- **Authenticated:** Personalized welcome panel; nav menu shows Sign Out.

**Sign In / Out:**

- **Sign in:** Redirect to `/.auth/login/<provider>?post_login_redirect_uri=/` (currently using `msa` provider alias).
- **Sign out:** Redirect to `/.auth/logout?post_logout_redirect_uri=/` (broadcasts refresh to other tabs via localStorage event).

**Local Development:**  
Behavior when auth unavailable locally: hook returns `isAuthenticated=false` without throwing errors.

**Planned Enhancements:**  
- Role/claim helpers
- ProtectedRoute component
- Server-side authorization checks in Functions using `x-ms-client-principal`

### Guest Account Linking

Guest players receive a temporary GUID stored in localStorage. When they sign in with a Microsoft account, the guest session is automatically linked to their authenticated identity.

**Flow:**
1. User visits without auth → receives guest GUID
2. User plays as guest (progress saved to GUID)
3. User signs in → `useLinkGuestOnAuth` hook calls `/api/player/link`
4. Backend maps authenticated `externalId` to existing guest GUID
5. User retains all progress from guest session

**Hook Usage:**
```tsx
import { useLinkGuestOnAuth } from '../hooks/useLinkGuestOnAuth'

function MyComponent() {
    const { linking, linked, error } = useLinkGuestOnAuth()
    
    if (linking) return <p>Linking account...</p>
    if (linked) return <p>✓ Account linked!</p>
    if (error) return <p>Link failed: {error}</p>
}
```

### Azure AD (Entra ID) Integration

**Configuration (Single-Tenant):**

The app is currently configured for a single Azure AD tenant; the `openIdIssuer` in `staticwebapp.config.json` is hard-coded to that tenant's v2.0 endpoint. SWA app settings provide runtime values:

- `AAD_CLIENT_ID` (GitHub secret: `AZURE_CLIENT_ID`)
- `AAD_TENANT_ID` (GitHub secret: `AZURE_TENANT_ID`)
- `AAD_CLIENT_SECRET` (optional; only if confidential flow required)

**Local Auth Emulator:**  
The SWA CLI provides a lightweight built-in auth simulation. Real AAD issuer redirects require a dev redirect URI added to the app registration:  
`http://localhost:4280/.auth/login/aad/callback`

**Secret Handling:**
- Rotate the client secret in Entra ID, then update the GitHub secret (no code change required)
- Avoid logging values—only presence/absence
- If reverting to dynamic tenant substitution, remove the hard-coded issuer and restore a placeholder prior to commit

**Future Considerations:**  
If multi-tenant or environment-specific tenant substitution is needed later, reintroduce a `<TENANT_ID>` placeholder and a replacement step inside the deploy workflow.

---

## Accessibility (A11y)

The Shifting Atlas follows **WCAG 2.1 AA** standards to ensure the game is playable by everyone, including users with disabilities.

### Landmarks

**Structure:**

- **Single global `<main id="main">`:** Defined in `App.tsx`; routed pages (e.g., `Homepage`) must NOT introduce additional `<main>` elements.
- **`<nav>` (primary navigation):** Sits above main; footer content is inside the main landmark to guarantee all meaningful content is enclosed by landmarks (axe "region" rule).
- **Decorative wrappers:** Left un-labeled to avoid creating anonymous landmarks (e.g., `.app-root`).

### Focus Management

**RouteFocusManager:**  
Moves focus to the first `<h1>` (or `main` if none) after route changes for screen reader context.

**Skip Link:**  
"Skip to main content" link becomes visible on keyboard focus and targets `#main`.

**Example:**
```tsx
// App.tsx provides global skip link
<a href="#main" className="skip-link sr-only focus:not-sr-only ...">
    Skip to main content
</a>
```

### Live Regions

**LiveAnnouncer:**  
Lives inside `<main>` so announcements are within landmark scope. Command output uses a polite live region to announce results or failures.

**Usage:**
```tsx
// LiveAnnouncer renders globally
<LiveAnnouncer />

// Components can trigger announcements via aria-live regions
<div role="status" aria-live="polite" aria-atomic="true">
    {statusMessage}
</div>
```

### Color & Contrast

**Guidelines:**
- Reduced use of low-contrast `text-slate-500` on dark surfaces
- Replaced with `text-slate-300/400` where needed for readability
- Inline `<code>` tokens styled with darker background and lighter foreground (≥ 4.5:1 ratio)
- All interactive elements meet 3:1 contrast minimum

### ARIA Usage

**Best Practices:**
- Avoid redundant `aria-label` when native semantics suffice
- Status indicators use `aria-hidden` with sibling `role="status"` text for screen readers
- Live regions for dynamic content announcements
- Proper heading hierarchy (`<h1>` → `<h2>` → `<h3>`)

**Example:**
```tsx
// ✅ Good - semantic HTML, no extra ARIA needed
<button onClick={handleClick}>Submit</button>

// ❌ Bad - redundant ARIA
<div role="button" aria-label="Submit button" onClick={handleClick}>Submit</div>

// ✅ Good - ARIA for dynamic status
<div role="status" aria-live="polite">Loading...</div>
```

### Automation

**npm run a11y:**  
Launches a Vite server then executes a custom wrapper (`scripts/run-axe.mjs`) around `@axe-core/cli`.

**Features:**
- Normalizes phantom secondary URL scan issue
- Fails the build ONLY when real violations exist
- Parses JSON reports under `frontend/axe-report`
- Multi-page scanning supported via environment variables:
  - `A11Y_BASE` (default: `http://localhost:5173`)
  - `A11Y_PATHS` comma-separated paths (e.g., `"/,/about,/game"`)
  - Phantom numeric hosts (e.g., `http://0`) are ignored automatically
- Axe report directory created proactively to avoid ENOENT flakes

**Configuration:**
```bash
# Scan multiple pages
A11Y_PATHS="/,/game,/about" npm run a11y

# Change base URL
A11Y_BASE="http://localhost:3000" npm run a11y
```

### Guidelines for New Components

1. **Place core page content inside the existing `<main>`** via composition—do not add new top-level landmarks
2. **Prefer semantic elements** (`section`, `ul`, `button`) over divs + ARIA
3. **Only add `aria-live`** for dynamically inserted messaging not otherwise announced (errors, async results)
4. **Validate with `npm run a11y`** before merging; keep violations at 0 for MVP scope
5. **Test with keyboard only:** Ensure all interactive elements are reachable via Tab and operable via Enter/Space

### Future Enhancements

- Add keyboard trap tests for any future modal/dialog patterns
- Provide reduced-motion alternatives for forthcoming animations
- Introduce end-to-end tests that assert presence & order of landmarks

---

## Progressive Enhancement (Desktop)

Mobile is the baseline (single column, minimal decoration). Larger screens and capable inputs unlock additional presentation without changing underlying semantics.

### Enhancements Added

**Layout:**

- Constrained centered layout (Tailwind `container` + `max-w-7xl`)
- Sticky, translucent nav bar with backdrop blur and border
- Multi-column homepage (12-column CSS grid) on `lg+` with right side panel displaying prototype feeds (static placeholders for future world + player activity)
- Decorative radial background layer behind main content on large screens

**Utility Hooks:**
- `useMediaQuery` - Reactive media query matching
- `usePointerFine` - Detect fine pointer input (mouse vs touch)
- `usePrefersReducedMotion` - Respect user motion preferences

**Typography:**
- Heading size clamp utility `.heading-clamp` (reserved for future hero typography refinements)
- Reduced footer prominence on large screens (smaller text baseline, subtle color shift)

### Philosophy

1. **No critical information is desktop-only**
2. **Enhancements are additive, never required for navigation**
3. **Visual effects avoid motion** when `prefers-reduced-motion: reduce` is present (future animations should read the hook before animating)

### Future Opportunities

- Convert static feed sidebars into live components (websocket or polling → likely Service Bus event fan-out + Function HTTP endpoint aggregator)
- Introduce keyboard shortcut hints panel (only when a physical keyboard is detected)
- Apply per-section entrance transitions (gated by reduced-motion preference)

### Testing Recommendations

1. **Narrow viewport (≤ 640px):** Ensure single column with no sidebars
2. **Expand to ≥ 1024px:** Verify side panel appears and layout stays centered
3. **Toggle prefers-reduced-motion** in OS and confirm absence of new motion (currently none programmatic)
4. **Inspect accessibility tree** to confirm no duplicate landmark roles added by layout wrapper

---

## Notable Files

Quick reference for key files in the project:

| File | Purpose |
|------|---------|
| `index.html` | Vite entry point |
| `src/main.tsx` | React bootstrap + telemetry initialization |
| `src/App.tsx` | Root component with router + global landmarks |
| `src/components/Homepage.tsx` | Landing UI (auth-aware hero + personalized state) |
| `src/components/Nav.tsx` | Navigation bar with sign in/out menu |
| `src/components/GameView.tsx` | Main game interface (location, exits, commands) |
| `src/pages/Game.tsx` | Protected game page (requires auth) |
| `src/services/playerService.ts` | Player GUID bootstrap and persistence |
| `src/services/telemetry.ts` | Application Insights integration |
| `src/utils/apiClient.ts` | API request utilities and GUID validation |
| `src/utils/envelope.ts` | Response envelope unwrapping |
| `src/hooks/useAuth.tsx` | SWA authentication context |
| `src/hooks/usePlayerGuid.ts` | Player session management |
| `tailwind.config.ts` | Tailwind configuration (typed) |
| `tsconfig.json` | TypeScript configuration (strict mode) |
| `vite.config.ts` | Vite build configuration |
| `test/` | All test files (Vitest + happy-dom) |

**Global styles:** `src/tailwind.css` (single source). Typography + Forms plugins enabled.

---

## Roadmap

### Completed (MVP)

- ✅ Guest GUID bootstrap with canonical telemetry
- ✅ Azure AD authentication with guest account linking
- ✅ Command interface with built-in commands (`ping`, `move`, `look`)
- ✅ Responsive layout (mobile-first, desktop enhancements)
- ✅ Accessibility compliance (WCAG 2.1 AA)
- ✅ Application Insights integration with correlation IDs
- ✅ Multi-column game view with location panel and exits compass

### Near-Term (M1-M2)

- Add stateful player session handling (inventory, health, status)
- Introduce UI components for NPC interactions
- Implement optimistic UI updates for player actions
- Add command suggestions/autocomplete
- Enhanced error surface with retry mechanisms
- Loading skeletons for async data fetching

### Mid-Term (M3-M4)

- Real-time location updates (via websockets or polling)
- Description layering visualization (weather, time-of-day effects)
- Player activity feed (sidebar on desktop)
- Command history search and filtering
- Keyboard shortcuts panel
- Toast notification system for world events

### Long-Term (M5+)

- Multiplayer features (see other players in location)
- Quest UI with progress tracking
- Inventory management interface
- Map/minimap visualization
- Character customization
- Mobile app (React Native port)

---

## Questions?

**Documentation Issues:**  
Found something unclear or outdated? Open an issue or submit a PR to improve this documentation.

**Getting Started Help:**  
- Check [Developer Setup](#developer-setup) first
- Review [Testing Guide](#testing-guide) for test patterns
- See [API Integration](#api-integration) for backend communication

**Architecture Questions:**  
- See [Architecture Overview](#architecture-overview) for high-level design
- Review `docs/architecture/overview.md` for full system architecture
- Check `docs/architecture/frontend-api-contract.md` for API contracts

**Contributing:**  
All contributions welcome! Please follow the [Code Conventions](#code-conventions) and ensure all tests pass before submitting a PR.

---

_Last updated: 2025-12-02 (comprehensive frontend architecture documentation)_

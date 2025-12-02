# DescriptionRenderer Integration Guide

## Overview

The `DescriptionRenderer` component renders composable description layers with priority ordering and XSS prevention. It's designed to replace simple text descriptions with rich, layered narratives.

## Component API

```typescript
import DescriptionRenderer from './components/DescriptionRenderer'
import type { DescriptionLayer } from '@piquet-h/shared/types/layerRepository'

interface DescriptionRendererProps {
    /** Array of description layers to compose and render */
    layers: DescriptionLayer[]
    /** Optional CSS class name for custom styling */
    className?: string
    /** Optional callback when XSS attempt is detected */
    onXSSDetected?: (originalContent: string, sanitizedContent: string) => void
}
```

## Layer Structure

Each layer has the following properties:

```typescript
interface DescriptionLayer {
    id: string              // Unique layer identifier (GUID)
    locationId: string      // Location ID (partition key)
    layerType: LayerType    // 'base' | 'ambient' | 'dynamic'
    content: string         // Text content (supports markdown)
    priority: number        // Priority for layer composition (lower = rendered first)
    authoredAt: string      // ISO 8601 timestamp
}
```

## Usage Examples

### Basic Usage

```tsx
// Single layer (base description only)
const layers: DescriptionLayer[] = [
    {
        id: 'layer-base-123',
        locationId: 'loc-1',
        layerType: 'base',
        content: 'An ancient stone chamber with weathered walls.',
        priority: 1,
        authoredAt: '2024-01-01T00:00:00Z'
    }
]

<DescriptionRenderer layers={layers} />
```

### Multiple Layers with Composition

```tsx
// Multiple layers: base + ambient + dynamic
const layers: DescriptionLayer[] = [
    {
        id: 'layer-base-123',
        locationId: 'loc-1',
        layerType: 'base',
        content: 'An ancient stone chamber.',
        priority: 1,
        authoredAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'layer-ambient-456',
        locationId: 'loc-1',
        layerType: 'ambient',
        content: 'The air is thick with dust and silence.',
        priority: 2,
        authoredAt: '2024-01-02T00:00:00Z'
    },
    {
        id: 'layer-dynamic-789',
        locationId: 'loc-1',
        layerType: 'dynamic',
        content: 'A recent fire has scorched the walls black.',
        priority: 3,
        authoredAt: '2024-01-03T00:00:00Z'
    }
]

<DescriptionRenderer layers={layers} />
```

Output will be rendered in priority order:
1. Base layer (priority 1)
2. Ambient layer (priority 2)
3. Dynamic layer (priority 3)

### Rich Text with Markdown

```tsx
const layers: DescriptionLayer[] = [
    {
        id: 'layer-1',
        locationId: 'loc-1',
        layerType: 'base',
        content: `
# The Great Hall

A magnificent chamber with **vaulted ceilings** and *intricate carvings*.

> Ancient inscription: "Those who seek truth shall find only questions."

Key features:
- Towering stone columns
- Stained glass windows
- Marble floor with mosaic patterns
        `,
        priority: 1,
        authoredAt: '2024-01-01T00:00:00Z'
    }
]

<DescriptionRenderer layers={layers} />
```

### XSS Detection Callback

```tsx
const handleXSSDetected = (original: string, sanitized: string) => {
    // Log to telemetry or alert system
    console.error('XSS attempt detected', { original, sanitized })
}

<DescriptionRenderer 
    layers={layers} 
    onXSSDetected={handleXSSDetected}
/>
```

## Integration with GameView

### Current Implementation (Simple Description)

```tsx
// GameView.tsx - Current implementation
<LocationPanel
    name={location?.name ?? ''}
    description={location?.description ?? ''}
    loading={locationLoading}
    error={locationError}
    onRetry={() => fetchLocation(location?.id)}
/>
```

### Future Implementation (With Layers)

When the backend API starts returning layers, update the component:

```tsx
// GameView.tsx - Future implementation with layers
import DescriptionRenderer from './DescriptionRenderer'

interface LocationPanelProps {
    name: string
    layers: DescriptionLayer[]  // Changed from description: string
    loading: boolean
    error: string | null
    onRetry: () => void
}

function LocationPanel({ name, layers, loading, error, onRetry }: LocationPanelProps) {
    // ... loading and error states ...

    return (
        <section className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5" aria-labelledby="location-title">
            <h2 id="location-title" className="text-responsive-xl font-semibold text-white mb-2">
                {name || 'Unknown Location'}
            </h2>
            <DescriptionRenderer layers={layers} />
        </section>
    )
}
```

## Layer Priority Guidelines

Recommended priority ranges:

- **Base layers** (1-10): Permanent location features that never change
- **Ambient layers** (11-20): Contextual details that change slowly (weather, time of day)
- **Dynamic layers** (21-30): Event-driven details that change frequently (fire, NPCs, player actions)

## Security Features

The component automatically:

1. **Sanitizes all HTML** using DOMPurify with strict configuration
2. **Removes malicious script tags** and event handlers
3. **Blocks javascript: protocol** in links
4. **Filters out dangerous attributes** (onclick, onerror, etc.)
5. **Logs XSS attempts** for monitoring

Allowed HTML tags:
- Text formatting: `<strong>`, `<em>`, `<b>`, `<i>`
- Structure: `<p>`, `<br>`, `<h1>`-`<h6>`
- Lists: `<ul>`, `<ol>`, `<li>`
- Code: `<code>`, `<pre>`, `<blockquote>`
- Links: `<a>` (with href and title attributes only)

## Styling

The component uses Tailwind CSS classes consistent with the game's narrative tone:

- Typography: `text-responsive-sm`, `leading-relaxed`
- Colors: `text-slate-300` (main text), `text-slate-400` (empty state)
- Spacing: `space-y-3` (between multiple layers)

Custom styling can be applied via the `className` prop:

```tsx
<DescriptionRenderer 
    layers={layers} 
    className="max-w-prose mx-auto"
/>
```

## Performance Considerations

- **Memoization**: Layer processing is memoized using `useMemo`
- **Single layer optimization**: Single layers render without wrapper divs
- **Empty layer filtering**: Empty/whitespace-only layers are skipped
- **Server-side rendering**: Compatible with SSR using `isomorphic-dompurify`

## Testing

Comprehensive test coverage includes:

- Layer composition and priority sorting
- XSS prevention with malicious content
- Edge cases (single layer, empty layers, no layers)
- HTML rendering and markdown conversion
- CSS styling and accessibility

Run tests:
```bash
npm test -- descriptionRenderer.test.tsx
```

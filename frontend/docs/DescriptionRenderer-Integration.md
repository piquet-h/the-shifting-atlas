# DescriptionRenderer Integration Guide

## Overview

The `DescriptionRenderer` component renders backend-compiled description content with XSS prevention and markdown support. **Layer composition logic resides in the backend**, aligning with Tenet #7 (Narrative Consistency): "AI acts as the Dungeon Master voice. Deterministic code captures state for repeatable play; AI creates immersion and contextual decision-making."

## Component API

```typescript
import DescriptionRenderer from './components/DescriptionRenderer'

interface DescriptionRendererProps {
    /** Pre-compiled description content from backend (may contain markdown) */
    content: string
    /** Content format: 'markdown' converts to HTML, 'html' sanitizes directly */
    format?: 'markdown' | 'html'
    /** Optional CSS class name for custom styling */
    className?: string
    /** Optional callback when XSS attempt is detected */
    onXSSDetected?: (originalContent: string, sanitizedContent: string) => void
}
```

## Architecture Alignment

### Backend Responsibilities (Future)

The backend will implement `DescriptionComposer` service to:

1. **Fetch layers**: Retrieve base + active layers for location
2. **Apply supersede masking**: Hide obsolete base sentences (e.g., gate destroyed)
3. **Filter active layers**: Select ambient layers based on weather/time context
4. **Run validator pipeline**: Safety, structural consistency, redundancy checks
5. **Compile deterministic text**: Assemble layers into single description string
6. **Return compiled content**: Single `compiledDescription` field in API response

### Frontend Responsibilities (Current)

The frontend receives pre-compiled content and:

1. **Sanitizes HTML**: Prevents XSS attacks using isomorphic-dompurify
2. **Converts markdown**: Renders rich text from LLM-generated content
3. **Applies styling**: Preserves narrative tone with responsive typography

## Usage Examples

### Basic Usage

```tsx
// Backend returns compiled description
const response = await fetch('/api/locations/loc-123')
const { compiledDescription } = await response.json()

<DescriptionRenderer content={compiledDescription} format="markdown" />
```

### With XSS Detection Callback

```tsx
const handleXSSDetected = (original: string, sanitized: string) => {
    // Log to telemetry or alert system
    console.error('XSS attempt detected', { original, sanitized })
}

;<DescriptionRenderer content={compiledDescription} format="markdown" onXSSDetected={handleXSSDetected} />
```

### HTML Format

```tsx
// If backend returns pre-sanitized HTML
<DescriptionRenderer content={compiledDescriptionHtml} format="html" />
```

## Integration with GameView

### Current Implementation

```tsx
// GameView.tsx - Current with simple description string
<LocationPanel
    name={location?.name ?? ''}
    description={location?.description ?? ''}
    loading={locationLoading}
    error={locationError}
    onRetry={() => fetchLocation(location?.id)}
/>
```

### Future Implementation (After Backend Compilation)

When the backend implements `DescriptionComposer`:

```tsx
// GameView.tsx - With backend-compiled description
import DescriptionRenderer from './DescriptionRenderer'

interface LocationPanelProps {
    name: string
    compiledDescription: string // Changed from description: string
    format?: 'markdown' | 'html'
    loading: boolean
    error: string | null
    onRetry: () => void
}

function LocationPanel({ name, compiledDescription, format, loading, error, onRetry }: LocationPanelProps) {
    // ... loading and error states ...

    return (
        <section className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5" aria-labelledby="location-title">
            <h2 id="location-title" className="text-responsive-xl font-semibold text-white mb-2">
                {name || 'Unknown Location'}
            </h2>
            <DescriptionRenderer content={compiledDescription} format={format} />
        </section>
    )
}
```

## Backend API Response Shape (Future)

```json
{
    "locationId": "loc-123",
    "name": "Burnt Forest Clearing",
    "compiledDescription": "An ancient stone chamber with weathered walls.\n\nCharred stakes mark where the northern palisade once stood.",
    "compiledDescriptionFormat": "markdown",
    "exits": [{ "direction": "north" }, { "direction": "south" }],
    "provenance": {
        "compiledAt": "2025-12-02T10:30:00Z",
        "layersApplied": ["base", "structural-fire"],
        "supersededSentences": 1,
        "composerVersion": "1.0.0"
    }
}
```

## Backend Compilation Flow (Future)

```
Frontend Request → GET /locations/{id}
  ↓
Backend Handler
  ↓
DescriptionComposer.compileForLocation()
  1. Fetch base layer + active structural/ambient/enhancement layers
  2. Apply supersede masking (structural events hide obsolete base text)
  3. Filter ambient layers based on weather/time context
  4. Run validator pipeline (safety, consistency, redundancy)
  5. Assemble layers in priority order (deterministic composition)
  6. Return compiled description string
  ↓
Frontend
  ↓
DescriptionRenderer receives pre-compiled content
  → Converts markdown to HTML
  → Sanitizes with DOMPurify
  → Renders with narrative styling
```

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

Custom styling can be applied via the `className` prop:

```tsx
<DescriptionRenderer content={compiledDescription} className="max-w-prose mx-auto" />
```

## Performance Considerations

- **Memoization**: Content processing is memoized using `useMemo`
- **Server-side rendering**: Compatible with SSR using `isomorphic-dompurify`
- **Backend compilation**: Reduces frontend complexity and enables caching

## Testing

Test coverage includes:

- XSS prevention with malicious content (script tags, `javascript:`, `onerror`)
- Markdown to HTML conversion (headings, links, blockquotes, code)
- Edge cases (empty content, whitespace)
- Format handling (markdown vs HTML)
- CSS styling and accessibility

Run tests:

```bash
npm test -- descriptionRenderer.test.tsx
```

## Design References

- **Tenet #7 (Narrative Consistency)**: `docs/tenets.md`
- **Description Layering Design**: `docs/design-modules/description-layering-and-variation.md`
- **Event Classification**: `docs/architecture/event-classification-matrix.md`

## Migration Notes

**Current State**: Backend returns simple `description` string field.

**Future State**: Backend will implement `DescriptionComposer` service with:

- Layer fetching and filtering
- Supersede masking logic
- Validator pipeline
- Provenance tracking
- Compiled description output

The frontend component is ready for this transition - it only requires changing the prop name from `description` to `compiledDescription` when the backend is updated.

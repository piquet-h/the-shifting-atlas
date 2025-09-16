---
title: FLOW TITLE
status: draft
version: 0.1.0
authors: ['@handle']
updated: 2025-09-15
related:
    modules: []
    components: []
wireframePrototype: react-live # indicates layout expressed in React instead of external wireframe
exportedImage: # optional static PNG/SVG if needed for clarity
---

# {Flow Title}

## Overview

Short description.

## Trigger

Entry condition (player state, location, prerequisite event).

## Success Criteria

-

## Primary Flow

````
```mermaid
flowchart TD
  S((Start)) --> A[Player Action]
  A --> B{Decision?}
  B -- yes --> C[Branch 1]
  B -- no --> D[Branch 2]
  C --> E((End))
  D --> E
````

```

## Alternate / Failure Paths
| Path | Cause | System Response | Recovery |
|------|-------|-----------------|----------|

## Sequence (System Perspective)
```

```mermaid
sequenceDiagram
  participant P as Player Client
  participant F as Azure Function
  participant Q as Service Bus Queue
  participant G as Cosmos (Gremlin)
  P->>F: HTTP Command
  F->>G: Query Player Node
  F->>Q: Enqueue World Event
  Q-->>F: Ack
  F-->>P: Result JSON
```

```

## Data Touchpoints
| Entity | Operation | Notes |
|--------|-----------|-------|

## Metrics & Telemetry
List events to emit (e.g., `Flow.Entry`, `Flow.Complete`, `Flow.Abort`).

## Open Questions
-

## Iteration Log
| Date | Ver | Change | Rationale | Impact |
|------|-----|--------|-----------|--------|
| 2025-09-15 | 0.1.0 | Initial draft | Baseline | None |
```

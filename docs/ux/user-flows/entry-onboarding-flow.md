---
title: Entry Onboarding Flow
status: draft
version: 1.0.0
authors: ["@copilot-suggested"]
updated: 2025-09-15
related:
  modules: ["navigation-and-traversal", "player-identity-and-roles"]
  components: ["EntryPage", "Nav", "DemoForm"]
wireframePrototype: react-live
exportedImage: ../assets/entry-onboarding-flow.png
---

# Entry Onboarding Flow

## Overview

Guides a first‑time or returning (unauthenticated) player from the landing `EntryPage` into an initial command submission context, establishing a player identity stub if missing.

## Trigger

User hits site root `/` without existing session token.

## Success Criteria

- Player sees navigation bar and an interactive form for initial action.
- A temporary player identity (GUID) is created or retrieved.
- Player can submit a first command (e.g., ping) and receive a server response.

## Primary Flow


```mermaid
flowchart TD
  S((Load /)) --> L[Render EntryPage Component]
  L --> C{Has Player Session?}
  C -- No --> N[Request New Player Identity]
  N --> R[Store GUID locally]
  C -- Yes --> R
  R --> F[Display DemoForm]
  F --> A[Player Submits Command]
  A --> H[HTTP Function /api/ping]
  H --> RESP[Response JSON]
  RESP --> UI[Render Result]
  UI --> E((Ready For Next Command))
````



## Alternate / Failure Paths
| Path | Cause | System Response | Recovery |
|------|-------|-----------------|----------|
| AF1  | Network failure on identity fetch | Show retry banner | Player retries / fallback to offline demo |
| AF2  | Ping function 5xx | Show error toast | Retry / degrade gracefully |

## Sequence (System Perspective)

```mermaid
sequenceDiagram
  participant U as Browser (EntryPage)
  participant A as websiteHttpPlayerActions (Function)
  participant DB as Cosmos (Players)
  U->>U: Load React App
  U->>A: GET /api/player/bootstrap
  A->>DB: g.V(playerGuid) lookup
  DB-->>A: Found or null
  A-->>U: { playerGuid }
  U->>A: POST /api/ping { guid, message }
  A-->>U: { message:"pong", latency }
```

## Data Touchpoints
| Entity | Operation | Notes |
|--------|-----------|-------|
| Players (vertex) | Create if missing | Minimal stub until profile completion |
| Events | (future) enqueue onboarding completion | Not implemented yet |

## Metrics & Telemetry (Planned)
- `Onboarding.Start`
- `Onboarding.IdentityCreated`
- `Onboarding.FirstCommandSuccess`

## Open Questions
- Should we persist a lightweight tutorial state vertex edge immediately?
- Do we gate certain commands until identity confirmation?

## Iteration Log
| Date | Ver | Change | Rationale | Impact |
|------|-----|--------|-----------|--------|
| 2025-09-15 | 1.0.0 | Initial draft | Establish baseline onboarding | None |

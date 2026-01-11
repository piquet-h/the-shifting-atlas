---
title: Movement Handler Integration – Exit Generation Hints
description: Step-by-step integration and testing guidance for Issue #35.
---

# Movement Handler Integration – Exit Generation Hints

Steps:

1. `normalizeDirection(input, lastHeading?, locationContext?)`.
2. If `status === 'ok'`: check EXIT map for canonical `dir`.
3. If EXIT exists: move; emit `Navigation.Move.Success` (or `Navigation.Move.Blocked` on failure).
4. If EXIT missing:
    - Consult debounce store (key: `playerId:originLocationId:dir`).
    - Enqueue hint if not debounced.
    - Emit `Navigation.Exit.GenerationRequested` (with `debounceHit`).
    - Return `{ status: 'generate', canonical, generationHint }` to caller.

Testing:

- Unit: debounce logic and handler return path.
- Integration: in-memory repo confirms no EXIT → generate path.
- Observability: event attributes (dir, originHashed, playerHashed).

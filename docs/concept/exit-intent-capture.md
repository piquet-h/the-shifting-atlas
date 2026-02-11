---
title: Exit Intent Capture (Concept Facet)
description: Complement structural exit pre-generation with runtime capture of organic traversal intent.
---

# Exit Intent Capture

Purpose: Complement structural exit pre-generation with runtime capture of organic traversal intent. When a player inputs a valid canonical direction and no EXIT edge exists, the system returns status `generate` to the caller, emits telemetry `Navigation.Exit.GenerationRequested`, and enqueues a non-blocking expansion hint.

## Exit Availability States

Exits are represented with explicit availability to distinguish traversability from generation intent:

-   **hard**: EXIT edge exists and is traversable.
-   **pending**: Valid direction awaiting generation; player interest captured but no edge materialized yet.
-   **forbidden**: Direction permanently blocked; never enqueue generation (e.g., solid walls, spatial impossibility).

Precedence (data integrity): hard > forbidden > pending. If a direction has both a hard edge and forbidden metadata, hard wins (data error requiring warning telemetry).

## Invariant Additions

-   Intent Capture: A valid canonical direction lacking an EXIT edge triggers non-blocking intent capture (Navigation.Exit.GenerationRequested).
-   Forbidden Exclusion: Directions marked `forbidden` never emit generation hints; movement returns `no-exit` without enqueueing.
-   Debounce: Intent capture is debounced per (player/location/dir) within a short, configurable window to avoid spam.
-   Privacy: Telemetry identifiers are hashed (salted, consistent) for player and location; raw IDs remain internal to queue payloads only.
-   Non-Blocking: HTTP response never awaits queue processing or generation; soft-denial narrative is returned immediately.

## Result Status Extensions

-   `ok` — resolved
-   `ambiguous` — needs heading or semantic disambiguation
-   `unknown` — unresolvable
-   `generate` — valid canonical direction, but no EXIT edge exists; intent captured for expansion

## Related

-   Direction Resolution Rules (canonical set + normalization)
-   Navigation & Traversal Module (movement handler integration)
-   Exit Edge Invariants (`./exits.md`) — structural integrity rules

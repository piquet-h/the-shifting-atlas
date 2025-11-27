---
title: Exit Generation Hints – Architecture
description: Handler, debounce store, telemetry, queue contract, and privacy strategies.
---

# Exit Generation Hints – Architecture

Components:

-   Movement Handler: Checks EXIT existence after normalization; emits telemetry + queues hint on missing.
-   Debounce Store: Per (player/location/dir) TTL window; in-memory for dev; Cosmos SQL for prod.
-   Telemetry: App Insights event `Navigation.Exit.GenerationRequested` (dir, originHashed, playerHashed, debounceHit).
-   Queue: `ExitGenerationHints` with idempotent consumer and longer dedup window.

Privacy:

-   Hashing: `${salt}:${entityId}` → SHA-256; stored only as telemetry attributes; never persisted as authoritative IDs.
-   Separation: Telemetry uses hashed IDs; queue payload can carry raw IDs (internal-only).

Contracts:

-   Payload schema:
    ```json
    {
        "dir": "north",
        "originLocationId": "uuid",
        "playerId": "uuid",
        "timestamp": "ISO-8601",
        "debounced": false
    }
    ```
-   Idempotency key: `${originLocationId}:${dir}`.

Non-Blocking Principle:

-   HTTP handler returns immediately (<500ms p95).
-   Queue emission and debounce decisions happen within request
    without awaiting async generation or processing.

---
title: Navigation & Traversal – Generation Hints
description: How Exit Generation Hints integrate with traversal and fluid UX.
---

# Exit Generation Hints (Issue #35)

Gameplay Flow:

-   Player inputs canonical direction.
-   If EXIT exists → move (synchronous writes per current rules).
-   If EXIT missing → return status `generate` + soft-denial narrative; emit `Navigation.Exit.GenerationRequested`; enqueue expansion hint.

UX Guidance:

-   Never hard “can’t go that way”.
-   Use location-keyed templates or AI-cached narratives for soft-denial (indoor/outdoor/underground/urban contexts).

Pre-Generation Interaction:

-   Pre-generation establishes structural exits conservatively.
-   Generation hints capture desire paths where structure left coherent gaps.
-   Expansion pipeline respects blocked/structural constraints and prioritizes high-demand hints.

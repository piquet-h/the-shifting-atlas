# MVP Azure Architecture

> Status Accuracy (2025-09-21): Frontend shell plus managed API endpoints for ping, guest bootstrap/link, and early location + movement stubs exist. No Cosmos persistence, queues, AI integration, or backend‑app differentiation yet. This document reflects intent while keeping implementation details minimal to avoid drift.

## 🎯 Goals

- **Get to playtesting quickly** with a persistent, navigable world.
- **Keep costs near zero** using Azure free and consumption tiers.
- **Ensure modularity** so systems can evolve without rewrites.
- **Leverage Static Web Apps Managed API** for simplified backend hosting.

---

## 🗺 High-Level Overview

```plaintext
[Player Client]
   |
   v
[Azure Static Web Apps]
   |        \
   |         \---> [Managed API (Azure Functions in SWA)]
   |                   |
   |                   v
   |             [Azure Cosmos DB (Gremlin API and SQL API)]
   |                   |
   |                   v
   |             [Persistent World Graph: Locations, Exits, NPCs, Items, Player State]
   |
   \---> [Optional: Azure OpenAI Service] (AI-assisted content/NPCs)
```

🧩 Core Components

1. Frontend
   Service: Azure Static Web Apps (Free Tier)

Purpose: Serve the game client (text UI or lightweight web app).

Notes:

Auto‑deploy from GitHub.

Built‑in HTTPS and global CDN.

Integrated with Managed API for backend calls.

2. Managed API
   Service: Azure Functions hosted inside Static Web Apps (Consumption Plan).

Purpose (Target State):

- Handle player commands (move, look, take, talk).
- Query/update world state in Cosmos DB.
- Call AI endpoints for dynamic descriptions or NPC dialogue.

Current Reality (summarized): a handful of anonymous HTTP functions (ping, player bootstrap/link, location get/move) in the SWA managed API; experimental second Functions app with only health/ping placeholders.

Authentication (Planned – Not Implemented):

- Use Microsoft Entra External Identities; map `sub` claim to internal Player GUID.
- Enforce server-side role/claim checks inside Functions.

3. Persistence Layer
   Service:
    - Azure Cosmos DB (Gremlin API) for Navigation and Traversal
    - Azure Cosmos DB (SQL API) for Profile based entities (Like users and guilds)

Purpose (Planned):

- Store locations, exits, NPCs, items, and player state as a graph or JSON Entity.
- Enable semantic navigation and relationship queries. Enable XP and attribute updates

Current Reality:

- No runtime code initializes Gremlin client or writes data yet.
- Next concrete step: introduce a minimal `Location` vertex upsert in a new `/api/location` Function.

4. AI Integration
   Service: Azure OpenAI Service (Future Optional)

Status: Not implemented. All descriptions and dialogue will be static stubs until core traversal + persistence exist. This keeps early costs at zero.

### Agentic AI & MCP (Phase 0–1 Insertion Plan)

Instead of directly embedding model calls inside gameplay Functions, initial AI adoption will surface through **MCP (Model Context Protocol) servers** providing strictly read‑only structured data. This ensures early content experiments do not entangle world mutation logic or require refactors later.

Phase 0 (Foundational):

- `world-query-mcp` (location / player / recent event fetch)
- `prompt-template-mcp` (versioned templates; hash governance)
- `telemetry-mcp` (AI usage + decision logging)

Phase 1 (Low-Risk Dynamic Flavor):

- `classification-mcp` (intent + moderation)
- `lore-memory-mcp` (curated lore retrieval – capped dataset)

Deferral: **No mutation tools** (quest generation, NPC dialogue proposals) until a validation module (schema + safety + invariants) is implemented. All early AI output is treated as advisory flavor (e.g., ambience line) and cached with a context hash to control cost.

Cross-reference: `agentic-ai-and-mcp.md` (full roadmap) and `modules/ai-prompt-engineering.md` (prompt lifecycle).

🏗 MVP Core Pillars (Planned → To Be Built)

| Pillar                    | Why It’s Essential         | Status (2025-09-21) | First Increment                               |
| ------------------------- | -------------------------- | ------------------- | --------------------------------------------- |
| World State & Persistence | Continuity & emergent play | Not Implemented     | Single `Location` vertex & fetch endpoint     |
| Navigation & Traversal    | Exploration loop           | Partial (in-memory) | Hardcoded 2-location adjacency in memory      |
| Basic Interaction Loop    | Player agency test         | Not Implemented     | `look` command returning location description |
| Session Context           | Consistent responses       | Not Implemented     | Temporary player GUID issuance (in-memory)    |
| Minimal Content Seed      | Flow validation            | Not Implemented     | Handcrafted starter location + neighbor       |

📜 Suggested Build Order
Skeleton World Model

Define your location schema (ID, description, exits, tags).

Implement persistent storage + retrieval.

Traversal Engine

Wire up movement commands and exit logic.

Confirm state updates are reflected across sessions.

Interaction Commands

Implement a minimal parser for core verbs.

Hardcode a few interactions to prove the loop works.

Basic NPC/AI Hook

Even a single NPC with a fixed dialogue tree will let you test pacing and engagement.

Test Harness

Simple logging of player actions + state changes for debugging and feedback.

🎮 Why This Works for Playtesting
Fast Feedback: You’ll see if navigation feels intuitive before layering complexity.

Low Risk: You’re not over‑investing in content that might get reworked after early feedback.

Extensible: Each system is modular, so you can swap in AI‑generated content, economy systems, or procedural generation later without rewriting the core.

🚀 Deployment Flow
Code Push → GitHub Actions → Deploy frontend + Managed API to Static Web Apps.

Managed API functions connect directly to Cosmos DB and optional AI services.

Cosmos DB pre‑seeded with starter zone (5–10 locations, 1–2 NPCs).

AI Keys stored in Azure App Settings (or Key Vault if added later).

📦 MVP Feature Checklist (Truthful Status)

| Feature                               | Status          | Notes                                            |
| ------------------------------------- | --------------- | ------------------------------------------------ |
| Persistent world graph (Cosmos)       | Not Implemented | No Gremlin client yet                            |
| Player movement between locations     | Not Implemented | Requires traversal model                         |
| Basic interaction verbs               | Not Implemented | Only `ping` exists                               |
| Minimal content seed                  | Not Implemented | No location data                                 |
| Managed API baseline                  | Implemented     | Ping only                                        |
| Optional AI descriptions/NPC dialogue | Not Implemented | Deferred                                         |
| Action logging / telemetry events     | Partial         | App Insights bootstrap present, no custom events |

💰 Cost Control Tips
Use free tiers for Static Web Apps and Cosmos DB.

Keep Managed API on Consumption Plan — pay only per execution.

Limit AI calls during MVP; use static content for most locations.

Monitor with Azure Cost Management.

📈 Immediate Next Implementation Steps (Pre-MVP)

1. Persist minimal Location schema (Cosmos) and adapt `/api/location` to read/write.
2. Extend frontend command interface: `look` uses persisted fetch.
3. Emit telemetry event per command (Location.Get, Location.Move already stubbed—expand for errors).
4. Replace in-memory adjacency with persisted exits; add simple write/upsert admin script.

Later (Post-Core Loop): economy, multi-agent NPC orchestration, procedural expansion, extension/modding API.

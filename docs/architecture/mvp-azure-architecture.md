# MVP Azure Architecture

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
   |             [Azure Cosmos DB (Gremlin API)]
   |                   |
   |                   v
   |             [Persistent World Graph: Rooms, Exits, NPCs, Items, Player State]
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

Purpose:

Handle player commands (move, look, take, talk).

Query/update world state in Cosmos DB.

Call AI endpoints for dynamic descriptions or NPC dialogue.

Benefits:

Single deployment pipeline for frontend + backend.

Automatic authentication/authorization integration with SWA.

Authentication guidance:

- For user authentication and identity management we recommend Microsoft Entra External Identities (consumer & guest scenarios). Entra integrates with Azure Static Web Apps (SWA) and Azure Functions via OIDC/OAuth2 and can provide social federation (Microsoft, Google, Apple, etc.).
- Store minimal profile claims in Entra and map the stable external id (e.g., `sub` claim) to a player GUID stored in Cosmos DB. Validate ID tokens in your Managed API and enforce role/claim checks server-side.

No separate Functions App needed for MVP.

3. Persistence Layer
   Service: Azure Cosmos DB (Gremlin API)

Purpose:

Store rooms, exits, NPCs, items, and player state as a graph.

Enable semantic navigation and relationship queries.

Notes:

Free tier: 400 RU/s + 5GB storage.

Graph model fits your semantic exits + procedural expansion.

4. AI Integration
   Service: Azure OpenAI Service (Pay‑as‑you‑go, low usage)

Purpose:

Generate room descriptions, NPC dialogue, quest text.

Notes:

Keep AI calls optional in MVP — fallback to static content for cost control.

🏗 MVP Core Pillars
These are the non‑negotiables to start meaningful playtesting.

Pillar Why It’s Essential MVP Implementation
World State & Persistence Without persistence, you can’t test continuity, player agency, or emergent storytelling. Minimal persistent datastore (Cosmos DB Gremlin API) storing rooms, exits, and player state.
Navigation & Traversal Movement is the backbone of exploration and pacing. Semantic exits + deterministic coordinates. AI‑generated room descriptions can be layered later.
Basic Interaction Loop Players need something to do beyond moving. Simple verbs: look, move, take, use, talk. Even placeholder NPCs or objects are fine.
Session Context Ensures AI/NPCs respond consistently. Lightweight context manager that pulls relevant world + player state into each interaction.
Minimal Content Seed You need enough world to test flow, not depth. Hand‑crafted starter zone (5–10 rooms) with 1–2 NPCs and 2–3 interactable objects.
📜 Suggested Build Order
Skeleton World Model

Define your room schema (ID, description, exits, tags).

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

Cosmos DB pre‑seeded with starter zone (5–10 rooms, 1–2 NPCs).

AI Keys stored in Azure App Settings (or Key Vault if added later).

📦 MVP Feature Checklist
[x] Persistent world graph in Cosmos DB.

[x] Player movement between rooms.

[x] Basic interaction verbs (look, move, take, talk).

[x] Minimal content seed for testing.

[x] Managed API for backend logic.

[ ] Optional AI‑generated descriptions/NPC dialogue.

[ ] Logging of player actions for feedback.

💰 Cost Control Tips
Use free tiers for Static Web Apps and Cosmos DB.

Keep Managed API on Consumption Plan — pay only per execution.

Limit AI calls during MVP; use static content for most rooms.

Monitor with Azure Cost Management.

📈 Next Steps After MVP
Add Economy & Extension Framework modules.

Implement multi‑agent orchestration for NPCs.

Expand procedural generation for new zones.

Introduce modding API via API Management (if needed for external devs).

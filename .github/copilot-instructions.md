# MMO Project – Copilot Persistent Instructions

## 📜 Purpose
These instructions give GitHub Copilot the always‑on context it needs to generate code and content aligned with our MMO text adventure’s architecture, conventions, and persistent world design.

---

## 🏛 Architecture Overview
- **Frontend:** Azure Static Web Apps (Free Tier) – serves the player client UI.
- **Backend:** Azure Functions (Consumption Plan) – stateless, event‑driven logic.
- **API Gateway:** Azure API Management (Consumption Tier) – routing, throttling, versioning.
- **Messaging:** Azure Service Bus (Basic Tier, free quota) – queues for async world events.
- **Data Layer:** Azure Cosmos DB (Gremlin API, Free Tier) – graph storage for rooms, NPCs, players, and events.
- **Monitoring:** Application Insights (Free quota) – telemetry and diagnostics.

---

## 🧩 Module Structure
- **frontend/** – Static Web App client (React/Vue/Svelte or vanilla JS).
- **backend/** – Azure Functions:
  - `HttpPlayerActions/` – HTTP‑triggered Functions for player commands.
  - `QueueWorldLogic/` – Queue‑triggered Functions for persistent world updates.
  - `shared/` – Shared utilities (Cosmos DB access, validation, constants).
- **docs/** – Design documents (architecture, modules, gameplay, workflow).
- **.github/instructions/** – Module‑specific Copilot instructions.

---

## 🖋 Coding Conventions
- Use **ES modules** for all JS/TS code.
- Function names reflect their role and trigger type (e.g., `HttpMovePlayer`, `QueueProcessNPCStep`).
- Keep Functions **single‑purpose** and **stateless**.
- Cosmos DB collections:
  - `Rooms` – room nodes with semantic exits.
  - `NPCs` – non‑player characters and their state.
  - `Players` – player profiles, inventory, progress.
  - `Events` – queued world events.
- All IDs are **GUIDs**; relationships are stored as Gremlin edges.
- Use **async/await** for all I/O.

---

## 🌍 Persistent World Rules
- **Rooms** persist to Cosmos DB with semantic exits (`north`, `south`, `up`, `down`, etc.).
- **NPC state changes** are processed via Service Bus queue triggers.
- **Player actions** are handled via HTTP‑triggered Functions and may enqueue follow‑up events.
- World updates are **event‑driven**; no polling loops.
- Background logic (economy ticks, NPC patrols) runs only when triggered by queued events.

---

## 🧠 Copilot Usage Guidelines
- When writing new logic, **reference relevant design docs** in `/docs` or `.github/instructions/`.
- For module‑specific rules, open the `.instructions.md` in that module’s folder.
- Maintain **class/function scaffolds** that match design module names for better Copilot inference.
- Inline key excerpts from design docs into code comments before starting new logic.

---

## 🔄 Maintenance
- Update this file whenever architecture, conventions, or persistent rules change.
- Keep `.github/instructions/` in sync with module‑level design docs.
- Treat Copilot as a **tactical generator** – architecture and integration decisions remain human‑led.

---

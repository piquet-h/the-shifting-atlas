## 🎭 Player Identity & Roles

### **Vision**

To give every player a **persistent, evolving identity** in the world — one that is mechanically meaningful, narratively rich, and socially visible. Identity is not just cosmetic; it shapes **how the world reacts**, what opportunities emerge, and how other players perceive and interact with them.

---

## 1. **Character Creation & Evolution**

- **Origin Stories**
    - Players choose or are assigned a **starting background** (e.g., “Exiled Scholar,” “Mercenary of the Eastern Marches,” “Initiate of the Moon Temple”).
    - Backgrounds grant **starting skills, faction leanings, and hidden narrative hooks** that AI can weave into quests.
- **Customizable Archetypes**
    - Base **D&D-style classes** (Fighter, Rogue, Wizard, Cleric, Ranger, Bard, etc.) with **AI-generated sub-class variants** unique to the player’s journey.
    - Sub-classes can emerge dynamically based on playstyle (e.g., a Fighter who uses diplomacy may evolve into a “Knight-Envoy”).
- **Skill Trees & Progression**
    - Class-specific skill trees with **branching specializations**.
    - Skills tied to **D&D mechanics** (e.g., Persuasion, Arcana, Athletics) and used in traversal, dialogue, and combat.
    - AI can seed **rare skill unlocks** through unique events or faction rewards.

---

## 2. **Guilds & Social Structures**

- **Guild Creation & Management**
    - Any player can found a guild after meeting **in-world requirements** (e.g., gold, reputation threshold, or a founding quest).
    - Guilds have **charters** (AI-assisted drafting) that define their ethos, goals, and rules.
- **Guild Roles**
    - Leader, Officer, Quartermaster, Chronicler, Scout, Diplomat — each with **mechanical privileges** and **narrative influence**.
- **Guild Alliances & Rivalries**
    - Alliances can unlock **shared questlines** or **joint control of territory**.
    - Rivalries can trigger **PvP events**, sabotage missions, or political intrigue.
- **Guild Reputation**
    - Separate from individual reputation; affects **how NPC factions treat the group**.
    - AI can generate **guild-specific lore entries** in the world’s codex.

---

## 3. **Alignment & Moral Consequences**

- **Alignment Tracking**
    - Uses a **D&D-inspired axis** (Lawful–Chaotic, Good–Evil) but with **AI nuance** — actions are judged in context, not just binary.
    - Alignment shifts can **unlock or lock** certain quests, NPC relationships, and faction memberships.
- **Moral Weight**
    - AI remembers **key moral decisions** and references them in future encounters.
    - Example: Sparing a defeated enemy might lead to them returning later as an ally — or betraying you.
- **Factional Impact**
    - Alignment influences **religious standing, political trust, and secret society invitations**.

---

## 4. **Reputation Systems**

- **Regional Reputation**
    - Each fiefdom, city, or wilderness region tracks **how much they trust or fear you**.
    - Impacts **market prices, guard tolerance, and quest availability**.
- **Faction Reputation**
    - Separate meters for **religions, political bodies, guilds, and secret organisations**.
    - High reputation can grant **titles, land, or unique gear**; low reputation can lead to **bounties or exile**.
- **Dynamic Reputation Events**
    - AI can trigger **rumor systems** — your deeds spread organically, sometimes distorted.
    - Players can **manipulate reputation** through propaganda, bribes, or staged heroics.

---

## 5. **Identity Persistence & Emergence**

- **Persistent Player Codex Entry**
    - Every player has a **living biography** in the world’s lore codex, updated by AI as they act.
    - Other players and NPCs can **read about your past deeds**.
- **Titles & Honors**
    - Earned through **quests, PvP victories, political appointments, or guild achievements**.
    - Titles can be ceremonial (“Knight of the Silver Grove”) or functional (“Warden of the Eastern Gate”).
- **Secret Identities**
    - Players can operate under **aliases** for espionage, smuggling, or infiltration.
    - Risk of exposure adds **social and narrative tension**.

---

## 6. **Anti-Griefing Identity Safeguards**

- **Reputation Decay for Disruption**
    - Persistent griefing leads to **loss of privileges**, reduced quest rewards, and **NPC avoidance**.
- **Social Consequences**
    - Players with notorious reputations may be **barred from cities**, hunted by bounty hunters, or **forced into outlaw zones**.
- **Redemption Paths**
    - AI generates **atonement quests** for players who want to rebuild their standing.

---

## 7. **Extension Hooks for Developers**

- **Custom Classes & Roles**
    - API for injecting **new class archetypes** with unique skill trees.
- **Guild Tools**
    - Developer-created **guild questlines, headquarters, and political events**.
- **Reputation Modifiers**
    - Extensions can add **new factions, religions, or regional reputations**.

---

## 8. **Visual Identity Inference & Portrait Generation**

- **AI-Inferred Visual Profile**
    - The system infers a player’s visual identity from **class, background, alignment, reputation, and prior interactions** — no need for manual input.
    - Portraits evolve over time to reflect **gear upgrades, moral shifts, factional ties, and narrative milestones**.
- **Visual Metadata Schema**
    - Structured attributes include **race/species, gender presentation, age, build, skin tone, hair, eyes, facial features, clothing style, armor type, weapons, accessories, magical effects, pose, expression, and environmental cues**.
    - Metadata is updated dynamically as the player’s story unfolds.
- **Portrait Generation Goals**
    - Aim for a "That’s exactly what I imagined!" reaction — portraits should feel **emotionally resonant and narratively grounded**.
    - Visuals are generated in sync with codex updates, ensuring **continuity and immersion**.

---

## 9. **Visual Identity Inference Pipeline**

- **Raw Gameplay Data**
    - Class, subclass, level, gear, background, faction, region, quest outcomes, reputation scores.

- **Narrative & Behavioural Tags**
    - Combat style, dialogue tone, moral alignment shifts, key decisions, social role, notoriety.

- **Structured Visual Metadata**
    - Inferred attributes: race/species, build, clothing style, gear quality, magical effects, expression, pose, environmental context.

- **Prompt-Ready Description**
    - Final output: a richly descriptive, emotionally resonant prompt for the portrait generator — aligned with current codex entry and player arc.

---

## Identity & Authentication (platform guidance)

For production and realistic playtests we recommend using Microsoft Entra External Identities to manage player authentication and identity. Entra External Identities supports consumer and guest scenarios, federated social logins, and standard OIDC/OAuth2 flows and integrates well with Azure Static Web Apps and Azure Functions.

Integration notes:

- Use Entra for sign-up/sign-in and federation (Microsoft, Google, Apple, etc.) and keep the canonical player profile in Cosmos DB (linked by a stable external id such as the Entra `sub` claim or a custom claim).
- Validate ID tokens server-side in your Managed API (Azure Functions). Verify issuer, audience, expiry, and signature.
- Map Entra claims to minimal in-game attributes (displayName, email_verified) and store game-specific state separately (GUIDs, inventory, reputation) to avoid coupling game state to identity provider data.
- For role-based or admin operations, use Entra groups or custom claims and enforce checks in Functions (do not trust client-side role flags).

See `docs/architecture/mvp-azure-architecture.md` and `docs/developer-workflow/local-dev-setup.md` for SWA + Functions integration and local testing tips.

---

### **Example Player Arc**

> A player begins as a **Chaotic Good Ranger** from the Frostwood. They found the **Emerald Pathfinders Guild**, gaining allies in the Northern Fiefdoms. After siding with a rebel faction, their **Lawful reputation drops**, but they gain **underground contacts**. Years later, their codex entry marks them as _“The Shadow Warden”_, a title whispered in both reverence and fear.

1. Interaction Capture & Normalisation
   (What raw player behaviour we observe, before interpretation)
   1.1 Player Action Modes

Explicit Dialogue Mode

Turn-by-turn conversation
High-fidelity behavioural signal capture

Implicit / Fast‑Forward Mode

Player states intent (“buy apples”)
Dialogue is simulated, not rendered

1.2 Observable Behavioural Signals (Per Turn)

Politeness / hostility
Verbosity (longform vs concise)
Negotiation tendency (haggle vs accept)
Use of force vs process
Emotional expression (neutral, urgent, angry)
Risk posture (cautious vs reckless)

1.3 Canonical vs Non‑Canonical Data

Canonical: world state changes, inventory, location, contracts
Non‑Canonical: dialogue phrasing, tone, inferred intent

2. Player Behaviour Profiling
   (Stable abstraction of “how this player tends to act”)
   2.1 Player Interaction Profile (Persistent)

Structured summary of player style
Examples:

Default tone
Typical verbosity
Negotiation likelihood
Conflict aversion
Rule adherence

2.2 Signal Aggregation Rules

Rolling average, not per‑turn evaluation
Confidence scoring attached to profile
No updates from simulated-only interactions

2.3 Separation of Concerns

Profile affects how NPCs respond
Profile does not constrain available actions

3. NPC Interpretation & Simulation
   (How the world reacts when behaviour is implicit)
   3.1 NPC Disposition Model

Traits: agreeableness, suspicion, greed, lawfulness
Gossip propensity as a persistent trait

3.2 Interaction Resolution Logic

Combine:

Player Interaction Profile
NPC traits
Local context (scene, culture, risk)

3.3 Dialogue Collapsing Rules

Skip explicit conversation when:

No branching risk
No moral ambiguity
No irreversible failure

Still generate:

Inventory changes
Ledger entries
NPC micro‑memory updates

4. Memory Stratification
   (Where different kinds of “remembering” live)
   4.1 World State (Canonical)

Locations
Items
Currency
Contracts / reservations
Quest flags

4.2 NPC Micro‑Memory (Subjective, Persistent)

NPC ↔ Player relationship state
Anchors (“sold map”, “paid fairly”)
Relationship deltas (trust, affinity)
Beliefs (with confidence, decay)

4.3 Scene Ephemeral Context (Short‑lived)

Atmosphere
Crowd mood
Recent notable actions
TTL‑based decay

5. Alignment System (Declarative Evaluation Model)
   (Why the player behaves the way they said they would)
   5.1 Alignment as Declaration, Not Constraint

Player declares intended moral posture
System evaluates coherence, not correctness

5.2 Alignment Axes (Continuous)

Law ↔ Chaos
Good ↔ Evil (or equivalent ethos axes)
Stored as vectors, not labels

5.3 Observed vs Declared Alignment

Observed behaviour projected onto alignment axes
Coherence measured over time
No single‑action penalties

6. XP & Reward Modulation
   (Incentivising intentional role‑play)
   6.1 XP Calculation Model

Base XP unchanged (combat, exploration, objectives)
Alignment coherence acts as multiplier / bonus pool

6.2 Reward Philosophy

Reward consistency, not virtue
Lawful Evil ≠ punished
Chaotic Good ≠ random outcomes

6.3 Drift Handling

Gradual decay of alignment coherence
No automatic alignment reassignment
Narrative prompts if drift becomes persistent

7. Time Compression & Narrative Pacing
   (Letting the game speed up and slow down naturally)
   7.1 Interaction Speeds

Role‑play (high fidelity)
Guided (partial collapse)
Fast‑forward (pure simulation)

7.2 Pacing Control Rules

Slow down when:

Stakes rise
Ambiguity increases
Character conflict emerges

Speed up when:

Outcomes are routine
Player intent is clear

8. Guardrails & Failure Modes
   (What prevents the system from becoming brittle or unfair)
   8.1 Alignment Guardrails

No per‑turn judgement
No “alignment violation” punishments
Minimum sample window for coherence eval

8.2 Tone & Behaviour Guardrails

Never update Player Interaction Profile

from simulated-only actions

Confidence weighting before behaviour changes apply

8.3 Persistence Guardrails

Idempotent deltas
Atomic writes per store
Narrative only claims committed state

9. Meta Design Invariant
   (The one sentence that holds the whole system together)

The game never tells the player how to behave.
It quietly rewards them for being the kind of character they said they were.

# Character-Driven Roleplaying Philosophy

> STATUS: FOUNDATIONAL PRINCIPLE (2025-11-11)
>
> **Reference**: [ADD for 5e Players: What Drove Me Away](https://sage-jim.com/2023/05/20/add-for-5e-players-what-drove-me-away/)

## Principle

The Shifting Atlas embraces **character-driven roleplaying** over skill-based mechanics. Players describe actions based on **who their character is** rather than selecting from universal skill lists. The AI Dungeon Master adjudicates outcomes narratively, considering character background, context, and fiction rather than numerical proficiencies.

## Core Tenets

1. **Identity Over Statistics**: Character capability flows from background, profession, and narrative history—not from standardized skill ratings
2. **Narrative Declaration**: Players say "I draw on my experience as a former cartographer to read these ancient maps" rather than "I roll Cartography"
3. **Contextual Adjudication**: The DM interprets plausibility based on established character fiction and situational logic
4. **Emergent Expertise**: Characters gain recognized capabilities through play and storytelling, not point allocation
5. **Fiction-First Resolution**: Outcomes prioritize narrative coherence over mechanical consistency

## What This Means in Practice

### Instead of Universal Skills (5e-style)

-   ❌ "Roll Investigation to search the room"
-   ❌ Proficiency bonuses in Athletics, Persuasion, Arcana

### Character-Driven Approach

-   ✅ "As a former thief, I know where merchants hide valuables—I check the false bottom of the strongbox"
-   ✅ "My time as a ship's navigator taught me to read star charts—I examine the constellation map for clues"
-   ✅ "Having grown up in noble courts, I recognize the subtle power dynamics and address the duchess with proper deference"

The AI DM evaluates these declarations against:

-   **Character background** (established in creation or play)
-   **Narrative coherence** (does this fit their story?)
-   **Situational plausibility** (is this reasonable here?)
-   **World consistency** (does this align with established facts?)

## Integration with The Shifting Atlas

### Player Commands

Players issue natural language commands that describe **what their character does and why they can do it**:

```
Command: "I climb the wall—my years working the rigging on merchant ships taught me to find handholds others miss."

AI DM Response: "Your sailor's instincts serve you well. You spot a weathered seam in the stonework that would be invisible to most, and make steady progress upward..."
```

### Background as Capability

Character backgrounds (see `explorer-creation-future.md`) grant narrative authority rather than numerical bonuses:

-   **Former Cartographer's Apprentice**: Can interpret maps, recognize cartographic conventions, navigate by landmarks
-   **Ex-Mercenary**: Understands combat tactics, weapon maintenance, military hierarchy
-   **Temple Initiate**: Knows religious symbolism, ritual protocols, theological history

### AI Interpretation

The AI Dungeon Master (governed by `dungeon-master-style-guide.md`) interprets declarations using:

1. **Plausibility check**: Does character background support this?
2. **Contextual factors**: Time pressure, resources, opposition
3. **Narrative tension**: What makes the best story?
4. **Consistency**: Has this character shown this capability before?

### No Mechanical Skill System

The Shifting Atlas **does not implement**:

-   Universal skill lists (Persuasion, Investigation, Athletics)
-   Skill proficiency bonuses or numerical ratings
-   Ability score modifiers for skill checks
-   Skill point allocation or leveling systems

### What We Do Instead

-   **Freeform narrative declarations** parsed for intent (see `player-interaction-and-intents.md`)
-   **Background tags** stored as character metadata
-   **AI adjudication** based on contextual plausibility
-   **Emergent recognition** through gameplay ("You've proven yourself a skilled climber through repeated demonstrations")

## Contrast with D&D 5e Approach

| D&D 5e Universal Skills                             | Character-Driven Roleplaying              |
| --------------------------------------------------- | ----------------------------------------- |
| Fixed skill list (Acrobatics, Arcana, Athletics...) | Open-ended based on character concept     |
| Proficiency bonus (+2 to +6)                        | Narrative plausibility judgment           |
| Roll d20 + modifier vs DC                           | AI evaluates declaration coherence        |
| Skills purchased/assigned at creation               | Capabilities emerge from background story |
| Same mechanics for all characters                   | Each character unique based on fiction    |

## Design Implications

### Character Creation (M5+)

-   Background selection grants **narrative authorities** not **skill points**
-   Players write **capability statements**: "I can... because I used to..."
-   No standardized skill selections

### Command Parsing (PI-0 through PI-5)

-   Intent parser focuses on **action description** not **skill invocation**
-   Extract **reasoning/justification** from player text
-   Pass context to AI for plausibility evaluation

### AI Prompt Engineering

-   DM prompts include **character background summary**
-   Adjudication instructions emphasize **fiction consistency**
-   Avoid "skill check" language in favor of "character capability assessment"

## Benefits

1. **Richer Characterization**: Players think about who their character is, not what boxes they checked
2. **Emergent Stories**: Backgrounds create natural adventure hooks and specialized knowledge
3. **Reduced Metagaming**: No optimal skill distribution calculations
4. **Accessibility**: New players don't need to learn skill system rules
5. **Narrative Flexibility**: DM can improvise based on player creativity
6. **Unique Characters**: No two "rogues" or "wizards" are mechanically identical

## Risks & Mitigations

| Risk                                      | Mitigation                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| Inconsistent adjudication                 | Track established capabilities; AI references player history           |
| Player confusion (expecting skill checks) | Clear onboarding explaining philosophy; examples in tutorial           |
| "I can do anything" syndrome              | Background must be established; DM can request clarification           |
| Comparative unfairness                    | All players judged by same narrative standard; no mechanical advantage |

## Related Documentation

-   **DM Style Guide**: `dungeon-master-style-guide.md` (narrative voice)
-   **Player Interaction**: `player-interaction-and-intents.md` (command parsing)
-   **Explorer Creation**: `explorer-creation-future.md` (background system)
-   **AI Prompt Engineering**: `ai-prompt-engineering.md` (adjudication prompts)
-   **Narrative Governance**: `narration-governance.md` (bounded creativity)

## Change Log

| Date       | Change                       | Rationale                                                                                                                                         |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2025-11-11 | Initial principle documented | Adopt character-driven roleplaying philosophy from [sage-jim.com article](https://sage-jim.com/2023/05/20/add-for-5e-players-what-drove-me-away/) |

---

_This principle informs all future systems involving player capability, action resolution, and character progression._

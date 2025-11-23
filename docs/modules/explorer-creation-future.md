## 🎒 Explorer Creation: Future Vision

> STATUS: FUTURE / NOT IMPLEMENTED (2025-10-19). This document outlines the planned D&D-style character creation experience that will expand beyond the current simple GUID allocation. Referenced by bootstrap regression tests (backend/test/playerBootstrap.flow.test.ts).

### **Vision**

Transform the current single-click "Create Your Explorer" flow into a rich, interactive character creation experience inspired by D&D character builders. Players will craft unique explorers with meaningful attributes, backgrounds, and starting conditions that shape their journey through The Shifting Atlas.

---

## 1. **Creation Flow Phases**

### Phase 1: Origin & Background

> **Philosophy Note**: Backgrounds grant **narrative authorities** rather than numerical skill bonuses. See [`../concept/character-driven-roleplaying.md`](../concept/character-driven-roleplaying.md) for the foundational principle.

-   **Starting Background Selection**
    -   Choose from narrative backgrounds (e.g., "Exiled Scholar," "Wanderer of the Eastern Wastes," "Former Cartographer's Apprentice")
    -   Each background provides:
        -   Unique starting narrative hook
        -   **Narrative capability authorities** (not mechanical bonuses)
        -   Starting location preference
        -   Hidden quest seeds for AI to weave into gameplay
-   **Customization**
    -   Brief questionnaire about motivations (exploration, combat, lore discovery, social interaction)
    -   Responses shape initial reputation with factions and starting equipment

#### Background as Narrative Authority

**What Backgrounds Do NOT Provide**:

-   ❌ Skill point bonuses (+2 to Navigation, +1 to Perception)
-   ❌ Numerical proficiency ratings
-   ❌ Mechanical advantage in rolls or checks

**What Backgrounds DO Provide**:

-   ✅ Narrative justification for capabilities
-   ✅ Contextual knowledge and expertise
-   ✅ Character-specific approaches to challenges
-   ✅ AI DM consideration during action adjudication

**Example Background Authorities**:

| Background                       | Narrative Capabilities                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Former Cartographer's Apprentice | Interpret maps, recognize geographic symbols, estimate distances from landmarks, navigate by celestial observation, understand surveying techniques |
| Exiled Scholar                   | Research ancient texts, recall historical precedents, identify scholarly conventions, academic protocol, library navigation                         |
| Wanderer of the Eastern Wastes   | Desert survival, water finding, heat endurance, sand navigation, nomadic culture knowledge, desert predator behavior                                |
| Former Sailor                    | Rope work, swimming in rough water, weather reading, ship operation, port knowledge, nautical terminology, tide prediction                          |
| Temple Initiate                  | Religious texts interpretation, ritual knowledge, sacred architecture, theological history, meditative focus, prayer etiquette                      |
| Street Urchin                    | Urban navigation, crowd blending, picking pockets, spotting marks, escape routes, street rumors, thieves' cant                                      |
| Court Diplomat                   | Noble etiquette, political intrigue, heraldry recognition, formal negotiation, reading social power dynamics, courtly dance                         |
| Wilderness Scout                 | Animal tracking, foraging identification, survival techniques, terrain assessment, weather prediction, silent movement                              |

**Implementation Pattern**:

When a player with the "Former Cartographer's Apprentice" background says:

```
"I examine the ancient map to determine our route"
```

The AI DM receives context:

```json
{
    "playerBackground": "Former Cartographer's Apprentice",
    "narrativeCapabilities": ["Interpret maps", "Recognize cartographic conventions", "Estimate distances from landmarks"],
    "playerAction": "examine ancient map to determine route",
    "adjudicationMode": "character-driven"
}
```

And evaluates: "Does this character's background support map interpretation? YES → narrate success with character-specific flavor"

Not: "Roll Cartography skill check vs DC 15"

### Phase 2: Explorer Class/Archetype

> **Note**: Classes provide **conceptual frameworks** for character identity, not mechanical power levels. All capability assessment remains character-driven and contextual.

-   **Base Classes** (D&D-inspired archetypes)
    -   **Cartographer**: Specializes in navigation, mapping, and environmental awareness
    -   **Scout**: Focuses on observation, tracking, and awareness of surroundings
    -   **Wanderer**: Emphasizes survival, adaptability, and resilience
    -   **Chronicler**: Centers on lore discovery, documentation, and knowledge
    -   **Pathfinder**: Excels at trailblazing, route finding, and terrain understanding
    -   **Emissary**: Skilled in communication, diplomacy, and social dynamics
-   **Class Identity Benefits**
    -   Suggested **narrative capability clusters** appropriate to the archetype
    -   Thematic framing for character actions
    -   AI DM uses class identity as additional context for adjudication
    -   Visual/aesthetic customization options

**Important**: Classes do NOT provide:

-   Mechanical bonuses or penalties
-   Restricted access to actions
-   Superior effectiveness vs other classes

All classes are narratively equal; choice reflects **how you approach challenges**, not **how effective you are**.

### Phase 3: Attributes & Narrative Qualities

> **Character-Driven Approach**: Instead of numerical attributes that modify rolls, explorers have **descriptive qualities** that inform AI adjudication. See [`../concept/character-driven-roleplaying.md`](../concept/character-driven-roleplaying.md).

-   **Core Qualities** (descriptive, not numerical)
    -   **Perceptiveness**: Notice hidden details, environmental clues, subtle changes
    -   **Endurance**: Physical resilience, stamina, resistance to fatigue
    -   **Intellect**: Problem-solving, memory, pattern recognition, learning
    -   **Presence**: Social impact, force of personality, confidence
    -   **Agility**: Physical coordination, reaction speed, balance
    -   **Wisdom**: Intuition, judgment, experiential knowledge, common sense
-   **Expression Method**
    -   Players describe their character's qualities narratively rather than assigning numbers
    -   Example: "My explorer has keen perception from years of night watch duty, but struggles with social situations"
    -   AI DM interprets these descriptors contextually during play
-   **Alternative: Relative Descriptors**
    -   Instead of point-buy, use comparative terms: "Exceptional," "Strong," "Average," "Weak"
    -   Players distribute these across qualities to create a profile
    -   No numerical modifiers; purely narrative context for AI

**Key Difference from Traditional Systems**:

-   ❌ NOT: "Perception 14 gives +2 modifier to Perception checks"
-   ✅ INSTEAD: "Perceptive explorers notice details others miss—the AI DM considers this when evaluating observation attempts"

### Phase 4: Starting Equipment & Resources

-   **Equipment Packs**
    -   Light pack: Minimal gear, faster movement, emphasis on finding resources
    -   Standard pack: Balanced starting equipment
    -   Prepared pack: Extra supplies, slower initial movement, better survival tools
-   **Starting Currency**
    -   Small amount of gold/silver for initial purchases
    -   Amount varies by background (e.g., exiled nobles might start with more)
-   **Heirloom Item** (optional)
    -   Choose one special item tied to background
    -   Provides minor mechanical benefit and narrative significance
    -   May unlock special quest or dialogue options

### Phase 5: Appearance & Identity

-   **Visual Customization**
    -   Avatar selection or custom description
    -   Appearance affects NPC first impressions (subtle modifiers)
-   **Naming**
    -   Explorer name (visible to others in multiplayer)
    -   Optional title/epithet (earned or chosen)
-   **Personal Goal**
    -   Select or write a personal quest objective
    -   AI uses this to personalize generated content
    -   Examples: "Map the entire Western Frontier," "Uncover my family's lost expedition," "Establish a guild of explorers"

---

## 2. **UX Considerations**

### Quick Start Path

-   **"Skip Creation" Option**: For players who want immediate gameplay
    -   Generates a balanced explorer with random but sensible choices
    -   Can revisit and customize later at "Explorer's Guild Hall" or similar location
    -   Preserves progress and allows full re-customization once

### Progressive Creation

-   **Multi-Step Wizard**: Guided flow with 5-6 screens
    -   Each step clearly labeled with progress indicator
    -   "Back" navigation allows revisiting previous choices
    -   Preview panel shows how choices affect starting state
-   **Estimated Time**: 3-5 minutes for thorough creation, <1 minute for quick start
-   **Save & Continue Later**: Partial progress saved to allow breaks

### Accessibility

-   **Screen Reader Support**: All choices clearly labeled with ARIA attributes
-   **Keyboard Navigation**: Full keyboard support for all selection interfaces
-   **Color Independence**: Don't rely on color alone to convey information
-   **Reduced Motion**: Respect prefers-reduced-motion settings

---

## 3. **Technical Implementation Notes**

### Data Model

```jsonc
{
  "id": "<playerGuid>",
  "type": "Player",
  "created": {
    "utc": "2025-10-19T00:00:00Z",
    "method": "full-creation" | "quick-start" | "legacy"
  },
  "explorer": {
    "name": "Aria Stormchaser",
    "class": "Pathfinder",
    "background": "Former Cartographer's Apprentice",
    // Character-driven approach: narrative capabilities, not numerical stats
    "narrativeCapabilities": [
      "Interpret maps and cartographic symbols",
      "Navigate by celestial observation",
      "Estimate distances from landmarks",
      "Understand surveying techniques"
    ],
    "qualities": {
      // Descriptive rather than numerical (or use relative descriptors)
      "perceptiveness": "Strong - years of reading terrain features",
      "endurance": "Average",
      "intellect": "Exceptional - formal cartographic training",
      "presence": "Weak - more comfortable with maps than people",
      "agility": "Strong",
      "wisdom": "Average"
    },
    "startingEquipment": "standard-pack",
    "heirloomItem": "compass-of-lost-places",
    "personalGoal": "Discover the lost city of Aethermoor",
    "characterHistory": "Apprenticed to the Royal Cartographer before the expedition that changed everything..."
  },
  "guest": true,
  "currentLocationId": "<starting-location-based-on-background>"
}
```

### Storage

-   Creation choices stored in Player document (Cosmos DB SQL API)
-   Narrative capabilities and qualities provide context for AI adjudication (not mechanical modifiers)
-   Background seeds initial quest generation via AI prompts
-   Character history and capabilities referenced in DM prompt context

### Integration Points

-   **Backend**: Expand `/api/player/bootstrap` or create `/api/player/create-explorer`
-   **Frontend**: New multi-step creation wizard component
-   **AI Prompts**: Include explorer details in world generation context
-   **Telemetry**: Track creation funnel completion, popular choices, time spent

---

## 4. **Phased Rollout Plan**

### Phase 1: MVP (Post-Authentication)

-   Simple class selection (3-5 classes)
-   Basic attribute point allocation
-   Name and appearance
-   Single starting location for all players

### Phase 2: Rich Backgrounds

-   Full background system with narrative hooks
-   Multiple starting locations based on background
-   Equipment pack selection
-   Integration with AI prompt system

### Phase 3: Skills & Progression

-   Character capability recognition system
-   Emergent capabilities through demonstrated actions
-   AI tracks and references player's established abilities
-   Tutorial demonstrating character-driven action declaration

### Phase 4: Advanced Features

-   Heirloom items
-   Personal goal system with AI integration
-   Guild/faction starting affiliations
-   Multiplayer starting party option

---

## 5. **Relationship to Current System**

### Current Bootstrap Flow

-   **Location**: `frontend/src/hooks/usePlayerGuid.ts` → `GET /api/player/bootstrap`
-   **Behavior**: Simple GUID allocation, no choices, instant
-   **Result**: Guest player with default attributes, random starting location

### Future Enhanced Flow

-   **Trigger**: After clicking "Create Your Explorer" button on homepage
-   **Location**: New route `/create-explorer` with wizard component
-   **Behavior**: Multi-step guided creation, personalized experience
-   **Result**: Rich explorer profile with chosen attributes and background
-   **Backward Compatibility**: Quick start option mimics current behavior

### Migration Path

-   Existing guest players keep their simple profiles
-   "Upgrade your explorer" prompt appears for legacy profiles
-   Optional one-time re-creation that preserves progress
-   New players always go through enhanced creation (or quick start)

---

## 6. **Open Questions & Future Considerations**

1. **Respec/Recreation**: Should players be able to reset their explorer attributes later? If so, with what cost?
2. **Multiclass**: Allow players to train in multiple classes over time?
3. **Visual Avatar**: 2D portraits, 3D models, or text descriptions only?
4. **Shared Creation**: Multiplayer parties create explorers together with synergies?
5. **Seasonal Explorers**: Special temporary explorers for events?
6. **Permadeath Mode**: Hardcore explorers with different creation options?

---

## 7. **Cross-References**

-   **Player Identity Module**: `docs/modules/player-identity-and-roles.md` - Broader identity system including guilds, alignment, reputation
-   **Onboarding Flow**: `docs/ux/user-flows/entry-onboarding-flow.md` - Current homepage flow, authentication, and future creation expansion notes (section "Explorer Creation vs Sign In Flow")
-   **Player Interaction**: `docs/modules/player-interaction-and-intents.md` - How explorer skills affect command parsing
-   **Bootstrap Tests**: `backend/test/playerBootstrap.flow.test.ts` - Regression tests for current simple bootstrap that will expand to cover creation flow

---

## 8. **Success Metrics**

When implemented, track:

-   **Creation Completion Rate**: % of players who complete creation vs quick start
-   **Time to First Command**: Ensure enhanced creation doesn't delay gameplay too much
-   **Class Distribution**: Are all classes appealing or do some dominate?
-   **Customization Engagement**: How many players customize vs accept defaults?
-   **Retention Impact**: Do players with created explorers show higher retention?
-   **Return to Edit**: How often do players want to modify their explorer later?

---

_Last Updated: 2025-10-19_  
_Status: Planning / Not Implemented_  
_Related Issues: #110 (bootstrap regression tests), #7 (bootstrap mechanics), #24 (bootstrap bug fix)_

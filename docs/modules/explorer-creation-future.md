## 🎒 Explorer Creation: Future Vision

> STATUS: FUTURE / NOT IMPLEMENTED (2025-10-19). This document outlines the planned D&D-style character creation experience that will expand beyond the current simple GUID allocation. Referenced by bootstrap regression tests (backend/test/playerBootstrap.flow.test.ts).

### **Vision**

Transform the current single-click "Create Your Explorer" flow into a rich, interactive character creation experience inspired by D&D character builders. Players will craft unique explorers with meaningful attributes, backgrounds, and starting conditions that shape their journey through The Shifting Atlas.

---

## 1. **Creation Flow Phases**

### Phase 1: Origin & Background
- **Starting Background Selection**
  - Choose from narrative backgrounds (e.g., "Exiled Scholar," "Wanderer of the Eastern Wastes," "Former Cartographer's Apprentice")
  - Each background provides:
    - Unique starting narrative hook
    - Initial skill modifiers
    - Starting location preference
    - Hidden quest seeds for AI to weave into gameplay
- **Customization**
  - Brief questionnaire about motivations (exploration, combat, lore discovery, social interaction)
  - Responses shape initial reputation with factions and starting equipment

### Phase 2: Explorer Class/Archetype
- **Base Classes** (D&D-inspired)
  - **Cartographer**: Navigation and mapping bonuses, environmental awareness
  - **Scout**: Stealth, perception, and tracking abilities
  - **Wanderer**: Survival skills, adaptability to terrain
  - **Chronicler**: Lore discovery, documentation, linguistic abilities
  - **Pathfinder**: Trailblazing, discovering new routes, terrain modification
  - **Emissary**: Diplomatic skills, faction relations, persuasion
- **Class Benefits**
  - Starting skill proficiencies
  - Unique traversal or interaction abilities
  - Special relationship with world generation (e.g., Cartographers might reveal hidden exits)
  
### Phase 3: Attributes & Skills
- **Core Attributes** (simplified D&D-style)
  - **Perception**: Notice hidden details, environmental clues
  - **Endurance**: Traverse difficult terrain, resist fatigue
  - **Intellect**: Solve puzzles, decipher ancient texts
  - **Charisma**: Influence NPCs, negotiate with factions
  - **Agility**: Navigate hazards, quick reactions
  - **Wisdom**: Intuition, survival instincts, pattern recognition
- **Point Allocation**
  - Standard array or point-buy system
  - Classes suggest recommended distributions but allow flexibility
- **Starting Skills**
  - Each class grants proficiency in 3-4 skills
  - Additional skill from background
  - Skills affect command success probabilities and unlock special actions

### Phase 4: Starting Equipment & Resources
- **Equipment Packs**
  - Light pack: Minimal gear, faster movement, emphasis on finding resources
  - Standard pack: Balanced starting equipment
  - Prepared pack: Extra supplies, slower initial movement, better survival tools
- **Starting Currency**
  - Small amount of gold/silver for initial purchases
  - Amount varies by background (e.g., exiled nobles might start with more)
- **Heirloom Item** (optional)
  - Choose one special item tied to background
  - Provides minor mechanical benefit and narrative significance
  - May unlock special quest or dialogue options

### Phase 5: Appearance & Identity
- **Visual Customization**
  - Avatar selection or custom description
  - Appearance affects NPC first impressions (subtle modifiers)
- **Naming**
  - Explorer name (visible to others in multiplayer)
  - Optional title/epithet (earned or chosen)
- **Personal Goal**
  - Select or write a personal quest objective
  - AI uses this to personalize generated content
  - Examples: "Map the entire Western Frontier," "Uncover my family's lost expedition," "Establish a guild of explorers"

---

## 2. **UX Considerations**

### Quick Start Path
- **"Skip Creation" Option**: For players who want immediate gameplay
  - Generates a balanced explorer with random but sensible choices
  - Can revisit and customize later at "Explorer's Guild Hall" or similar location
  - Preserves progress and allows full re-customization once

### Progressive Creation
- **Multi-Step Wizard**: Guided flow with 5-6 screens
  - Each step clearly labeled with progress indicator
  - "Back" navigation allows revisiting previous choices
  - Preview panel shows how choices affect starting state
- **Estimated Time**: 3-5 minutes for thorough creation, <1 minute for quick start
- **Save & Continue Later**: Partial progress saved to allow breaks

### Accessibility
- **Screen Reader Support**: All choices clearly labeled with ARIA attributes
- **Keyboard Navigation**: Full keyboard support for all selection interfaces
- **Color Independence**: Don't rely on color alone to convey information
- **Reduced Motion**: Respect prefers-reduced-motion settings

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
    "attributes": {
      "perception": 14,
      "endurance": 12,
      "intellect": 15,
      "charisma": 10,
      "agility": 13,
      "wisdom": 11
    },
    "skills": ["Navigation", "Cartography", "Survival", "Perception"],
    "startingEquipment": "standard-pack",
    "heirloomItem": "compass-of-lost-places",
    "personalGoal": "Discover the lost city of Aethermoor"
  },
  "guest": true,
  "currentLocationId": "<starting-location-based-on-background>"
}
```

### Storage
- Creation choices stored in Player vertex (Cosmos DB SQL API)
- Attributes and skills affect command parsing and success probabilities
- Background seeds initial quest generation via AI prompts

### Integration Points
- **Backend**: Expand `/api/player/bootstrap` or create `/api/player/create-explorer`
- **Frontend**: New multi-step creation wizard component
- **AI Prompts**: Include explorer details in world generation context
- **Telemetry**: Track creation funnel completion, popular choices, time spent

---

## 4. **Phased Rollout Plan**

### Phase 1: MVP (Post-Authentication)
- Simple class selection (3-5 classes)
- Basic attribute point allocation
- Name and appearance
- Single starting location for all players

### Phase 2: Rich Backgrounds
- Full background system with narrative hooks
- Multiple starting locations based on background
- Equipment pack selection
- Integration with AI prompt system

### Phase 3: Skills & Progression
- Detailed skill system
- Starting skill choices
- Skill checks in commands
- Tutorial that demonstrates skill usage

### Phase 4: Advanced Features
- Heirloom items
- Personal goal system with AI integration
- Guild/faction starting affiliations
- Multiplayer starting party option

---

## 5. **Relationship to Current System**

### Current Bootstrap Flow
- **Location**: `frontend/src/hooks/usePlayerGuid.ts` → `GET /api/player/bootstrap`
- **Behavior**: Simple GUID allocation, no choices, instant
- **Result**: Guest player with default attributes, random starting location

### Future Enhanced Flow
- **Trigger**: After clicking "Create Your Explorer" button on homepage
- **Location**: New route `/create-explorer` with wizard component
- **Behavior**: Multi-step guided creation, personalized experience
- **Result**: Rich explorer profile with chosen attributes and background
- **Backward Compatibility**: Quick start option mimics current behavior

### Migration Path
- Existing guest players keep their simple profiles
- "Upgrade your explorer" prompt appears for legacy profiles
- Optional one-time re-creation that preserves progress
- New players always go through enhanced creation (or quick start)

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

- **Player Identity Module**: `docs/modules/player-identity-and-roles.md` - Broader identity system including guilds, alignment, reputation
- **Onboarding Flow**: `docs/ux/user-flows/entry-onboarding-flow.md` - Current homepage flow, authentication, and future creation expansion notes (section "Explorer Creation vs Sign In Flow")
- **Player Interaction**: `docs/modules/player-interaction-and-intents.md` - How explorer skills affect command parsing
- **Bootstrap Tests**: `backend/test/playerBootstrap.flow.test.ts` - Regression tests for current simple bootstrap that will expand to cover creation flow

---

## 8. **Success Metrics**

When implemented, track:
- **Creation Completion Rate**: % of players who complete creation vs quick start
- **Time to First Command**: Ensure enhanced creation doesn't delay gameplay too much
- **Class Distribution**: Are all classes appealing or do some dominate?
- **Customization Engagement**: How many players customize vs accept defaults?
- **Retention Impact**: Do players with created explorers show higher retention?
- **Return to Edit**: How often do players want to modify their explorer later?

---

_Last Updated: 2025-10-19_  
_Status: Planning / Not Implemented_  
_Related Issues: #110 (bootstrap regression tests), #7 (bootstrap mechanics), #24 (bootstrap bug fix)_

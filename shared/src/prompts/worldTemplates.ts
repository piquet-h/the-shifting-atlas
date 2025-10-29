// World prompt templates externalized from .github/instructions/world/.instructions.md
// Keep templates concise; reference lore docs by filename instead of embedding large blocks.

export const LOCATION_TEMPLATE = `Generate a [terrain_type] location connected to [existing_location].
Consider: faction_control=[faction], climate=[season], political_tension=[current_events]
Include: 2-3 exits (semantic descriptions), ambient details, potential encounters
Maintain: established lore, D&D mechanics integration`

export const NPC_DIALOGUE_TEMPLATE = `Generate dialogue for [npc_name] ([faction], [alignment]).
Context: [current_world_events], [player_reputation]
Include: personality_traits, skill_check_opportunities, faction_perspective
Maintain: character_consistency, lore_accuracy`

export const QUEST_TEMPLATE = `Create a [quest_type] for [location/faction].
Difficulty: [player_level_range]
Integration: [current_storylines], [faction_conflicts]
Include: multiple_solutions, skill_check_variety, lore_references`

// Future: add faction event, seasonal shift, and dynamic economy templates as needed.

export type WorldPromptKey = 'location' | 'npc_dialogue' | 'quest'

export function getWorldTemplate(key: WorldPromptKey): string {
    switch (key) {
        case 'location':
            return LOCATION_TEMPLATE
        case 'npc_dialogue':
            return NPC_DIALOGUE_TEMPLATE
        case 'quest':
            return QUEST_TEMPLATE
        default:
            throw new Error(`Unknown world prompt key: ${key}`)
    }
}

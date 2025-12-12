/**
 * ActionRegistry: Duration tables for player actions.
 *
 * Provides deterministic action duration lookup supporting gameplay balance and narrative pacing.
 * Per Tenet #7: Deterministic baseline durations for state capture, with future AI contextual enhancement.
 */

/**
 * Represents a modifier that can adjust action duration based on context.
 */
export interface ActionModifier {
    /** Condition expression (e.g., "inventory_weight > 50") */
    condition: string
    /** Multiplier to apply to base duration (e.g., 1.5 for 50% slower) */
    multiplier: number
}

/**
 * Represents a registered action with its time cost.
 */
export interface ActionDuration {
    /** Unique action type identifier (e.g., "move", "look", "rest") */
    actionType: string
    /** Base duration in milliseconds */
    baseDurationMs: number
    /** Optional context-dependent modifiers */
    modifiers?: ActionModifier[]
}

/**
 * Registry interface for looking up and managing action durations.
 */
export interface IActionRegistry {
    /**
     * Get the duration for an action type with optional context.
     * @param actionType The type of action (e.g., "move", "look")
     * @param context Optional context for modifier evaluation (e.g., { inventory_weight: 75 })
     * @returns Duration in milliseconds
     */
    getDuration(actionType: string, context?: Record<string, unknown>): number

    /**
     * Register a new action type or update existing one.
     * @param action The action duration definition
     */
    registerAction(action: ActionDuration): void
}

/**
 * Default duration returned for unknown action types (1 minute).
 */
const DEFAULT_DURATION_MS = 60000

/**
 * In-memory action registry implementation.
 */
export class ActionRegistry implements IActionRegistry {
    private actions: Map<string, ActionDuration>

    constructor() {
        this.actions = new Map()
        this.initializeDefaultActions()
    }

    /**
     * Initialize registry with default action durations from spec.
     */
    private initializeDefaultActions(): void {
        const defaultActions: ActionDuration[] = [
            { actionType: 'move', baseDurationMs: 60000 }, // 1 minute
            { actionType: 'move_overland', baseDurationMs: 3600000 }, // 1 hour
            { actionType: 'move_long_distance', baseDurationMs: 86400000 }, // 1 day
            { actionType: 'look', baseDurationMs: 5000 }, // 5 seconds
            { actionType: 'examine', baseDurationMs: 30000 }, // 30 seconds
            { actionType: 'rest', baseDurationMs: 28800000 }, // 8 hours
            { actionType: 'battle_round', baseDurationMs: 6000 }, // 6 seconds (D&D convention)
            { actionType: 'idle', baseDurationMs: 0 } // No time cost (drift applies instead)
        ]

        for (const action of defaultActions) {
            this.actions.set(action.actionType, action)
        }
    }

    /**
     * Get duration for an action type with optional context for modifier evaluation.
     */
    getDuration(actionType: string, context?: Record<string, unknown>): number {
        const action = this.actions.get(actionType)

        if (!action) {
            // Unknown action type: return default duration
            // TODO: Emit warning telemetry (deferred - telemetry integration pending)
            console.warn(`Unknown action type "${actionType}", returning default duration ${DEFAULT_DURATION_MS}ms`)
            return DEFAULT_DURATION_MS
        }

        let duration = action.baseDurationMs

        // Apply modifiers if context provided
        if (context && action.modifiers) {
            for (const modifier of action.modifiers) {
                if (this.evaluateCondition(modifier.condition, context)) {
                    duration *= modifier.multiplier
                }
            }
        }

        return duration
    }

    /**
     * Register a new action or update existing one.
     */
    registerAction(action: ActionDuration): void {
        this.actions.set(action.actionType, action)
    }

    /**
     * Evaluate a simple condition expression against context.
     * Supports basic comparisons: property > value, property < value, property === value
     * Returns false for invalid syntax.
     */
    private evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
        try {
            // Simple condition parser for MVP
            // Supports: "property > value", "property < value", "property >= value", "property <= value", "property === value"
            // Also supports boolean flags: "property" (truthy check)

            const trimmed = condition.trim()

            // Check for comparison operators
            const comparisonMatch = trimmed.match(/^(\w+)\s*(>=|<=|>|<|===|==)\s*(.+)$/)
            if (comparisonMatch) {
                const [, property, operator, valueStr] = comparisonMatch
                const contextValue = context[property]
                const targetValue = this.parseValue(valueStr.trim())

                if (contextValue === undefined) {
                    return false
                }

                switch (operator) {
                    case '>':
                        return Number(contextValue) > Number(targetValue)
                    case '<':
                        return Number(contextValue) < Number(targetValue)
                    case '>=':
                        return Number(contextValue) >= Number(targetValue)
                    case '<=':
                        return Number(contextValue) <= Number(targetValue)
                    case '===':
                    case '==':
                        return contextValue === targetValue
                    default:
                        return false
                }
            }

            // Boolean flag check (e.g., "is_wounded")
            const property = trimmed
            if (/^\w+$/.test(property)) {
                return Boolean(context[property])
            }

            // Invalid syntax
            console.error(`Invalid condition syntax: "${condition}"`)
            return false
        } catch (error) {
            console.error(`Error evaluating condition "${condition}":`, error)
            return false
        }
    }

    /**
     * Parse value from string (handles numbers, booleans, strings).
     */
    private parseValue(value: string): unknown {
        // Try parsing as number
        const num = Number(value)
        if (!isNaN(num)) {
            return num
        }

        // Try parsing as boolean
        if (value === 'true') return true
        if (value === 'false') return false

        // Return as string (remove quotes if present)
        return value.replace(/^["']|["']$/g, '')
    }
}

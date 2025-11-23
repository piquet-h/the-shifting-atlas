/**
 * Feature flags module (post dual-persistence decommission, ADR-004).
 * Dual persistence / Gremlin player vertex flag removed; player storage is now
 * exclusively SQL API. Retained minimal API surface so existing startup code
 * emitting FeatureFlag.Loaded can continue to function with an empty snapshot.
 */

export function getFeatureFlagSnapshot(): Record<string, boolean> {
    // No runtime player storage flags remain.
    return {}
}

export interface FeatureFlagValidationWarning {
    flagName: string
    rawValue: string
    defaultValue: boolean
}

export function getValidationWarnings(): FeatureFlagValidationWarning[] {
    return []
}

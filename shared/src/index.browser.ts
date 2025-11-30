// Browser-focused entry point for @atlas/shared
// Exposes only symbols that are safe for frontend bundles (excludes Node/AppInsights backend telemetry initialization).
// If additional shared types/utilities are needed in the frontend, add re-exports here cautiously, ensuring they have no Node built-in dependencies.
export * from './telemetryEvents.js'
export * from './telemetryAttributes.js'

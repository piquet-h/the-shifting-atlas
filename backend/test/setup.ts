/**
 * Test Setup - Minimal configuration for test environment
 *
 * Integration tests explicitly control persistence mode via getTestContainer(mode),
 * so no local.settings.json loading is required.
 *
 * This file remains as a placeholder for any future test-wide setup needs.
 */

// Set NODE_ENV if not already set (defensive)
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'test'
}

console.log('✓ Test environment initialized (no local.settings.json required)')

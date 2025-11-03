# ExternalId Conflict Policy

## Overview

Player identity linking ensures that each external identity (from authentication providers like Entra/Azure AD) can only be linked to a single player account. This prevents identity confusion and maintains data integrity.

## Conflict Detection

The `linkExternalId` repository method now detects conflicts when:

- An `externalId` is already linked to a different player
- A second player attempts to link the same `externalId`

## Behavior

### Repository Level (`IPlayerRepository.linkExternalId`)

See `backend/src/repos/playerRepository.ts` for interface definition and return type structure.

**Scenarios:**

1. **Successful Link** (first time linking unique externalId): `updated: true` with player record
2. **Idempotent Re-link** (same player, same externalId): `updated: false`, no timestamp mutation
3. **Conflict** (externalId already linked to different player): `conflict: true` with existing player ID

### HTTP API Level (`POST /api/player/link`)

**Request/Response Contracts:**  
See `@piquet-h/shared/apiContracts` for `PlayerLinkRequest` and `PlayerLinkResponse` type definitions.

All responses follow the ApiEnvelope pattern (see `shared/src/domainModels.ts`):
- Success: `{ success: true, data: PlayerLinkResponse, correlationId?: string }`
- Error: `{ success: false, error: { code: string, message: string }, correlationId?: string }`

**HTTP 409 Conflict:**  
Error code: `ExternalIdConflict`

This allows clients to detect when an externalId is already linked to a different player and implement appropriate UI flows

### Auto-Link Flow (`ensurePlayerForRequest`)

When automatically linking a player during SWA authentication:

- If conflict detected: Falls back to creating a new guest player
- Rationale: Preserves availability during rare race conditions
- Future enhancement: Could log for investigation or emit telemetry

## Test Coverage

- **Conflict Detection**: Verifies 409 response when linking externalId to second player
- **Idempotency**: Confirms re-linking same externalId to same player doesn't change `updatedUtc`
- **Repository Tests**: Both in-memory and Cosmos implementations tested

## Telemetry

Onboarding telemetry events maintain correlation IDs across:

- `Onboarding.GuestGuid.Started`
- `Onboarding.GuestGuid.Created`
- `Onboarding.GuestGuid.Completed`

This enables analytics on:

- Onboarding funnel completion rates
- Latency distribution per phase
- Guest-to-authenticated conversion patterns

## Design Decisions

### Why No Auto-Merge?

When a conflict is detected (guest player tries to link an externalId already owned by another player), we do NOT automatically merge accounts because:

1. **Data Integrity**: Merging requires careful consideration of which player's data to preserve
2. **Security**: Could enable account takeover vectors if not handled carefully
3. **User Intent**: User may have created multiple accounts intentionally

Future iterations may add explicit "merge accounts" flows with user confirmation.

### Why Idempotent Behavior?

Re-linking the same externalId to the same player is treated as a no-op:

- No mutation of data occurs
- `updatedUtc` remains unchanged
- Simplifies client retry logic
- Reduces unnecessary database updates

## Related

- Issue #103 (closed): Player Persistence Enhancement (foundation)
- Issue #121 (closed): Player Persistence Hardening (this implementation)
- ADR-002: Dual Persistence (Cosmos SQL + Gremlin)

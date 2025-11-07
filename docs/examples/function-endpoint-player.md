# Example: Azure Function Endpoint (Player Bootstrap)

Practical example of a minimal Azure Function HTTP endpoint for player onboarding.

---

## Purpose

The `/api/player` endpoint provides a canonical entry point for retrieving or creating a player session GUID. Guest players receive a stable identifier on first visit (cookie-backed).

---

## Code Location

**Function definition**: `backend/src/functions/player.ts`
**Handler logic**: `backend/src/handlers/bootstrapPlayer.ts`

---

## Function Structure

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { bootstrapPlayerHandler } from '../handlers/bootstrapPlayer.js'

// Thin alias endpoint to provide a canonical /api/player entry point for session GUID retrieval.
export async function playerHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    return bootstrapPlayerHandler(req, context)
}

app.http('player', {
    route: 'player',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: playerHandler
})
```

---

## Key Patterns

### 1. Thin Function Wrapper
The function file (`player.ts`) is minimal—it registers the HTTP trigger and delegates to a handler. This pattern:
- Keeps function definitions stateless
- Enables handler reuse and testing
- Separates routing configuration from business logic

### 2. Handler Delegation
Business logic lives in `handlers/` folder:
```typescript
// backend/src/handlers/bootstrapPlayer.ts
export async function bootstrapPlayerHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    // Validation, persistence, telemetry
}
```

### 3. Stateless Design
Functions do not maintain session state:
- Player GUID stored in client cookie (or database for authenticated users)
- No server-side sessions or affinity required
- Horizontal scaling enabled

---

## Typical Flow

1. **Client Request**: `GET /api/player`
2. **Function Receives**: HTTP request + invocation context
3. **Handler Logic**:
   - Check for existing player GUID (cookie or auth token)
   - If missing: generate new GUID, persist to Cosmos DB (future)
   - Return player GUID in response
4. **Telemetry**: Emit `Player.Bootstrap` event
5. **Client Stores**: Set cookie with player GUID

---

## Testing Locally

```bash
# Start backend Functions host
cd backend
npm start

# Test endpoint
curl http://localhost:7071/api/player
```

**Expected response**:
```json
{
  "playerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "isGuest": true
}
```

---

## Authentication Levels

| Level       | Description                                  | Use Case                    |
| ----------- | -------------------------------------------- | --------------------------- |
| `anonymous` | No authentication required                   | Guest player onboarding     |
| `function`  | Requires function key in query string/header | Internal services           |
| `admin`     | Requires master key                          | Sensitive operations        |

**Current endpoint**: `authLevel: 'anonymous'` (allows guest players)

---

## Telemetry Integration

Functions automatically emit telemetry to Application Insights:
- **Requests**: HTTP status, duration, route
- **Dependencies**: Cosmos DB calls (future)
- **Custom Events**: Imported from `backend/src/telemetry.ts`

Example custom event:
```typescript
import { trackEvent } from '../telemetry.js'

trackEvent('Player.Bootstrap', {
    playerId: newGuid,
    isGuest: true
})
```

---

## Related Examples

- [Example: Gremlin Traversal Query](./gremlin-traversal-query.md)
- [Example: Seed Script Usage](./seed-script-usage.md)
- [Example: Accessibility Test Run](./accessibility-test-run.md)

---

## Related Documentation

| Topic                   | Document                                       |
| ----------------------- | ---------------------------------------------- |
| Player Identity Module  | `../modules/player-identity-and-roles.md`      |
| Backend Architecture    | `../architecture/mvp-azure-architecture.md`    |
| Telemetry Standards     | `../observability.md`                          |
| Player Bootstrap Flow   | `../developer-workflow/player-bootstrap-flow.md` |

---

_Last updated: 2025-11-07 (initial creation for MECE documentation hierarchy)_

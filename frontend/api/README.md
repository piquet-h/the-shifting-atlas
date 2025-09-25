# Website API (Azure Functions, TypeScript)

Co‑located Functions backing the Static Web App frontend. Currently provides onboarding (guest GUID), basic room retrieval & movement stubs, and diagnostics (ping).

## Functions

| Name              | Source File                        | Route               | Methods    | Description                                                                 |
| ----------------- | ---------------------------------- | ------------------- | ---------- | --------------------------------------------------------------------------- |
| `Ping`            | `src/functions/ping.ts`            | `/ping`             | GET / POST | Latency + echo diagnostic (client can supply ?name= or body).               |
| `playerBootstrap` | `src/functions/playerBootstrap.ts` | `/player/bootstrap` | GET        | Allocates or confirms a guest player GUID (idempotent via `x-player-guid`). |
| `playerLink`      | `src/functions/playerLink.ts`      | `/player/link`      | POST       | Links a guest GUID to simulated external identity.                          |
| `RoomGet`         | `src/functions/room.ts`            | `/room`             | GET        | Returns a room (defaults to starter).                                       |
| `RoomMove`        | `src/functions/room.ts`            | `/room/move`        | GET        | Moves along an exit (?from= & ?dir=) – in‑memory stub.                      |

## Development

```
npm install
npm run build
npm start   # builds then launches Azure Functions host
```

### Cleaning Build Artifacts

The `clean` script uses a small Node one‑liner (built‑in `fs.rmSync`) instead of `rimraf` so CI does not depend on a devDependency being hoisted into this workspace. This avoids the previous GitHub Actions failure (`rimraf: not found`) while remaining cross‑platform for any Node 18+ environment.

Edit TypeScript in `src/`. Build outputs to `dist/`. Re‑run `npm run build` (or add a watch script) after adding function files. Prefer running via the SWA emulator from the repo root (`npm run swa`) for integrated local testing.

### Source‑Based Deployment (Preferred)

The Static Web Apps configuration now points `apiLocation` directly at `frontend/api`, so Azure builds the Functions project from source. Advantages:

| Benefit                | Details                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Simpler pipeline       | No pre-build bundling or manual copy of `host.json` required.                                                              |
| Clearer debugging      | Source maps and original TS layout available during investigation.                                                         |
| Consistent graph build | Monorepo reference build (`tsconfig.refs.json`) still works locally, but SWA/Oryx can compile the API independently in CI. |

Operational notes:

1. Local dev via SWA CLI: `npm run swa:dev` at repo root (serves frontend + sources API).
2. CI deploy: Ensure you do NOT override `api_location` to `frontend/api/dist`; keep it as `frontend/api`.
3. To slim deployment size later, consider adding a bundling/esbuild step; keep it optional behind a script (e.g. `npm run bundle:api`).

## Handler Pattern

```ts
import {app} from '@azure/functions'
app.http('Example', {
    route: 'website/example',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (req, ctx) => {
        const data = await req.json()
        ctx.log('Payload', data)
        return {status: 201, jsonBody: {received: true}}
    }
})
```

## Notes

- Use `jsonBody` for JSON responses.
- Input helpers: `req.query.get('param')`, `await req.json()`.
- Keep this layer thin; move heavier simulation logic to the future dedicated backend when queue triggers / longer processing emerge.
- Add new endpoints with `app.http("Name", { route, methods, handler })` in a new file under `src/functions/`.

### Guest -> Auth Upgrade (Sign In Trigger)

Flow summary:

1. Client obtains/stores a guest GUID via `GET /api/player/bootstrap` (see `usePlayerGuid`).
2. User initiates sign in (Azure Static Web Apps auth) via `/.auth/login/...`.
3. After authentication the React app detects `isAuthenticated` and calls `POST /api/player/link` with `{ playerGuid }`.
4. The `playerLink` function marks the in-memory record `guest=false` and stores an `externalId` (simulated header `x-external-id`). Repeat calls are idempotent and return `alreadyLinked=true`.
5. A localStorage flag `tsa.playerGuidLinked` prevents duplicate link attempts on future renders.

Telemetry events emitted (MVP placeholders):

- `Onboarding.GuestGuidCreated` on initial bootstrap
- `Auth.UpgradeSuccess` when a guest is successfully linked

Future: replace in-memory store with Cosmos DB graph persistence and derive `externalId` from SWA provided principal claims.

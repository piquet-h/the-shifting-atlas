# Website API (Azure Functions, TypeScript)

Co‑located Functions backing the Static Web App frontend. Currently exposes a health endpoint + placeholder player action dispatcher.

## Functions

| Name                       | Source File                       | Route                     | Methods  | Description                             |
| -------------------------- | --------------------------------- | ------------------------- | -------- | --------------------------------------- |
| `WebsiteHealthCheck`       | `src/websiteHealthCheck.ts`       | `/website/health`         | GET      | Returns service status JSON.            |
| `WebsiteHttpPlayerActions` | `src/websiteHttpPlayerActions.ts` | `/website/player/actions` | GET/POST | Placeholder for player action dispatch. |

## Development

```
npm install
npm run build
npm start   # builds then launches Azure Functions host
```

Edit TypeScript in `src/`. Build outputs to `dist/`. Re‑run `npm run build` (or add a watch script) after adding function files. Prefer running via the SWA emulator from the repo root (`npm run swa`) for integrated local testing.

## Handler Pattern

```ts
import { app } from '@azure/functions';
app.http('Example', {
    route: 'website/example',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (req, ctx) => {
        const data = await req.json();
        ctx.log('Payload', data);
        return { status: 201, jsonBody: { received: true } };
    },
});
```

## Notes

- Use `jsonBody` for JSON responses.
- Input helpers: `req.query.get('param')`, `await req.json()`.
- Keep this layer thin; move heavier simulation logic to the future dedicated backend.
- Add new endpoints with `app.http("Name", { route, methods, handler })` in a new file under `src/`.

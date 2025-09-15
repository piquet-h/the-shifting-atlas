# Website API (Azure Functions v4, TypeScript)

TypeScript Azure Functions that back the Static Web App frontend. Provides basic health + player action placeholder endpoints.

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

Edits occur in `src/` (TypeScript). Build emits to `dist/` and `package.json#main` points to `dist/index.js`.

After adding new function files, re-run `npm run build` (or rely on a watcher if configured) before starting the host.

## Handler Pattern

```ts
import { app } from "@azure/functions";
app.http("Example", {
  route: "website/example",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req, ctx) => {
    const data = await req.json();
    ctx.log("Payload", data);
    return { status: 201, jsonBody: { received: true } };
  },
});
```

## Notes

- Use `jsonBody` for JSON responses.
- Use `req.query.get('param')` or `await req.json()` for input.
- Keep this API focused on lightweight website interactions; deeper game mechanics should live in the main backend Functions app.
- To add another endpoint, create a `src/<descriptiveName>.ts` and register via `app.http("Name", { route, methods, handler })`.

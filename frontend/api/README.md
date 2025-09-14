# Website API (Azure Functions v4, TypeScript)

TypeScript Azure Functions that back the Static Web App frontend. Provides basic health + player action placeholder endpoints.

## Functions

| Name                       | Route                     | Methods  | Description                             |
| -------------------------- | ------------------------- | -------- | --------------------------------------- |
| `WebsiteHealthCheck`       | `/website/health`         | GET      | Returns service status JSON.            |
| `WebsiteHttpPlayerActions` | `/website/player/actions` | GET/POST | Placeholder for player action dispatch. |

## Development

```
npm install
npm run build
npm start   # builds then launches Azure Functions host
```

Edits occur in `src/` (TypeScript). Build emits to `dist/` and `package.json#main` points to `dist/index.js`.

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
- Extend with queues/events later for world logic.

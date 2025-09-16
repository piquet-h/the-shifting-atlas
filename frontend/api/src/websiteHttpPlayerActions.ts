/**
 * WebsiteHttpPlayerActions
 * Placeholder dispatch endpoint for simple player-related actions exposed to the public website UI.
 * This is intentionally minimal; real game logic lives in backend Functions + queues.
 */
import { app } from '@azure/functions';

interface PlayerActionRequest {
  action: string;
  payload?: unknown;
}

app.http('WebsiteHttpPlayerActions', {
  route: 'website/player/actions',
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (req) => {
    if (req.method === 'GET') {
      return {
        jsonBody: {
          message: 'Player actions endpoint (placeholder)',
          supported: ['echo'],
        },
      };
    }

    let body: PlayerActionRequest | undefined;
    try {
      body = (await req.json()) as PlayerActionRequest;
    } catch {
      return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
    }

    if (!body || !body.action) {
      return { status: 400, jsonBody: { error: "Missing 'action' field" } };
    }

    switch (body.action) {
      case 'echo':
        return { status: 200, jsonBody: { ok: true, echo: body.payload } };
      default:
        return { status: 400, jsonBody: { error: 'Unsupported action' } };
    }
  },
});

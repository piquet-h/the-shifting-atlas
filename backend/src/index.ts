/*
 * Azure Functions Backend Entry Point (TypeScript)
 * Registers initial HTTP functions. Extend using additional files or folders and update package.json main glob if needed.
 */
import { app, InvocationContext, HttpRequest, HttpResponseInit } from '@azure/functions';

app.http('BackendHealth', {
  route: 'backend/health',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    context.log('Backend health checked');
    return { jsonBody: { status: 'ok', service: 'backend-core' } };
  },
});

app.http('BackendPing', {
  route: 'backend/ping',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const msg = req.query.get('msg') || 'pong';
    context.log('Ping request', msg);
    return { jsonBody: { reply: msg } };
  },
});

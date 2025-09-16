import { app } from '@azure/functions';

app.http('Ping', {
  route: 'ping',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (_req, ctx) => {
    const now = new Date().toISOString();
    ctx.debug('Healthcheck Ping,', { now });
    return {
      status: 200,
    };
  },
});

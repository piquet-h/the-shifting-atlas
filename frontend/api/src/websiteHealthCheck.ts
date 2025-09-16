/**
 * WebsiteHealthCheck
 * Simple HTTP-triggered Azure Function returning service status.
 * Mirrors docs pattern in README.
 */
import { app } from '@azure/functions';

app.http('WebsiteHealthCheck', {
    route: 'website/health',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (_req, ctx) => {
        const now = new Date().toISOString();
        ctx.log('WebsiteHealthCheck invoked', { now });
        return {
            jsonBody: {
                status: 'ok',
                service: 'website-api',
                time: now,
                version: process.env.WEBSITE_API_VERSION || '0.1.0',
            },
        };
    },
});

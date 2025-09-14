import { app } from '@azure/functions'
import healthCheckHandler from './HealthCheck/index.js'
import httpPlayerActionsHandler from './HttpPlayerActions/index.js'

app.http('WebsiteHealthCheck', {
  route: 'website/health',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: healthCheckHandler
})

app.http('WebsiteHttpPlayerActions', {
  route: 'website/player/actions',
  methods: ['GET','POST'],
  authLevel: 'anonymous',
  handler: httpPlayerActionsHandler
})

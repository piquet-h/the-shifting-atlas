import { InvocationContext, HttpRequest } from '@azure/functions'

// In v4 model we receive the Request first; if not used we omit typing import to reduce churn
export async function healthCheckHandler(_request: HttpRequest, context: InvocationContext) {
  context.log('Website API HealthCheck called')
  return {
    status: 200,
    jsonBody: { status: 'ok', service: 'the-shifting-atlas-website-api' }
  }
}

export default healthCheckHandler

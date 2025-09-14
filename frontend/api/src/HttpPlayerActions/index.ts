import { InvocationContext, HttpRequest } from '@azure/functions'

export async function httpPlayerActionsHandler(_request: HttpRequest, context: InvocationContext) {
  context.log('HttpPlayerActions triggered')
  return {
    status: 200,
    jsonBody: { message: 'Hello from HttpPlayerActions' }
  }
}

export default httpPlayerActionsHandler

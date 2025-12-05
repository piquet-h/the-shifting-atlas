/**
 * MSW server instance
 * Provides mock API server for all tests
 */
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)

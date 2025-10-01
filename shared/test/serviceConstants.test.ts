import assert from 'node:assert'
import { describe, test } from 'node:test'
import { SERVICE_BACKEND, SERVICE_FRONTEND_WEB, SERVICE_SWA_API, serviceLabel } from '../src/serviceConstants.js'

describe('serviceConstants', () => {
    test('constant values', () => {
        assert.equal(SERVICE_BACKEND, 'backend-functions')
        assert.equal(SERVICE_SWA_API, 'swa-api')
        assert.equal(SERVICE_FRONTEND_WEB, 'frontend-web')
    })
    test('serviceLabel known services', () => {
        assert.equal(serviceLabel(SERVICE_BACKEND), 'Azure Functions Backend')
    })
    test('serviceLabel unknown falls back', () => {
        assert.equal(serviceLabel('unknown'), 'unknown')
    })
})

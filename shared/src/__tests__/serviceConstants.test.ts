import assert from 'node:assert';
import {
    SERVICE_BACKEND,
    SERVICE_FRONTEND_WEB,
    SERVICE_SWA_API,
    serviceLabel,
} from '../serviceConstants.js';

// Basic sanity tests for shared constants and labeling helper

assert.equal(SERVICE_BACKEND, 'backend-functions');
assert.equal(SERVICE_SWA_API, 'swa-api');
assert.equal(SERVICE_FRONTEND_WEB, 'frontend-web');
assert.equal(serviceLabel(SERVICE_BACKEND), 'Azure Functions Backend');
assert.equal(serviceLabel('unknown'), 'unknown');

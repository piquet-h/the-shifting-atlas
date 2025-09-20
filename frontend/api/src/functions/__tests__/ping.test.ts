import { SERVICE_SWA_API } from '@atlas/shared';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import assert from 'node:assert';
import { pingHandler } from '../ping.js';

class TestHttpRequest {
    method = 'GET';
    url = 'http://localhost/ping';
    headers = new Map<string, string>();
    query = new Map<string, string>();
    body?: string;
    async text(): Promise<string> {
        return this.body ?? '';
    }
}

const ctx: InvocationContext = { invocationId: 'test-invocation-api' } as InvocationContext;

(async () => {
    const req = new TestHttpRequest();
    req.query.set('name', 'frontend-api');
    const res = await pingHandler(req as unknown as HttpRequest, ctx);
    assert.equal(res.status, 200);
    assert.equal(res.jsonBody.echo, 'frontend-api');
    assert.equal(res.jsonBody.service, SERVICE_SWA_API);
})();

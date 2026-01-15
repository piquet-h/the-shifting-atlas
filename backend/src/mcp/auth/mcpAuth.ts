import type { FunctionResult, InvocationContext } from '@azure/functions'

import { TelemetryService } from '../../telemetry/TelemetryService.js'

export type McpCallerClaims = {
    tenantId?: string
    clientAppId?: string
    roles: string[]
}

export type McpTokenValidator = (messages: unknown, context: InvocationContext) => Promise<McpCallerClaims>

export type WrapMcpToolHandlerOptions = {
    toolName: string
    handler: (messages: unknown, context: InvocationContext) => FunctionResult

    /** Optional override for unit tests or alternative auth wiring */
    validateToken?: McpTokenValidator

    /** Optional allow-list for caller client application ids (Entra appId). Deny-by-default if provided. */
    allowedClientAppIds?: string[]

    /** Optional override of allowed toolNames. Defaults to current read-only catalog. */
    allowedToolNames?: Set<string>
}

const MCP_ALLOWED_TOOL_NAMES_DEFAULT = new Set<string>([
    // World (read-only)
    'get-location',
    'list-exits',

    // WorldContext (read-only)
    'health',
    'get-location-context',
    'get-player-context',
    'get-atmosphere',
    'get-spatial-context',
    'get-recent-events',

    // Lore (read-only)
    'get-canonical-fact',
    'search-lore'
])

// Inline stable attribute key strings to avoid coupling backend compilation to an unpublished shared package version.
// These MUST match the canonical keys in shared/src/telemetryAttributes.ts.
const MCP_ATTRIBUTE_KEYS = {
    TOOL_NAME: 'game.mcp.tool.name',
    CLIENT_APP_ID: 'game.mcp.client.app.id',
    CLIENT_SUBSCRIPTION_ID: 'game.mcp.client.subscription.id'
} as const

type HeaderBag = Record<string, string | undefined>

function normalizeHeaders(headers: unknown): HeaderBag {
    if (!headers || typeof headers !== 'object') return {}

    const out: HeaderBag = {}
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
        if (typeof k !== 'string') continue
        if (typeof v === 'string') out[k.toLowerCase()] = v
    }
    return out
}

function extractHeaders(messages: unknown, context: InvocationContext): HeaderBag {
    // 1) Messages object might include headers
    const msgHeaders = normalizeHeaders((messages as { headers?: unknown } | undefined)?.headers)
    if (Object.keys(msgHeaders).length > 0) return msgHeaders

    // 2) Trigger metadata may include headers (implementation-dependent)
    const metaHeaders = normalizeHeaders((context.triggerMetadata as { headers?: unknown } | undefined)?.headers)
    if (Object.keys(metaHeaders).length > 0) return metaHeaders

    // 3) Some hosts may pass an HttpRequest via extraInputs
    const req = context.extraInputs?.get?.('request') as unknown
    const reqHeaders = (req as { headers?: { get?: (k: string) => string | null } } | undefined)?.headers
    if (reqHeaders?.get) {
        const auth = reqHeaders.get('authorization')
        const principal = reqHeaders.get('x-ms-client-principal')
        const apimSub = reqHeaders.get('ocp-apim-subscription-id')
        const bag: HeaderBag = {}
        if (auth) bag['authorization'] = auth
        if (principal) bag['x-ms-client-principal'] = principal
        if (apimSub) bag['ocp-apim-subscription-id'] = apimSub
        return bag
    }

    return {}
}

type AppServiceClientPrincipalClaim = { typ: string; val: string }

function isAppServiceClientPrincipalClaim(value: unknown): value is AppServiceClientPrincipalClaim {
    if (!value || typeof value !== 'object') return false
    const rec = value as Record<string, unknown>
    return typeof rec.typ === 'string' && typeof rec.val === 'string'
}

function parseAppServiceClientPrincipal(headers: HeaderBag): McpCallerClaims | null {
    // App Service Authentication / EasyAuth provides x-ms-client-principal
    // Base64-encoded JSON object containing claims.
    const raw = headers['x-ms-client-principal']
    if (!raw) return null

    let decoded: string
    try {
        decoded = Buffer.from(raw, 'base64').toString('utf8')
    } catch {
        return null
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(decoded)
    } catch {
        return null
    }

    const claims = (parsed as { claims?: unknown } | undefined)?.claims
    if (!Array.isArray(claims)) return null

    const typedClaims = claims.filter(isAppServiceClientPrincipalClaim)

    const values = new Map<string, string[]>()
    for (const c of typedClaims) {
        const key = c.typ
        const arr = values.get(key) ?? []
        arr.push(c.val)
        values.set(key, arr)
    }

    // Common Entra app identification claims:
    // - appid
    // - azp
    // - aud (not used here)
    const clientAppId = values.get('appid')?.[0] ?? values.get('azp')?.[0]

    // Roles may appear in different claim namespaces
    const roles = [...(values.get('roles') ?? []), ...(values.get('http://schemas.microsoft.com/ws/2008/06/identity/claims/role') ?? [])]

    // Tenant ID may be present as tid
    const tenantId = values.get('tid')?.[0]

    return { tenantId, clientAppId, roles }
}

function hasNarratorRole(claims: McpCallerClaims): boolean {
    return (claims.roles ?? []).includes('Narrator')
}

export function wrapMcpToolHandler(opts: WrapMcpToolHandlerOptions) {
    const allowedToolNames = opts.allowedToolNames ?? MCP_ALLOWED_TOOL_NAMES_DEFAULT

    return async (messages: unknown, context: InvocationContext): Promise<FunctionResult> => {
        const container = context.extraInputs.get('container') as import('inversify').Container
        const telemetry = container.get(TelemetryService)

        const correlationId = context.invocationId
        const headers = extractHeaders(messages, context)
        const apimSubscriptionId = headers['ocp-apim-subscription-id']

        // AuthN: Prefer platform boundary (Entra ID / App Service Auth).
        // For unit tests and advanced integrations, allow injection of an alternate validator.
        let claims: McpCallerClaims | null = null
        if (opts.validateToken) {
            // Validator decides how to authenticate based on messages/context.
            // It should NOT log raw tokens.
            claims = await opts.validateToken(messages, context)
        } else {
            // Default: require x-ms-client-principal (EasyAuth)
            claims = parseAppServiceClientPrincipal(headers)
        }

        if (!claims) {
            telemetry.trackGameEvent(
                'MCP.Auth.Denied',
                {
                    toolName: opts.toolName,
                    reason: 'missing_token',
                    ...(apimSubscriptionId ? { clientSubscriptionId: apimSubscriptionId } : {})
                },
                { correlationId }
            )

            return {
                status: 401,
                jsonBody: { error: 'unauthorized' }
            }
        }

        if (opts.allowedClientAppIds && opts.allowedClientAppIds.length > 0) {
            const id = claims.clientAppId
            if (!id || !opts.allowedClientAppIds.includes(id)) {
                telemetry.trackGameEvent(
                    'MCP.Auth.Denied',
                    {
                        toolName: opts.toolName,
                        reason: 'unknown_client',
                        ...(id ? { clientAppId: id } : {}),
                        ...(apimSubscriptionId ? { clientSubscriptionId: apimSubscriptionId } : {})
                    },
                    { correlationId }
                )

                return {
                    status: 403,
                    jsonBody: { error: 'forbidden' }
                }
            }
        }

        // AuthZ: least-privilege allow-list
        if (!hasNarratorRole(claims)) {
            telemetry.trackGameEvent(
                'MCP.Auth.Denied',
                {
                    toolName: opts.toolName,
                    reason: 'missing_role',
                    ...(claims.clientAppId ? { clientAppId: claims.clientAppId } : {}),
                    ...(apimSubscriptionId ? { clientSubscriptionId: apimSubscriptionId } : {})
                },
                { correlationId }
            )

            return {
                status: 403,
                jsonBody: { error: 'forbidden' }
            }
        }

        if (!allowedToolNames.has(opts.toolName)) {
            telemetry.trackGameEvent(
                'MCP.Auth.Denied',
                {
                    toolName: opts.toolName,
                    reason: 'tool_not_allowed',
                    ...(claims.clientAppId ? { clientAppId: claims.clientAppId } : {}),
                    ...(apimSubscriptionId ? { clientSubscriptionId: apimSubscriptionId } : {})
                },
                { correlationId }
            )

            return {
                status: 403,
                jsonBody: { error: 'forbidden' }
            }
        }

        // Telemetry: allow decision + invocation
        telemetry.trackGameEvent(
            'MCP.Auth.Allowed',
            {
                toolName: opts.toolName,
                ...(claims.clientAppId ? { clientAppId: claims.clientAppId } : {}),
                ...(apimSubscriptionId ? { clientSubscriptionId: apimSubscriptionId } : {}),
                // Keep domain attributes low-cardinality and explicit
                ...(claims.clientAppId ? { [MCP_ATTRIBUTE_KEYS.CLIENT_APP_ID]: claims.clientAppId } : {}),
                ...(apimSubscriptionId ? { [MCP_ATTRIBUTE_KEYS.CLIENT_SUBSCRIPTION_ID]: apimSubscriptionId } : {}),
                [MCP_ATTRIBUTE_KEYS.TOOL_NAME]: opts.toolName
            },
            { correlationId }
        )

        telemetry.trackGameEvent(
            'MCP.Tool.Invoked',
            {
                toolName: opts.toolName,
                ...(claims.clientAppId ? { clientAppId: claims.clientAppId } : {}),
                ...(apimSubscriptionId ? { clientSubscriptionId: apimSubscriptionId } : {}),
                ...(claims.clientAppId ? { [MCP_ATTRIBUTE_KEYS.CLIENT_APP_ID]: claims.clientAppId } : {}),
                ...(apimSubscriptionId ? { [MCP_ATTRIBUTE_KEYS.CLIENT_SUBSCRIPTION_ID]: apimSubscriptionId } : {}),
                [MCP_ATTRIBUTE_KEYS.TOOL_NAME]: opts.toolName
            },
            { correlationId }
        )

        return opts.handler(messages, context)
    }
}

// Note: We intentionally do not support in-app API keys for MCP (gateway-first).
// If APIM is used, it should enforce JWT/subscription and optionally forward subscription id headers.
// If direct JWT validation becomes required, implement it here in a separate issue without weakening platform-first enforcement.

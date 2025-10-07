# Secrets Management

This module provides secure secret retrieval with Azure Key Vault integration using Managed Identity.

## Usage

```typescript
import { getSecret } from '@atlas/shared'

// In production: fetches from Key Vault using Managed Identity
// In development: falls back to environment variables
const cosmosKey = await getSecret('cosmos-primary-key')
```

## Features

- **Allowlist validation**: Only approved secret keys can be retrieved
- **Lazy caching**: Secrets cached in-memory with configurable TTL (default: 5 minutes)
- **Retry with backoff**: Exponential backoff on Key Vault fetch failures (default: 3 attempts)
- **Telemetry**: Tracks cache hits/misses, fetch successes/failures
- **Local dev fallback**: Automatically uses environment variables when Key Vault not configured
- **Production guard**: Refuses to use env vars when `NODE_ENV=production`

## Allowed Secret Keys

Only these keys can be retrieved through the helper (Cosmos DB now uses Managed Identity; no primary keys fetched at runtime):

- `service-bus-connection-string` → Azure Service Bus connection
- `model-provider-api-key` → AI model provider API key
- `signing-secret` → Application signing secret

## Local Development

1. Copy `.env.development.example` to `.env.development`
2. (Optional) Add any non‑Cosmos secrets you need for testing (e.g., Service Bus connection)
3. Run `az login` so DefaultAzureCredential can obtain an access token for Cosmos DB Gremlin & SQL APIs.

## Production Configuration

Environment variables set by Azure infrastructure:

- `KEYVAULT_NAME`: Name of the Key Vault (e.g., `kv-abc123`)
- System-assigned Managed Identity with Key Vault access policy

The helper automatically:

1. Detects `KEYVAULT_NAME` presence
2. Uses `DefaultAzureCredential` (Managed Identity in Azure)
3. Fetches secrets from Key Vault
4. Caches for performance

## API

### `getSecret(secretKey, options?)`

Fetch a secret with caching and retry.

**Parameters:**

- `secretKey`: Must be one of the allowed keys
- `options`: Optional configuration
    - `maxRetries`: Max retry attempts (default: 3)
    - `initialRetryDelayMs`: Initial delay for retry backoff (default: 1000ms)
    - `cacheTtlMs`: Cache time-to-live (default: 300000ms = 5 minutes)

**Returns:** Promise<string>

**Throws:** Error if key not allowlisted or fetch fails

### `clearSecretCache()`

Clear the in-memory secret cache. Useful for testing or forcing refresh.

### `getSecretCacheStats()`

Get cache statistics for monitoring.

**Returns:** `{ size: number, keys: string[] }`

## Telemetry Events

The helper emits these telemetry events:

- `Secret.Cache.Hit` - Secret retrieved from cache
- `Secret.Cache.Miss` - Secret not in cache, fetching
- `Secret.Fetch.Success` - Successfully fetched from Key Vault or local env
- `Secret.Fetch.Failure` - Failed to fetch secret
- `Secret.Fetch.Retry` - Retrying after failure
- `Secret.Fetch.Fallback` - Using local env fallback after Key Vault error
- `Secret.Cache.Clear` - Cache cleared

## Security Notes

- **Never** commit `.env.development` or any file containing real secrets
- **Always** use the secrets helper for the remaining allow‑listed secrets
- The production guard prevents accidental use of local env vars in production
- Allowlist prevents typos and unauthorized secret access
- Managed Identity eliminates need for stored credentials

## Future Enhancements

- Secret rotation automation
- Per-secret cache TTL
- Circuit breaker for Key Vault failures
- Secret version pinning

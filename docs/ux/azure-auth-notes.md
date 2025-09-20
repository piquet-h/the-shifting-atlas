# Azure External Identities & Static Web Apps — Quick Notes

This short note collects practical links and snippets for integrating Azure External Identities (Azure AD / External Identities / B2C) with Azure Static Web Apps and Functions.

Key concepts

- Static Web Apps (SWA) provides built-in authentication that can be configured to use Azure Active Directory or External Identities. When SWA handles auth, the platform injects a base64-encoded `x-ms-client-principal` header into proxied requests to your APIs (Functions).
- The SPA can also request the `/ .auth/me` endpoint to fetch the authenticated user's claims as JSON.
- For server-side validation you can either trust `x-ms-client-principal` when received via the SWA managed proxy, or validate provider JWTs against the provider's JWKS endpoint.

Useful links

- Azure Static Web Apps authentication docs: https://learn.microsoft.com/azure/static-web-apps/authentication-authorization
- Azure AD External Identities overview: https://learn.microsoft.com/azure/active-directory/external-identities/overview
- Validate JWT tokens and JWKS: https://learn.microsoft.com/azure/active-directory/develop/active-directory-token-and-claims

Static Web App config snippet (staticwebapp.config.json)

{
"routes": [
{
"route": "/api/\*",
"allowedRoles": ["authenticated"]
},
{
"route": "/login",
"redirect": "/.auth/login/aad"
}
]
}

Backend tips (Azure Functions)

- Read and decode `x-ms-client-principal` header when present:

    const header = req.headers['x-ms-client-principal'];
    if (header) {
    const raw = Buffer.from(header, 'base64').toString('utf8');
    const principal = JSON.parse(raw);
    }

- For stricter validation (recommended for high-security ops), validate an Authorization: Bearer <token> JWT against the provider's JWKS endpoint.

Local development

- SWA local emulator supports auth flows but you may need to configure `local.settings.json` and the SWA CLI to simulate providers. For quick iteration test against test tenants in Azure.

Quick Azure CLI pointers

- Create a Static Web App (example, replace placeholders):

    az staticwebapp create --name <APP_NAME> --resource-group <RG> --source . --location <REGION> --login-with-github

(Use the Azure docs to tailor the auth provider settings for external identities.)

Notes

- This file is intentionally concise — keep it as a reference for developers implementing the flows in `frontend` and `backend`.

Client Hook Example (excerpt from `useAuth`):

```ts
async function fetchPrincipal(signal?: AbortSignal) {
    const res = await fetch('/.auth/me', {headers: {'x-swa-auth': 'true'}, signal})
    if (!res.ok) return null // anonymous (204/404)
    const data = await res.json()
    return data?.clientPrincipal ?? null
}
```

Sign-in redirect pattern:

```
/.auth/login/<provider>?post_login_redirect_uri=/
```

Sign-out redirect pattern:

```
/.auth/logout?post_logout_redirect_uri=/
```

Where `<provider>` can be `aad`, `github`, etc., depending on configured providers.

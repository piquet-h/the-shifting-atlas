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

Implementation references

- Frontend auth hook (reads `/.auth/me`): `frontend/src/hooks/useAuth.tsx`
- Server-side principal parsing (SWA `x-ms-client-principal`): `shared/src/auth/playerAuth.ts`

For configuration examples, prefer the official SWA documentation (it stays current as the platform evolves).

Local development

- SWA local emulator supports auth flows but you may need to configure `local.settings.json` and the SWA CLI to simulate providers. For quick iteration test against test tenants in Azure.

Quick Azure CLI pointers

- Create a Static Web App (example, replace placeholders):

    az staticwebapp create --name <APP_NAME> --resource-group <RG> --source . --location <REGION> --login-with-github

(Use the Azure docs to tailor the auth provider settings for external identities.)

Notes

- This file is intentionally concise — keep it as a reference for developers implementing the flows in `frontend` and `backend`.

Sign-in/sign-out endpoints and provider routing are documented by SWA and implemented in `frontend/src/hooks/useAuth.tsx`.

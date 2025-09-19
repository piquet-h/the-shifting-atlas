// Central service naming constants to avoid drift between backend & SWA API.
// Extend this list as new logical services are introduced.

export const SERVICE_BACKEND = 'backend-functions';
export const SERVICE_SWA_API = 'swa-api';
export const SERVICE_FRONTEND_WEB = 'frontend-web'; // reserved for client-only pings if needed

// Derive a runtime display label (can be localized later)
export function serviceLabel(name: string): string {
    switch (name) {
        case SERVICE_BACKEND:
            return 'Azure Functions Backend';
        case SERVICE_SWA_API:
            return 'Static Web App API';
        case SERVICE_FRONTEND_WEB:
            return 'Web Client';
        default:
            return name;
    }
}

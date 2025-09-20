// Backend-local service naming constants.
export const SERVICE_BACKEND = 'backend-functions'
export const SERVICE_SWA_API = 'swa-api'
export const SERVICE_FRONTEND_WEB = 'frontend-web'

export function serviceLabel(name: string): string {
    switch (name) {
        case SERVICE_BACKEND:
            return 'Azure Functions Backend'
        case SERVICE_SWA_API:
            return 'Static Web App API'
        case SERVICE_FRONTEND_WEB:
            return 'Web Client'
        default:
            return name
    }
}

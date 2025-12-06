import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './hooks/useAuth'
import './tailwind.css'
import { TelemetryProvider } from './telemetry/TelemetryContext'

// Telemetry initialization now handled by TelemetryProvider (lazy, disabled in tests)

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60 * 1000, // 1 minute default
            retry: 1,
            refetchOnWindowFocus: false // Prevent refetch on tab focus (can enable per-query)
        }
    }
})

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')
const root = createRoot(container)
root.render(
    <TelemetryProvider>
        <AuthProvider>
            <QueryClientProvider client={queryClient}>
                <App />
                {/* Only show devtools in development - production builds exclude this via tree-shaking */}
                {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
            </QueryClientProvider>
        </AuthProvider>
    </TelemetryProvider>
)

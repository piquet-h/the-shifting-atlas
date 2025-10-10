import * as React from 'react'
import { fetchPing, PingResponse } from '../services/ping'

interface UsePingOptions {
    intervalMs?: number
    immediate?: boolean
}

interface UsePingState {
    loading: boolean
    data?: PingResponse
    error?: string
    lastAt?: number
}

export function usePing(opts: UsePingOptions = {}): UsePingState {
    const { intervalMs = 30000, immediate = true } = opts
    const [state, setState] = React.useState<UsePingState>({ loading: true })

    const run = React.useCallback(async () => {
        setState((s) => ({ ...s, loading: true }))
        const res = await fetchPing()
        if (!res.ok) {
            setState({
                loading: false,
                data: res,
                error: res.error || 'Ping failed',
                lastAt: Date.now()
            })
        } else {
            setState({
                loading: false,
                data: res,
                lastAt: Date.now()
            })
        }
    }, [])

    React.useEffect(() => {
        if (immediate) run()
        const id = window.setInterval(run, intervalMs)
        return () => window.clearInterval(id)
    }, [run, intervalMs, immediate])

    return state
}

export default usePing

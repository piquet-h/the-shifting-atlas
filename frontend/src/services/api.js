const BASE = import.meta.env.VITE_API_BASE || '/api'

export async function fetchHealth() {
    try {
        const res = await fetch(`${BASE}/health`)
        if (!res.ok) throw new Error('Network response not ok')
        return res.json()
    } catch (err) {
        return { error: err.message }
    }
}

export default { fetchHealth }

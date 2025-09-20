import {useEffect, useState} from 'react'

/**
 * useMediaQuery
 * Lightweight hook for progressive enhancement decisions. Matches client side only.
 * Returns boolean that updates on media list change.
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false)
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return
        const mql = window.matchMedia(query)
        const update = () => setMatches(mql.matches)
        update()
        mql.addEventListener('change', update)
        return () => mql.removeEventListener('change', update)
    }, [query])
    return matches
}

/**
 * usePointerFine
 * True if the primary input is a precise pointing device. Used to enable hover affordances.
 */
export function usePointerFine(): boolean {
    return useMediaQuery('(pointer: fine)')
}

/**
 * usePrefersReducedMotion
 * Allows conditional animation enabling.
 */
export function usePrefersReducedMotion(): boolean {
    return useMediaQuery('(prefers-reduced-motion: reduce)')
}

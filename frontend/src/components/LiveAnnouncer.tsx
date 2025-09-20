import React, {useRef, useState, useEffect} from 'react'

/**
 * LiveAnnouncer
 * Minimal scaffold for future world event announcements.
 * TODO: Extend with queue subscription + debounced batching.
 */
export default function LiveAnnouncer(): React.ReactElement {
    const politeRef = useRef<HTMLDivElement | null>(null)
    const assertiveRef = useRef<HTMLDivElement | null>(null)
    const [lastMessage, setLastMessage] = useState<string>('')

    // Placeholder demo: announce mount for testing
    useEffect(() => {
        setLastMessage('Interface loaded. Ready for input.')
    }, [])

    useEffect(() => {
        if (politeRef.current) {
            // Force reflow pattern to retrigger SR announcement if identical
            const node = politeRef.current
            node.textContent = ''
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            node.offsetHeight
            node.textContent = lastMessage
        }
    }, [lastMessage])

    return (
        <div className="sr-only" aria-hidden="false">
            <div ref={politeRef} aria-live="polite" aria-atomic="true" />
            <div ref={assertiveRef} aria-live="assertive" aria-atomic="true" />
        </div>
    )
}

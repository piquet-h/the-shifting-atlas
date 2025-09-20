import React, {FormEvent, useRef, useState} from 'react'

export interface CommandInputProps {
    disabled?: boolean
    busy?: boolean
    placeholder?: string
    onSubmit: (command: string) => Promise<void> | void
}

/**
 * CommandInput
 * Accessible single-line command entry with inline status messaging.
 * Responsibilities:
 *  - Capture raw command string
 *  - Provide a11y semantics for busy / error states (parent supplies via props)
 *  - Reset input after successful submission (unless parent overrides by controlling value)
 */
export default function CommandInput({
    disabled,
    busy,
    placeholder = 'Enter a command (e.g., ping)',
    onSubmit
}: CommandInputProps): React.ReactElement {
    const [value, setValue] = useState('')
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement | null>(null)
    const isInvalid = error != null // stable boolean for aria-invalid

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        if (!value.trim() || busy) return
        setError(null)
        try {
            await onSubmit(value.trim())
            setValue('')
            inputRef.current?.focus()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown command error')
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2" aria-label="Command entry">
            <div className="flex items-stretch gap-2">
                <input
                    ref={inputRef}
                    type="text"
                    className="flex-1 rounded-md bg-white/5 border border-white/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-accent focus:border-atlas-accent disabled:opacity-50"
                    placeholder={placeholder}
                    aria-label="Command"
                    {...(isInvalid
                        ? {
                              'aria-invalid': 'true',
                              'aria-describedby': 'command-error',
                              'aria-errormessage': 'command-error'
                          }
                        : {})}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    disabled={disabled}
                    autoComplete="off"
                />
                <button
                    type="submit"
                    disabled={disabled || busy || !value.trim()}
                    className="px-4 py-2 rounded-md bg-atlas-accent text-emerald-900 font-semibold text-sm disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-atlas-accent focus:ring-offset-atlas-bg"
                >
                    {busy ? 'Running…' : 'Run'}
                </button>
            </div>
            <div className="min-h-[1.25rem] text-xs" aria-live="polite" role="status">
                {busy && !error ? <span className="text-slate-400">Executing command…</span> : null}
            </div>
            {isInvalid && (
                <p id="command-error" role="alert" className="text-xs text-red-400">
                    {error}
                </p>
            )}
        </form>
    )
}

// Imperative ARIA management effect placed after component to keep JSX static.
// (We attach it inside the component body for access to state.)

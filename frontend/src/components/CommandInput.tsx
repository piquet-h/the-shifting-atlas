import React, { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { findClosestMatch } from '../utils/fuzzyMatch'

export interface CommandInputProps {
    disabled?: boolean
    busy?: boolean
    placeholder?: string
    onSubmit: (command: string) => Promise<void> | void
    /** Available exits for autocomplete (directions) */
    availableExits?: string[]
    /** Command history for up/down arrow navigation */
    commandHistory?: string[]
}

/**
 * CommandInput
 * Accessible single-line command entry with autocomplete, history navigation, and validation
 * Responsibilities:
 *  - Capture raw command string
 *  - Provide autocomplete dropdown for valid directions
 *  - Enable command history navigation with arrow keys
 *  - Validate commands and provide helpful suggestions
 *  - Provide a11y semantics for busy / error states (parent supplies via props)
 *  - Reset input after successful submission (unless parent overrides by controlling value)
 */
export default function CommandInput({
    disabled,
    busy,
    placeholder = 'Enter a command (e.g., ping)',
    onSubmit,
    availableExits = [],
    commandHistory = []
}: CommandInputProps): React.ReactElement {
    const [value, setValue] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [suggestion, setSuggestion] = useState<string | null>(null)
    const [showAutocomplete, setShowAutocomplete] = useState(false)
    const [autocompleteOptions, setAutocompleteOptions] = useState<string[]>([])
    const [selectedOptionIndex, setSelectedOptionIndex] = useState(-1)
    const [historyIndex, setHistoryIndex] = useState(-1)
    const inputRef = useRef<HTMLInputElement | null>(null)
    const autocompleteRef = useRef<HTMLDivElement | null>(null)
    const isInvalid = error != null // stable boolean for aria-invalid

    // Known commands for validation (constants to avoid re-creation)
    const KNOWN_COMMANDS = React.useMemo(() => ['ping', 'look', 'move', 'clear'], [])
    const DIRECTIONS = React.useMemo(
        () => ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down', 'in', 'out'],
        []
    )
    const DIRECTION_SHORTCUTS = React.useMemo(
        () => ({
            n: 'north',
            s: 'south',
            e: 'east',
            w: 'west',
            ne: 'northeast',
            nw: 'northwest',
            se: 'southeast',
            sw: 'southwest',
            u: 'up',
            d: 'down',
            i: 'in',
            o: 'out'
        }),
        []
    )

    // Validate command and provide suggestions
    function validateCommand(cmd: string): { valid: boolean; suggestion?: string; error?: string } {
        if (!cmd.trim()) {
            return { valid: false, error: 'Enter a command' }
        }

        const trimmed = cmd.trim().toLowerCase()
        const parts = trimmed.split(/\s+/)
        const command = parts[0]

        // Check if it's a known command
        if (KNOWN_COMMANDS.includes(command)) {
            // For move command, validate direction
            if (command === 'move') {
                if (parts.length < 2) {
                    return { valid: false, error: 'Move command requires a direction (e.g., "move north")' }
                }
                const direction = parts[1]
                const normalizedDir = DIRECTION_SHORTCUTS[direction as keyof typeof DIRECTION_SHORTCUTS] || direction

                if (!DIRECTIONS.includes(normalizedDir)) {
                    const closest = findClosestMatch(direction, DIRECTIONS)
                    return {
                        valid: false,
                        error: `"${direction}" is not a valid direction`,
                        suggestion: closest ? `Did you mean "move ${closest}"?` : undefined
                    }
                }

                // Check if exit is available
                if (availableExits.length > 0 && !availableExits.includes(normalizedDir)) {
                    return {
                        valid: true, // Still valid, just not available
                        suggestion: `No exit to the ${normalizedDir}. Available: ${availableExits.join(', ')}`
                    }
                }
            }
            return { valid: true }
        }

        // Unknown command - suggest closest match
        const closest = findClosestMatch(command, KNOWN_COMMANDS)
        return {
            valid: false,
            error: `Unknown command: "${command}"`,
            suggestion: closest ? `Did you mean "${closest}"?` : 'Try: ping, look, move <direction>, or clear'
        }
    }

    // Update autocomplete options based on input
    useEffect(() => {
        const trimmed = value.trim().toLowerCase()

        if (!trimmed) {
            setShowAutocomplete(false)
            setSuggestion(null)
            return
        }

        const parts = trimmed.split(/\s+/)
        const command = parts[0]

        // Show direction autocomplete for move command
        if (command === 'move' || command === 'm') {
            const directionInput = parts[1] || ''
            const matches = DIRECTIONS.filter((dir) => dir.startsWith(directionInput.toLowerCase()))

            // Prioritize available exits
            const sortedMatches = matches.sort((a, b) => {
                const aAvailable = availableExits.includes(a)
                const bAvailable = availableExits.includes(b)
                if (aAvailable && !bAvailable) return -1
                if (!aAvailable && bAvailable) return 1
                return 0
            })

            if (sortedMatches.length > 0 && directionInput) {
                setAutocompleteOptions(sortedMatches)
                setShowAutocomplete(true)
            } else if (directionInput === '') {
                // Show available exits when no direction typed yet
                setAutocompleteOptions(availableExits.length > 0 ? availableExits : DIRECTIONS)
                setShowAutocomplete(true)
            } else {
                setShowAutocomplete(false)
            }
        } else {
            // Autocomplete for commands
            const matches = KNOWN_COMMANDS.filter((cmd) => cmd.startsWith(command))
            if (matches.length > 0 && matches.length < KNOWN_COMMANDS.length) {
                setAutocompleteOptions(matches)
                setShowAutocomplete(true)
            } else {
                setShowAutocomplete(false)
            }
        }
    }, [value, availableExits, DIRECTIONS, KNOWN_COMMANDS])

    // Handle command history navigation (up/down arrows)
    const handleHistoryNavigation = useCallback(
        (direction: 'up' | 'down') => {
            if (direction === 'up' && commandHistory.length > 0) {
                const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1)
                setHistoryIndex(newIndex)
                setValue(commandHistory[newIndex])
                setShowAutocomplete(false)
            } else if (direction === 'down' && historyIndex !== -1) {
                const newIndex = historyIndex + 1
                if (newIndex >= commandHistory.length) {
                    setHistoryIndex(-1)
                    setValue('')
                } else {
                    setHistoryIndex(newIndex)
                    setValue(commandHistory[newIndex])
                }
            }
        },
        [commandHistory, historyIndex]
    )

    // Handle autocomplete navigation (arrow keys)
    const handleAutocompleteNavigation = useCallback(
        (direction: 'up' | 'down') => {
            if (!showAutocomplete || autocompleteOptions.length === 0) return

            if (direction === 'down') {
                setSelectedOptionIndex((prev) => (prev + 1) % autocompleteOptions.length)
            } else if (direction === 'up') {
                setSelectedOptionIndex((prev) => (prev - 1 + autocompleteOptions.length) % autocompleteOptions.length)
            }
        },
        [showAutocomplete, autocompleteOptions.length]
    )

    // Handle autocomplete selection (Tab/Enter)
    const handleAutocompleteSelection = useCallback(() => {
        if (!showAutocomplete || selectedOptionIndex === -1) return false

        const selected = autocompleteOptions[selectedOptionIndex]
        const parts = value.trim().split(/\s+/)

        if (parts[0] === 'move' || parts[0] === 'm') {
            setValue(`move ${selected}`)
        } else {
            setValue(selected)
        }

        setShowAutocomplete(false)
        setSelectedOptionIndex(-1)
        return true
    }, [showAutocomplete, selectedOptionIndex, autocompleteOptions, value])

    // Handle keyboard navigation
    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        // Up arrow - navigate command history or autocomplete
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (showAutocomplete && autocompleteOptions.length > 0) {
                handleAutocompleteNavigation('up')
            } else {
                handleHistoryNavigation('up')
            }
            return
        }

        // Down arrow - navigate command history or autocomplete
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (showAutocomplete && autocompleteOptions.length > 0) {
                handleAutocompleteNavigation('down')
            } else {
                handleHistoryNavigation('down')
            }
            return
        }

        // Escape - close autocomplete
        if (e.key === 'Escape') {
            setShowAutocomplete(false)
            setSelectedOptionIndex(-1)
            return
        }

        // Tab or Enter - select autocomplete option
        if ((e.key === 'Tab' || e.key === 'Enter') && handleAutocompleteSelection()) {
            e.preventDefault()
            return
        }

        // Reset history index on any other key
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
            setHistoryIndex(-1)
        }
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        if (!value.trim() || busy) {
            if (!value.trim()) {
                setError('Enter a command')
                setSuggestion('Try: ping, look, move <direction>, or clear')
            }
            return
        }

        // Validate command
        const validation = validateCommand(value)
        if (!validation.valid && validation.error) {
            setError(validation.error)
            setSuggestion(validation.suggestion || null)
            return
        }

        setError(null)
        setSuggestion(null)
        setShowAutocomplete(false)

        try {
            await onSubmit(value.trim())
            setValue('')
            setHistoryIndex(-1)
            inputRef.current?.focus()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown command error'
            setError(errorMessage)

            // Check if it's a network timeout
            if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('network')) {
                setSuggestion('Network issue detected. Please try again.')
            }
        }
    }

    // Handle input change
    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        setValue(e.target.value)
        setError(null)
        setSuggestion(null)
        setSelectedOptionIndex(-1)
    }

    // Handle autocomplete option click
    function handleAutocompleteClick(option: string) {
        const parts = value.trim().split(/\s+/)

        if (parts[0] === 'move' || parts[0] === 'm') {
            setValue(`move ${option}`)
        } else {
            setValue(option)
        }

        setShowAutocomplete(false)
        setSelectedOptionIndex(-1)
        inputRef.current?.focus()
    }

    // Close autocomplete when clicking outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (
                autocompleteRef.current &&
                !autocompleteRef.current.contains(e.target as Node) &&
                !inputRef.current?.contains(e.target as Node)
            ) {
                setShowAutocomplete(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2" aria-label="Command entry">
            <div className="flex flex-col sm:flex-row sm:items-stretch gap-2 relative">
                <div className="flex-1 relative">
                    <input
                        ref={inputRef}
                        type="text"
                        className="w-full touch-target rounded-md bg-white/5 border border-white/15 px-3 py-2 sm:py-2 text-responsive-base focus:outline-none focus-visible:ring-2 focus-visible:ring-atlas-accent focus-visible:border-atlas-accent disabled:opacity-50"
                        placeholder={placeholder}
                        aria-label="Command"
                        aria-autocomplete="list"
                        aria-controls={showAutocomplete ? 'command-autocomplete' : undefined}
                        role="combobox"
                        aria-expanded={showAutocomplete}
                        {...(isInvalid
                            ? {
                                  'aria-invalid': 'true',
                                  'aria-describedby': 'command-error',
                                  'aria-errormessage': 'command-error'
                              }
                            : {})}
                        value={value}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        autoComplete="off"
                    />
                    {showAutocomplete && autocompleteOptions.length > 0 && (
                        <div
                            ref={autocompleteRef}
                            id="command-autocomplete"
                            role="listbox"
                            className="absolute z-10 w-full mt-1 bg-slate-800 border border-white/20 rounded-md shadow-lg max-h-48 overflow-auto"
                        >
                            {autocompleteOptions.map((option, index) => {
                                const isAvailable = availableExits.includes(option)
                                const isSelected = index === selectedOptionIndex
                                return (
                                    <div
                                        key={option}
                                        role="option"
                                        aria-selected={isSelected}
                                        tabIndex={-1}
                                        className={[
                                            'px-3 py-2 cursor-pointer text-responsive-sm transition-colors touch-target',
                                            isSelected ? 'bg-atlas-accent/20 text-atlas-accent' : 'text-slate-200 hover:bg-white/10',
                                            isAvailable ? 'font-medium' : ''
                                        ].join(' ')}
                                        onClick={() => handleAutocompleteClick(option)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault()
                                                handleAutocompleteClick(option)
                                            }
                                        }}
                                        onMouseEnter={() => setSelectedOptionIndex(index)}
                                    >
                                        {option}
                                        {isAvailable && <span className="ml-2 text-emerald-400 text-xs">✓ available</span>}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
                <button
                    type="submit"
                    disabled={disabled || busy || !value.trim()}
                    className="touch-target px-4 py-2 rounded-md bg-atlas-accent text-emerald-900 font-semibold text-responsive-base disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white focus-visible:ring-offset-atlas-bg sm:w-auto w-full"
                >
                    {busy ? (
                        <span className="flex items-center gap-2 justify-center">
                            <span className="inline-block w-4 h-4 border-2 border-emerald-900 border-t-transparent rounded-full animate-spin" />
                            Running…
                        </span>
                    ) : (
                        'Run'
                    )}
                </button>
            </div>
            <div className="min-h-[1.25rem] text-responsive-sm" aria-live="polite" role="status">
                {busy && !error ? <span className="text-slate-400">Executing command…</span> : null}
                {suggestion && !error ? <span className="text-amber-400">{suggestion}</span> : null}
            </div>
            {isInvalid && (
                <p id="command-error" role="alert" className="text-responsive-sm text-red-400">
                    {error}
                </p>
            )}
        </form>
    )
}

// Imperative ARIA management effect placed after component to keep JSX static.
// (We attach it inside the component body for access to state.)

/**
 * NavigationUI Component
 *
 * Provides directional navigation via clickable buttons and keyboard shortcuts.
 * Supports all canonical directions with visual feedback for available/blocked exits.
 *
 * Features:
 * - Clickable exit buttons for available directions
 * - Keyboard shortcuts: arrow keys + WASD for cardinal directions
 * - Visual indication of blocked directions (grayed out)
 * - Mobile-friendly touch targets (≥44px)
 * - Screen reader accessible with ARIA labels
 */

import React, { useCallback, useEffect } from 'react'
import CompassRoseIcon from '../assets/compass-rose.svg?react'
import { usePointerFine } from '../hooks/useMediaQueries'

/** Direction type matching shared domain models */
type Direction = 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest' | 'up' | 'down' | 'in' | 'out'

/** Exit information including optional hint text */
interface ExitInfo {
    direction: Direction
    description?: string
}

interface NavigationUIProps {
    /** Available exits with optional descriptions */
    availableExits: ExitInfo[]
    /** Callback invoked when user selects a direction */
    onNavigate: (direction: Direction) => void
    /** Whether navigation is currently disabled (e.g., during command execution) */
    disabled?: boolean
    /** Optional CSS class for container styling */
    className?: string
}

/** Configuration for direction button layout and keyboard mappings */
interface DirectionConfig {
    direction: Direction
    label: string
    shortLabel: string
    keys: string[] // Keyboard keys that trigger this direction
    group: 'cardinal' | 'intercardinal' | 'vertical' | 'radial'
}

/** Complete direction configuration with keyboard mappings */
const DIRECTION_CONFIGS: DirectionConfig[] = [
    // Cardinal directions (grid position: center cross)
    { direction: 'north', label: 'North', shortLabel: 'N', keys: ['ArrowUp', 'w', 'W'], group: 'cardinal' },
    { direction: 'south', label: 'South', shortLabel: 'S', keys: ['ArrowDown', 's', 'S'], group: 'cardinal' },
    { direction: 'east', label: 'East', shortLabel: 'E', keys: ['ArrowRight', 'd', 'D'], group: 'cardinal' },
    { direction: 'west', label: 'West', shortLabel: 'W', keys: ['ArrowLeft', 'a', 'A'], group: 'cardinal' },

    // Intercardinal directions (grid position: corners)
    { direction: 'northeast', label: 'Northeast', shortLabel: 'NE', keys: ['e', 'E'], group: 'intercardinal' },
    { direction: 'northwest', label: 'Northwest', shortLabel: 'NW', keys: ['q', 'Q'], group: 'intercardinal' },
    { direction: 'southeast', label: 'Southeast', shortLabel: 'SE', keys: ['c', 'C'], group: 'intercardinal' },
    { direction: 'southwest', label: 'Southwest', shortLabel: 'SW', keys: ['z', 'Z'], group: 'intercardinal' },

    // Vertical directions
    { direction: 'up', label: 'Up', shortLabel: '↑', keys: ['u', 'U'], group: 'vertical' },
    { direction: 'down', label: 'Down', shortLabel: '↓', keys: ['n', 'N'], group: 'vertical' },

    // Radial directions
    { direction: 'in', label: 'In', shortLabel: '→', keys: ['i', 'I'], group: 'radial' },
    { direction: 'out', label: 'Out', shortLabel: '←', keys: ['o', 'O'], group: 'radial' }
]

/**
 * DirectionButton
 * Individual button for a single direction with visual feedback and optional hint text.
 */
function DirectionButton({
    config,
    exitInfo,
    disabled,
    onClick
}: {
    config: DirectionConfig
    exitInfo?: ExitInfo
    disabled: boolean
    onClick: () => void
}): React.ReactElement {
    const available = !!exitInfo
    const buttonEnabled = available && !disabled

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!buttonEnabled}
            className={[
                'flex flex-col items-center justify-center p-3 sm:p-4 rounded-lg text-center transition-all',
                'min-h-[44px] min-w-[44px]', // Mobile touch target minimum
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                buttonEnabled
                    ? 'bg-emerald-700/60 hover:bg-emerald-600/70 ring-1 ring-emerald-500/50 text-emerald-100 cursor-pointer focus-visible:ring-emerald-400 active:scale-95'
                    : 'bg-slate-800/30 ring-1 ring-slate-700/30 text-slate-500 cursor-not-allowed'
            ].join(' ')}
            title={available ? `Move ${config.label} (${config.keys.filter((k) => k.length === 1).join('/')})` : `No exit ${config.label}`}
            aria-label={available ? `Move ${config.label}` : `No ${config.label} exit available`}
            aria-disabled={!buttonEnabled}
        >
            <span className="text-base sm:text-lg font-semibold">{config.shortLabel}</span>
            <span className="text-[10px] sm:text-xs mt-0.5 hidden sm:block">{config.label}</span>
            {exitInfo?.description && (
                <span className="text-[10px] text-emerald-200/80 mt-1 italic line-clamp-1" title={exitInfo.description}>
                    {exitInfo.description}
                </span>
            )}
        </button>
    )
}

/**
 * NavigationUI
 * Main component rendering direction buttons in a logical grid layout.
 */
export default function NavigationUI({ availableExits, onNavigate, disabled = false, className }: NavigationUIProps): React.ReactElement {
    // Build exit map for quick lookup: direction -> ExitInfo
    const exitMap = React.useMemo(() => {
        const map = new Map<Direction, ExitInfo>()
        availableExits.forEach((exit) => {
            map.set(exit.direction, exit)
        })
        return map
    }, [availableExits])

    // Build keyboard mapping: key -> direction
    const keyMap = React.useMemo(() => {
        const map = new Map<string, Direction>()
        DIRECTION_CONFIGS.forEach((config) => {
            config.keys.forEach((key) => {
                map.set(key, config.direction)
            })
        })
        return map
    }, [])

    // Keyboard shortcut handler
    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            // Ignore if modifier keys are pressed (Ctrl, Alt, Meta)
            if (event.ctrlKey || event.altKey || event.metaKey) {
                return
            }

            // Ignore if typing in an input/textarea
            const target = event.target as HTMLElement
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return
            }

            const direction = keyMap.get(event.key)
            if (direction && exitMap.has(direction) && !disabled) {
                event.preventDefault() // Prevent browser default (e.g., page scroll)
                onNavigate(direction)
            }
        },
        [keyMap, exitMap, onNavigate, disabled]
    )

    // Register keyboard event listener
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    // Group directions for layout
    const cardinals = DIRECTION_CONFIGS.filter((c) => c.group === 'cardinal')
    const intercardinals = DIRECTION_CONFIGS.filter((c) => c.group === 'intercardinal')
    const verticals = DIRECTION_CONFIGS.filter((c) => c.group === 'vertical')
    const radials = DIRECTION_CONFIGS.filter((c) => c.group === 'radial')

    // Check if there are no exits at all
    const hasNoExits = availableExits.length === 0

    // Detect pointer type to conditionally show keyboard hints
    const isPointerFine = usePointerFine()

    // Only show vertical/radial row when at least one such exit is available
    const hasVerticalOrRadialExits = [...verticals, ...radials].some((config) => exitMap.has(config.direction))

    return (
        <section className={['card rounded-xl p-4 sm:p-5', className].filter(Boolean).join(' ')} aria-labelledby="navigation-title">
            <h3 id="navigation-title" className="text-responsive-base font-semibold text-white mb-3">
                Navigate
            </h3>

            {hasNoExits ? (
                <p className="text-responsive-sm text-amber-400 italic text-center py-4">
                    No visible exits — this appears to be a dead end.
                </p>
            ) : (
                <>
                    {/* Cardinal & Intercardinal Directions - 3x3 Grid */}
                    <div className="mb-3 relative" role="group" aria-label="Cardinal and intercardinal directions">
                        {/* Compass Rose Background */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
                            <CompassRoseIcon className="w-full h-full max-w-[280px] max-h-[280px] opacity-30" />
                        </div>

                        <div className="grid grid-cols-3 gap-2 max-w-[300px] mx-auto relative z-10">
                            {/* Row 1: NW, N, NE */}
                            <DirectionButton
                                config={intercardinals.find((c) => c.direction === 'northwest')!}
                                exitInfo={exitMap.get('northwest')}
                                disabled={disabled}
                                onClick={() => onNavigate('northwest')}
                            />
                            <DirectionButton
                                config={cardinals.find((c) => c.direction === 'north')!}
                                exitInfo={exitMap.get('north')}
                                disabled={disabled}
                                onClick={() => onNavigate('north')}
                            />
                            <DirectionButton
                                config={intercardinals.find((c) => c.direction === 'northeast')!}
                                exitInfo={exitMap.get('northeast')}
                                disabled={disabled}
                                onClick={() => onNavigate('northeast')}
                            />

                            {/* Row 2: W, (center empty), E */}
                            <DirectionButton
                                config={cardinals.find((c) => c.direction === 'west')!}
                                exitInfo={exitMap.get('west')}
                                disabled={disabled}
                                onClick={() => onNavigate('west')}
                            />
                            <div className="flex items-center justify-center text-slate-500 text-xs" aria-hidden="true">
                                <span>◉</span>
                            </div>
                            <DirectionButton
                                config={cardinals.find((c) => c.direction === 'east')!}
                                exitInfo={exitMap.get('east')}
                                disabled={disabled}
                                onClick={() => onNavigate('east')}
                            />

                            {/* Row 3: SW, S, SE */}
                            <DirectionButton
                                config={intercardinals.find((c) => c.direction === 'southwest')!}
                                exitInfo={exitMap.get('southwest')}
                                disabled={disabled}
                                onClick={() => onNavigate('southwest')}
                            />
                            <DirectionButton
                                config={cardinals.find((c) => c.direction === 'south')!}
                                exitInfo={exitMap.get('south')}
                                disabled={disabled}
                                onClick={() => onNavigate('south')}
                            />
                            <DirectionButton
                                config={intercardinals.find((c) => c.direction === 'southeast')!}
                                exitInfo={exitMap.get('southeast')}
                                disabled={disabled}
                                onClick={() => onNavigate('southeast')}
                            />
                        </div>
                    </div>

                    {/* Vertical & Radial Directions - only shown when at least one exit is available */}
                    {hasVerticalOrRadialExits && (
                        <div className="flex justify-center gap-2 flex-wrap" role="group" aria-label="Vertical and radial directions">
                            {verticals.map((config) => (
                                <DirectionButton
                                    key={config.direction}
                                    config={config}
                                    exitInfo={exitMap.get(config.direction)}
                                    disabled={disabled}
                                    onClick={() => onNavigate(config.direction)}
                                />
                            ))}
                            {radials.map((config) => (
                                <DirectionButton
                                    key={config.direction}
                                    config={config}
                                    exitInfo={exitMap.get(config.direction)}
                                    disabled={disabled}
                                    onClick={() => onNavigate(config.direction)}
                                />
                            ))}
                        </div>
                    )}

                    {/* Keyboard shortcut hint - hidden on touch/coarse-pointer devices */}
                    {isPointerFine && (
                        <p className="mt-3 text-xs text-slate-400 text-center">
                            Keyboard: <span className="font-mono">Arrow keys</span> or <span className="font-mono">WASD</span> for cardinal
                            directions
                        </p>
                    )}
                </>
            )}
        </section>
    )
}

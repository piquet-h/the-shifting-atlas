import React from 'react'
import type { CommandInterfaceHandle } from '../CommandInterface'
import CommandInterface from '../CommandInterface'
import DescriptionRenderer from '../DescriptionRenderer'
import NavigationUI from '../NavigationUI'
import type { Direction } from '../hooks/useGameNavigationFlow'
import { CommandHistoryPanel, PlayerStatsPanel, type CommandHistoryItem, type PlayerStats } from './GameViewPanels'

interface ExitInfo {
    direction: Direction
    description?: string
}

interface GameViewLayoutProps {
    className?: string
    isTablet: boolean
    isDesktop: boolean
    playerGuid?: string | null
    navigationUIEnabled: boolean
    availableExitsWithHints: ExitInfo[]
    availableExitDirections: string[]
    onNavigate: (direction: Direction) => void
    navigationDisabled: boolean
    playerStats: PlayerStats | null
    commandHistory: CommandHistoryItem[]
    commandInterfaceRef: React.RefObject<CommandInterfaceHandle | null>
    locationName?: string
    locationDescription?: string
}

export default function GameViewLayout({
    className,
    isTablet,
    isDesktop,
    playerGuid,
    navigationUIEnabled,
    availableExitsWithHints,
    availableExitDirections,
    onNavigate,
    navigationDisabled,
    playerStats,
    commandHistory,
    commandInterfaceRef,
    locationName,
    locationDescription
}: GameViewLayoutProps): React.ReactElement {
    return (
        <div className={['flex flex-col gap-4 sm:gap-5', isTablet || isDesktop ? 'h-full' : '', className].filter(Boolean).join(' ')}>
            {isDesktop ? (
                <div className="grid grid-cols-12 gap-4 lg:gap-5 h-full">
                    <div className="col-span-8 flex flex-col gap-4 lg:gap-5 h-full">
                        <div className="card rounded-xl flex flex-col flex-1 min-h-0 overflow-hidden">
                            <section
                                aria-labelledby="game-story-title-desktop"
                                className="flex flex-col flex-1 min-h-0 p-4"
                            >
                                <h3 id="game-story-title-desktop" className="text-responsive-base font-semibold text-white mb-3">
                                    Story Narrative
                                </h3>
                                <div className="flex-1 min-h-0 overflow-auto">
                                    {locationName && (
                                        <h4 className="text-responsive-base font-medium text-white mb-2">{locationName}</h4>
                                    )}
                                    <DescriptionRenderer content={locationDescription ?? ''} />
                                </div>
                            </div>
                            <section
                                aria-labelledby="game-command-title-desktop"
                                className="flex flex-col flex-1 min-h-0 border-t border-white/10 p-4"
                            >
                                <h3 id="game-command-title-desktop" className="text-responsive-base font-semibold text-white mb-3">
                                    Commands
                                </h3>
                                <div className="flex flex-col flex-1 min-h-0">
                                    <CommandInterface
                                        ref={commandInterfaceRef}
                                        availableExits={availableExitDirections}
                                        onMoveCommand={onNavigate}
                                        externalBusy={navigationDisabled}
                                        className="flex-1"
                                    />
                                </div>
                            </section>
                        </section>
                    </div>
                    <aside className="col-span-4 flex flex-col gap-4 lg:gap-5">
                        {playerGuid && navigationUIEnabled && (
                            <NavigationUI availableExits={availableExitsWithHints} onNavigate={onNavigate} disabled={navigationDisabled} />
                        )}
                        <PlayerStatsPanel stats={playerStats} />
                        <CommandHistoryPanel history={commandHistory} />
                    </aside>
                </div>
            ) : isTablet ? (
                <div className="grid grid-cols-12 gap-4 sm:gap-5 h-full">
                    <div className="col-span-8 flex flex-col gap-4 sm:gap-5 h-full">
                        <section
                            aria-labelledby="game-command-title-tablet"
                            className="card rounded-xl flex flex-col flex-1 min-h-0 overflow-hidden"
                        >
                            <h3 id="game-command-title-tablet" className="text-responsive-base font-semibold text-white mb-3">
                                Your Atlas
                            </h3>
                            <div className="flex flex-col flex-1 min-h-0">
                                <CommandInterface
                                    ref={commandInterfaceRef}
                                    availableExits={availableExitDirections}
                                    onMoveCommand={onNavigate}
                                    externalBusy={navigationDisabled}
                                    className="flex-1"
                                />
                            </div>
                        </section>
                    </div>
                    <aside className="col-span-4 flex flex-col gap-4 sm:gap-5">
                        {playerGuid && navigationUIEnabled && (
                            <NavigationUI availableExits={availableExitsWithHints} onNavigate={onNavigate} disabled={navigationDisabled} />
                        )}
                        <PlayerStatsPanel stats={playerStats} />
                        <CommandHistoryPanel history={commandHistory} />
                    </aside>
                </div>
            ) : (
                <>
                    {playerGuid && navigationUIEnabled && (
                        <NavigationUI availableExits={availableExitsWithHints} onNavigate={onNavigate} disabled={navigationDisabled} />
                    )}
                    <PlayerStatsPanel stats={playerStats} collapsible={true} />
                    <section
                        aria-labelledby="game-command-title-mobile"
                        className="card rounded-xl flex flex-col flex-1 min-h-[200px] overflow-hidden"
                    >
                        <h3 id="game-command-title-mobile" className="text-responsive-base font-semibold text-white mb-3">
                            Your Atlas
                        </h3>
                        <div className="flex flex-col flex-1 min-h-0">
                            <CommandInterface
                                ref={commandInterfaceRef}
                                availableExits={availableExitDirections}
                                onMoveCommand={onNavigate}
                                externalBusy={navigationDisabled}
                                className="flex-1"
                            />
                        </div>
                    </section>
                    <CommandHistoryPanel history={commandHistory} />
                </>
            )}
        </div>
    )
}

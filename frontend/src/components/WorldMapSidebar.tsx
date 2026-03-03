import React from 'react'

export interface WorldMapSidebarProps {
    showOutsideNodes: boolean
    setShowOutsideNodes: (value: boolean) => void
    showInsideNodes: boolean
    setShowInsideNodes: (value: boolean) => void

    sameLevelOnly: boolean
    setSameLevelOnly: (value: boolean) => void

    distanceScale: number
    setDistanceScale: (value: number) => void

    selectedName: string | null
    selectedId: string | null

    focusName: string | null
    focusId: string | null

    focusDepth: 0 | 1 | 2 | 3
    setFocusDepth: (value: 0 | 1 | 2 | 3) => void

    onFocusSelected: () => void
    onClearFocus: () => void
    onReset: () => void
}

export default function WorldMapSidebar(props: WorldMapSidebarProps): React.ReactElement {
    const hasFocus = !!props.focusId
    const hasSelection = !!props.selectedId
    const sameFloorDisabled = !hasFocus

    return (
        <aside
            className="absolute left-3 top-3 z-20 w-[280px] max-w-[calc(100%-1.5rem)] rounded-lg border border-white/10 bg-atlas-card/90 backdrop-blur px-3 py-3 text-sm text-slate-200 shadow-lg"
            aria-label="Map controls"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200">Map controls</p>
                    <p className="text-[11px] text-slate-400">
                        Click a node to select. Double-click to focus (double-click again to clear).
                    </p>
                </div>
                <button
                    type="button"
                    className="text-[11px] text-slate-300 hover:text-white underline underline-offset-2"
                    onClick={props.onReset}
                >
                    Reset
                </button>
            </div>

            <div className="mt-3 rounded-md border border-white/5 bg-atlas-bg/20 px-2.5 py-2">
                <div className="text-[11px] text-slate-400">
                    Selected: <span className="text-slate-200">{props.selectedName ?? '—'}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                    Focus: <span className="text-slate-200">{props.focusName ?? '—'}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                    <button
                        type="button"
                        className="text-[11px] px-2 py-1 rounded border border-white/10 bg-atlas-bg/40 hover:bg-atlas-bg/60 disabled:opacity-40"
                        disabled={!hasSelection}
                        onClick={props.onFocusSelected}
                        title={hasSelection ? 'Set focus to the selected node' : 'Select a node first'}
                    >
                        Focus selected
                    </button>
                    <button
                        type="button"
                        className="text-[11px] px-2 py-1 rounded border border-white/10 bg-atlas-bg/40 hover:bg-atlas-bg/60 disabled:opacity-40"
                        disabled={!hasFocus}
                        onClick={props.onClearFocus}
                    >
                        Clear focus
                    </button>
                </div>

                <div className="mt-2 flex items-center justify-between">
                    <label className="text-xs text-slate-300" htmlFor="map-focus-depth">
                        Depth
                    </label>
                    <select
                        id="map-focus-depth"
                        className="bg-atlas-bg/40 border border-white/10 rounded px-2 py-1 text-xs disabled:opacity-40"
                        value={props.focusDepth}
                        onChange={(e) => props.setFocusDepth(Number(e.target.value) as 0 | 1 | 2 | 3)}
                        disabled={!hasFocus}
                    >
                        <option value={0}>0</option>
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                    </select>
                </div>
                {!hasFocus && <p className="mt-1 text-[11px] text-slate-500">Set focus to enable depth & floor slicing.</p>}
            </div>

            <div className="mt-3">
                <p className="text-xs font-semibold text-slate-200">Visibility</p>
                <div className="mt-2 space-y-2">
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-emerald-300"
                            checked={props.showOutsideNodes}
                            onChange={(e) => props.setShowOutsideNodes(e.target.checked)}
                        />
                        <span>Outside nodes</span>
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-sky-300"
                            checked={props.showInsideNodes}
                            onChange={(e) => props.setShowInsideNodes(e.target.checked)}
                        />
                        <span>Inside nodes</span>
                    </label>
                    <label
                        className="flex items-center gap-2"
                        title={sameFloorDisabled ? 'Requires a focused node' : 'Slice to the same derived floor as focus'}
                    >
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-amber-300 disabled:opacity-40"
                            checked={props.sameLevelOnly}
                            onChange={(e) => props.setSameLevelOnly(e.target.checked)}
                            disabled={sameFloorDisabled}
                        />
                        <span>Same floor slice</span>
                    </label>
                    <p className="text-[11px] text-slate-500">
                        Uses <span className="font-mono">up/down</span> exits to infer floors (+1 upstairs, −1 cellar).
                    </p>
                </div>
            </div>

            <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-xs font-semibold text-slate-200">Layout</p>
                <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                        <label className="text-xs text-slate-300" htmlFor="map-distance-scale">
                            Layout scale
                        </label>
                        <span className="text-[11px] tabular-nums text-slate-400">{props.distanceScale.toFixed(1)}×</span>
                    </div>
                    <input
                        id="map-distance-scale"
                        type="range"
                        min={0.8}
                        max={3.2}
                        step={0.1}
                        value={props.distanceScale}
                        onChange={(e) => props.setDistanceScale(Number(e.target.value))}
                        className="w-full accent-emerald-300"
                    />
                    <p className="text-[11px] text-slate-400">Spreads nodes out without changing travel times.</p>
                </div>
            </div>
        </aside>
    )
}

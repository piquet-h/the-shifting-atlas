import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import WorldMapSidebar from '../src/components/WorldMapSidebar'

describe('WorldMapSidebar', () => {
    it('disables "Same floor slice" until a focus node is set', async () => {
        const user = userEvent.setup()
        const setSameLevelOnly = vi.fn()

        render(
            <WorldMapSidebar
                showOutsideNodes={true}
                setShowOutsideNodes={vi.fn()}
                showInsideNodes={true}
                setShowInsideNodes={vi.fn()}
                sameLevelOnly={false}
                setSameLevelOnly={setSameLevelOnly}
                distanceScale={1.8}
                setDistanceScale={vi.fn()}
                selectedName={null}
                selectedId={null}
                focusName={null}
                focusId={null}
                focusDepth={1}
                setFocusDepth={vi.fn()}
                onFocusSelected={vi.fn()}
                onClearFocus={vi.fn()}
                onReset={vi.fn()}
            />
        )

        const sameFloor = screen.getByRole('checkbox', { name: /same floor slice/i })
        expect(sameFloor).toBeDisabled()

        await user.click(sameFloor)
        expect(setSameLevelOnly).not.toHaveBeenCalled()
    })

    it('enables depth selection only when focus is set', () => {
        const { rerender } = render(
            <WorldMapSidebar
                showOutsideNodes={true}
                setShowOutsideNodes={vi.fn()}
                showInsideNodes={true}
                setShowInsideNodes={vi.fn()}
                sameLevelOnly={false}
                setSameLevelOnly={vi.fn()}
                distanceScale={1.8}
                setDistanceScale={vi.fn()}
                selectedName={null}
                selectedId={null}
                focusName={null}
                focusId={null}
                focusDepth={1}
                setFocusDepth={vi.fn()}
                onFocusSelected={vi.fn()}
                onClearFocus={vi.fn()}
                onReset={vi.fn()}
            />
        )

        expect(screen.getByLabelText(/depth/i)).toBeDisabled()

        rerender(
            <WorldMapSidebar
                showOutsideNodes={true}
                setShowOutsideNodes={vi.fn()}
                showInsideNodes={true}
                setShowInsideNodes={vi.fn()}
                sameLevelOnly={false}
                setSameLevelOnly={vi.fn()}
                distanceScale={1.8}
                setDistanceScale={vi.fn()}
                selectedName={'Mosswell River Jetty'}
                selectedId={'jetty'}
                focusName={'Mosswell River Jetty'}
                focusId={'jetty'}
                focusDepth={1}
                setFocusDepth={vi.fn()}
                onFocusSelected={vi.fn()}
                onClearFocus={vi.fn()}
                onReset={vi.fn()}
            />
        )

        expect(screen.getByLabelText(/depth/i)).toBeEnabled()
    })

    it('invokes reset action', async () => {
        const user = userEvent.setup()
        const onReset = vi.fn()

        render(
            <WorldMapSidebar
                showOutsideNodes={true}
                setShowOutsideNodes={vi.fn()}
                showInsideNodes={true}
                setShowInsideNodes={vi.fn()}
                sameLevelOnly={false}
                setSameLevelOnly={vi.fn()}
                distanceScale={1.8}
                setDistanceScale={vi.fn()}
                selectedName={null}
                selectedId={null}
                focusName={null}
                focusId={null}
                focusDepth={1}
                setFocusDepth={vi.fn()}
                onFocusSelected={vi.fn()}
                onClearFocus={vi.fn()}
                onReset={onReset}
            />
        )

        await user.click(screen.getByRole('button', { name: /reset/i }))
        expect(onReset).toHaveBeenCalledTimes(1)
    })
})

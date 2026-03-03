import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

describe('CommandOutput - Scrollbar Styling', () => {
    it('scopes custom scrollbar styling to the narrative log container', async () => {
        const { default: CommandOutput } = await import('../src/components/CommandOutput')

        const markup = renderToString(
            <CommandOutput
                items={[
                    {
                        id: 'cmd-1',
                        command: 'look',
                        response: 'You look around.',
                        ts: 0
                    }
                ]}
            />
        )

        // We want the custom scrollbar ONLY on the scrollable narrative window (not globally).
        // This test asserts the scrollable container opts-in via a dedicated class.
        expect(markup).toMatch(/scrollbar-atlas/)

        // And it should remain the overflow container.
        expect(markup).toMatch(/overflow-auto/)
        expect(markup).toMatch(/(scrollbar-atlas[^"]*overflow-auto|overflow-auto[^"]*scrollbar-atlas)/)
    })
})

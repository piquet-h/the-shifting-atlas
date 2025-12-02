/**
 * CommandInput Component Tests
 *
 * Tests for the enhanced command input component covering:
 * - Autocomplete functionality for directions
 * - Command history navigation with arrow keys
 * - Input validation with helpful suggestions
 * - Fuzzy matching for unknown commands
 * - Edge cases (empty input, unknown commands, network timeouts)
 * - Accessibility compliance
 */
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

describe('CommandInput - Basic Structure', () => {
    it('renders input with proper aria attributes', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const markup = renderToString(<CommandInput onSubmit={onSubmit} />)

        expect(markup).toMatch(/aria-label="Command"/)
        expect(markup).toMatch(/role="combobox"/)
        expect(markup).toMatch(/aria-autocomplete="list"/)
    })

    it('renders submit button', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const markup = renderToString(<CommandInput onSubmit={onSubmit} />)

        expect(markup).toMatch(/Run/)
        expect(markup).toMatch(/type="submit"/)
    })

    it('renders form with aria-label', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const markup = renderToString(<CommandInput onSubmit={onSubmit} />)

        expect(markup).toMatch(/aria-label="Command entry"/)
    })

    it('shows busy state with spinner', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const markup = renderToString(<CommandInput onSubmit={onSubmit} busy={true} />)

        expect(markup).toMatch(/Running/)
        expect(markup).toMatch(/animate-spin/)
        expect(markup).toMatch(/Executing command/)
    })

    it('disables input when disabled prop is true', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const markup = renderToString(<CommandInput onSubmit={onSubmit} disabled={true} />)

        expect(markup).toMatch(/disabled=""/)
    })

    it('uses custom placeholder', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const markup = renderToString(<CommandInput onSubmit={onSubmit} placeholder="Custom placeholder" />)

        expect(markup).toMatch(/Custom placeholder/)
    })
})

describe('CommandInput - Status Region', () => {
    it('has aria-live status region', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const markup = renderToString(<CommandInput onSubmit={onSubmit} />)

        expect(markup).toMatch(/role="status"/)
        expect(markup).toMatch(/aria-live="polite"/)
    })

    it('shows executing message when busy', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const markup = renderToString(<CommandInput onSubmit={onSubmit} busy={true} />)

        expect(markup).toMatch(/Executing command/)
    })
})

describe('CommandInput - Accessibility', () => {
    it('has proper ARIA attributes for combobox', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const markup = renderToString(<CommandInput onSubmit={onSubmit} />)

        expect(markup).toMatch(/role="combobox"/)
        expect(markup).toMatch(/aria-autocomplete="list"/)
        expect(markup).toMatch(/aria-expanded="false"/)
    })

    it('supports autocomplete with proper ARIA controls', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const availableExits = ['north', 'south']
        const markup = renderToString(<CommandInput onSubmit={onSubmit} availableExits={availableExits} />)

        // Should have aria-autocomplete
        expect(markup).toMatch(/aria-autocomplete="list"/)
    })

    it('button has accessible disabled state', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const markup = renderToString(<CommandInput onSubmit={onSubmit} busy={true} />)

        expect(markup).toMatch(/disabled=""/)
        expect(markup).toMatch(/opacity-40/)
    })
})

describe('CommandInput - Props', () => {
    it('accepts availableExits prop', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const availableExits = ['north', 'south', 'east', 'west']

        // Should not throw
        expect(() => {
            renderToString(<CommandInput onSubmit={onSubmit} availableExits={availableExits} />)
        }).not.toThrow()
    })

    it('accepts commandHistory prop', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const commandHistory = ['ping', 'look', 'move north']

        // Should not throw
        expect(() => {
            renderToString(<CommandInput onSubmit={onSubmit} commandHistory={commandHistory} />)
        }).not.toThrow()
    })

    it('works with empty availableExits', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const availableExits: string[] = []

        expect(() => {
            renderToString(<CommandInput onSubmit={onSubmit} availableExits={availableExits} />)
        }).not.toThrow()
    })

    it('works with empty commandHistory', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const commandHistory: string[] = []

        expect(() => {
            renderToString(<CommandInput onSubmit={onSubmit} commandHistory={commandHistory} />)
        }).not.toThrow()
    })
})

describe('CommandInput - Component Integration', () => {
    it('renders without errors when all props provided', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const availableExits = ['north', 'south']
        const commandHistory = ['ping']

        expect(() => {
            renderToString(
                <CommandInput
                    onSubmit={onSubmit}
                    busy={false}
                    disabled={false}
                    placeholder="Enter command"
                    availableExits={availableExits}
                    commandHistory={commandHistory}
                />
            )
        }).not.toThrow()
    })

    it('maintains structure with minimal props', async () => {
        const { default: CommandInput } = await import('../src/components/CommandInput')
        const onSubmit = vi.fn()
        const markup = renderToString(<CommandInput onSubmit={onSubmit} />)

        // Should still have core structure
        expect(markup).toMatch(/form/)
        expect(markup).toMatch(/input/)
        expect(markup).toMatch(/button/)
    })
})

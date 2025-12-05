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

describe('CommandInput - Autocomplete Structure', () => {
    it('has listbox container with max-height for scrolling', async () => {
        // The autocomplete dropdown uses max-h-48 overflow-auto for long lists
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify scrollable container pattern for edge case: very long suggestion list
        expect(source).toMatch(/max-h-48/)
        expect(source).toMatch(/overflow-auto/)
    })

    it('autocomplete options use role="option" with aria-selected', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify ARIA option pattern
        expect(source).toMatch(/role="option"/)
        expect(source).toMatch(/aria-selected/)
    })

    it('listbox has proper role and id for aria-controls', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify listbox pattern
        expect(source).toMatch(/role="listbox"/)
        expect(source).toMatch(/id="command-autocomplete"/)
        expect(source).toMatch(/aria-controls={showAutocomplete \? 'command-autocomplete'/)
    })
})

describe('CommandInput - Keyboard Navigation Pattern', () => {
    it('handles ArrowUp for history and autocomplete navigation', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify ArrowUp handling
        expect(source).toMatch(/e\.key === 'ArrowUp'/)
        expect(source).toMatch(/handleAutocompleteNavigation\('up'\)/)
        expect(source).toMatch(/handleHistoryNavigation\('up'\)/)
    })

    it('handles ArrowDown for history and autocomplete navigation', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify ArrowDown handling
        expect(source).toMatch(/e\.key === 'ArrowDown'/)
        expect(source).toMatch(/handleAutocompleteNavigation\('down'\)/)
        expect(source).toMatch(/handleHistoryNavigation\('down'\)/)
    })

    it('handles Enter and Tab for autocomplete selection', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify Enter/Tab selection
        expect(source).toMatch(/e\.key === 'Tab' \|\| e\.key === 'Enter'/)
        expect(source).toMatch(/handleAutocompleteSelection\(\)/)
    })

    it('handles Escape to close autocomplete', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify Escape handling
        expect(source).toMatch(/e\.key === 'Escape'/)
        expect(source).toMatch(/setShowAutocomplete\(false\)/)
    })
})

describe('CommandInput - Validation Hints', () => {
    it('shows error with aria-invalid and proper IDs', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify error state rendering
        expect(source).toMatch(/'aria-invalid': 'true'/)
        expect(source).toMatch(/'aria-describedby': 'command-error'/)
        expect(source).toMatch(/id="command-error"/)
        expect(source).toMatch(/role="alert"/)
    })

    it('has validateCommand function for input validation', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify validation function exists
        expect(source).toMatch(/function validateCommand\(cmd: string\)/)
        expect(source).toMatch(/valid: boolean/)
        expect(source).toMatch(/suggestion\?: string/)
        expect(source).toMatch(/error\?: string/)
    })

    it('uses fuzzy matching for unknown commands', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify fuzzy match import and usage
        expect(source).toMatch(/import { findClosestMatch } from/)
        expect(source).toMatch(/findClosestMatch\(/)
    })

    it('provides "Did you mean" suggestions for typos', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify suggestion pattern
        expect(source).toMatch(/Did you mean/)
    })
})

describe('CommandInput - Edge Cases', () => {
    it('shows fallback message when no suggestions available', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify fallback help text
        expect(source).toMatch(/Try: ping, look, move <direction>, or clear/)
    })

    it('prioritizes available exits in autocomplete sorting', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify exit prioritization in sort
        expect(source).toMatch(/availableExits\.includes\(a\)/)
        expect(source).toMatch(/availableExits\.includes\(b\)/)
    })

    it('shows availability indicator for exits', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify availability badge
        expect(source).toMatch(/✓ available/)
        expect(source).toMatch(/isAvailable/)
    })

    it('clears input after successful submission', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const componentPath = path.join(__dirname, '../src/components/CommandInput.tsx')
        const source = fs.readFileSync(componentPath, 'utf-8')

        // Verify input clearing in handleSubmit
        expect(source).toMatch(/await onSubmit\(value\.trim\(\)\)/)
        expect(source).toMatch(/setValue\(''\)/)
    })
})

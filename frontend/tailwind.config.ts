import forms from '@tailwindcss/forms'
import typography from '@tailwindcss/typography'
import type { Config } from 'tailwindcss'

// Converted from tailwind.config.js to TypeScript for typed authoring and IDE support.
// Keep content globs in sync with component + page locations.
const config: Config = {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        container: {
            center: true,
            padding: {
                DEFAULT: '1rem',
                sm: '1.25rem',
                lg: '2rem',
                xl: '2.5rem',
                '2xl': '3rem'
            }
        },
        extend: {
            colors: {
                atlas: {
                    accent: '#6ee7b7',
                    bg: '#0f1724',
                    bgDark: '#071226',
                    card: '#0b1220',
                    muted: '#9aa4b2',
                    glass: 'rgba(255,255,255,0.04)'
                }
            },
            screens: {
                // Add a widescreen breakpoint for expansive desktop layouts
                '3xl': '1920px'
            },
            boxShadow: {
                inset: 'inset 0 1px 0 0 rgba(255,255,255,0.06)'
            }
        }
    },
    plugins: [typography, forms],
    corePlugins: {
        preflight: true
    }
}

export default config

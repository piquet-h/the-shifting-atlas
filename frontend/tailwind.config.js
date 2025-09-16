/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        extend: {
            colors: {
                atlas: {
                    accent: '#6ee7b7',
                    bg: '#0f1724',
                    bgDark: '#071226',
                    card: '#0b1220',
                    muted: '#9aa4b2',
                    glass: 'rgba(255,255,255,0.04)',
                },
            },
        },
    },
    plugins: [require('@tailwindcss/typography'), require('@tailwindcss/forms')],
    corePlugins: {
        preflight: true,
    },
};

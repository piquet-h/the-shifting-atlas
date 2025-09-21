// ESM PostCSS configuration. Vite will prefer this when resolving.
// Tailwind first to generate utilities, then Autoprefixer for vendor prefixes.
export default {
    plugins: {
        tailwindcss: {},
        autoprefixer: {},
    },
};

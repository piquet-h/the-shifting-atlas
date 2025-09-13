# Frontend (Vite + React + Tailwind)

Mobile‑first client prototype for The Shifting Atlas. Includes a minimal health check call and simple navigation.

## Quick Start

From this directory:

```bash
npm install
npm run dev
```

Build production bundle:

```bash
npm run build
```

Preview production build locally:

```bash
npm run preview
```

## Notable Files

- `index.html` – Vite entry
- `src/main.jsx` – React bootstrap
- `src/App.jsx` – Root component + Router outlet
- `src/components/EntryPage.tailwind.jsx` – Initial landing UI (utility-first styles)
- `src/components/Nav.jsx` – Simple navigation
- `src/pages/About.jsx` – Example secondary page
- `src/services/api.js` – Minimal API wrapper (currently for health check)
- `tailwind.config.js` – Tailwind configuration

## Co-Located API (`api/`)

The `api/` folder houses Azure Static Web Apps style Functions (e.g., `HealthCheck`, `HttpPlayerActions`). These are early stubs; logic will move / expand as backend services mature. When deployed via an Azure Static Web App, routes are available under `/api/*`.

During plain `vite dev`, these functions are not automatically executed. To test them locally as Functions, you can run the Functions host from inside `api/` with Azure Functions Core Tools.

## Styling

Tailwind CSS with the Typography and Forms plugins enabled. Global styles live in `src/tailwind.css` and `src/styles.css`.

## Roadmap

- Add stateful player session handling (local stub + remote integration).
- Introduce UI components for room traversal and NPC interactions.
- Implement API error surface + loading skeletons.

## Notes

This frontend is intentionally lean; domain logic resides in backend Functions and will be invoked through a typed client layer later.

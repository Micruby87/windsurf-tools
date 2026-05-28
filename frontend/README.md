# Windsurf Tools Frontend

React 18 + TypeScript + Vite + Zustand frontend for the Wails desktop app.

## Scripts

- `npm run dev` — start the Vite dev server.
- `npm run typecheck` — run `tsc --noEmit`.
- `npm run build` — build production assets for Wails.
- `npm run preview` — preview the Vite build output.

## Structure

- `src/views` — top-level product views.
- `src/components` — shared UI components.
- `src/stores` — Zustand state stores.
- `src/api/wails.ts` — typed API facade over generated Wails bindings.
- `wailsjs` — generated Wails runtime and Go bindings.

# Sailing club app

React 19 + Vite + Tailwind 4 PWA (Hebrew, RTL) on Supabase. Without Supabase settings the app runs in
demo mode (`LocalStore`, data in localStorage), which is what the browser tests use.

## After every change

Run all of these before committing, and fix what they find:

1. `bun run lint` (TypeScript)
2. `bun run test` (logic, weather, booking, accessibility and database-schema tests)
3. `bun run test:e2e` (Playwright, demo mode). It covers:
   - `screens.spec.ts`: every screen and window at 320 / 390 / 768 / 1440px, checking that nothing is cut off or spills sideways.
   - `buttons.spec.ts`: presses every button on every screen and checks for errors, that windows open, fit and close (Escape included), and that each press has a visible response.
   - `flows.spec.ts`: the main user journeys, with a tap budget for common tasks.
   - `quality.spec.ts`: axe accessibility checks (WCAG AA) and minimum touch-target size.
4. Look at the screenshots of the screens you touched in `e2e-results/screens/<size>/` and at the
   per-button report in `e2e-results/buttons/`. Judge the UI and the UX, not only whether tests
   pass. Is it clear, are common tasks short, is it comfortable on a phone? Improve it when it isn't.

When adding a screen, window or feature:
- Add it to `e2e/screens.ts`, so it gets the layout, button and accessibility checks.
- Add its main journey to `e2e/flows.spec.ts`.
- Seed any data it needs in `e2e/seed.setup.ts`.

`bun run test:e2e -- --project=screens-390` runs a single project. Locally the tests reuse a dev server
already running on port 4321.

## Conventions

- Talk to the user in Hebrew.
- Modal windows render through `components/Overlay.tsx` (a portal into `<body>`). Pass `onClose`, so
  Escape closes the window.
- Glass design classes (`glass`, `glass-sheet`, `glass-bar`, `glass-backdrop`) live in `src/index.css`.
- Never commit `.env.local` or any keys. The admin tutorial video lives in the private
  `staff-tutorials` Supabase bucket, not in `public/`.

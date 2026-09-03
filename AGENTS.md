# SOUND / FIELD: agent guide

## Project

- This is a Vite + TypeScript browser application for three Web Audio tools:
  `spectrum-field.html`, `noise-field.html`, and `modulate-field.html`.
- Keep page entry points in `src/pages/`, feature-specific code in the matching
  `src/<feature>/` directory, and reusable browser utilities in `src/shared/`.
- The UI is intentionally dependency-light: use the DOM and Canvas/Web Audio APIs
  directly unless a new dependency is clearly justified.

## Development

- Install dependencies with `npm ci`.
- Start the development server with `npm run dev`.
- Run the quality checks relevant to every code change:
  - `npm run check`
  - `npm test`
- Run `npm run build` before handing off changes that affect the build or page
  entry points. It includes the type and code checks.

## TypeScript and UI conventions

- TypeScript is strict, including `noUncheckedIndexedAccess`; handle possibly
  absent array elements and DOM values explicitly.
- Use `import type` for type-only imports, and prefer named exports.
- Keep DOM lookup, event binding, and element updates in each feature's `view.ts`
  module where practical. Keep audio/signal processing independent of DOM code
  so it remains unit-testable.
- Preserve accessible controls: update visible state together with relevant ARIA
  attributes, and retain keyboard support when changing interactive widgets.
- User-facing copy goes through `src/shared/i18n.ts` when a translation exists;
  update both supported languages when adding new copy.
- Keep CSS scoped to the appropriate file in `src/styles/` or the feature
  stylesheet; do not add generated assets or `dist/` output to source control.

## Testing and verification

- Add or update Vitest coverage in `tests/` for behavior that does not require a
  real browser or audio device.
- For Web Audio or Canvas changes, also follow the relevant scenarios in
  `notes/SMOKE-TEST.md` in a Chromium-based browser.
- Do not overwrite unrelated working-tree changes. The repository may contain
  in-progress notes or edits from another contributor.

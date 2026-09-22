# AGENTS.md

## Commands

- Install: `yarn install`
- Dev server: `yarn dev`
- Build (type-check + bundle): `yarn build`
- Type-check only: `yarn type-check`
- Unit tests: `yarn test:unit` (single run: `yarn test:unit run`)
- Lint + format: `yarn lint`

Always run `yarn lint`, `yarn type-check` and `yarn test:unit run` before finishing a task.

## Project overview

CrystalViewer is a pure front-end space-group (crystallographic) cell viewer. Vue 3 + TypeScript +
Vite + Pinia + Element Plus + Three.js. See `docs/实施规划.md` for the implementation plan.

## Space-group dataset

The 230 space-group records in `src/data/` are **generated**, do not hand-edit them.
Regenerate with an isolated Python 3.13 environment:

```sh
uv run --python 3.13 --with pyxtal --with spglib scripts/generate-spacegroups.py
```

The generator derives symmetry operations from spglib and Wyckoff positions from pyxtal, and runs
built-in validation checks before writing the JSON files.

## Conventions

- `src/lib/` holds pure, unit-tested logic (lattice transforms, coordinate expression parsing,
  symmetry atom generation, space-group matching). Keep rendering code out of it.
- Three.js objects must never become reactive: keep them in plain `let` variables inside
  `CrystalViewer.vue`, never in `ref`/`reactive`.
- The store is defined in `src/stores/crystal.ts`; components read it via `useCrystalStore()`.
- Comments are written in English; UI copy is Simplified Chinese.

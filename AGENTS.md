# AGENTS.md

Instructions for AI coding agents working in this repo. Follow these or you will repeatedly redo work that has already been figured out.

## Project at a glance

Personal finance dashboard (Norwegian) — budget, sinking funds, assets, loans, recap. Anonymous: each dashboard is a UUID the user stores; no accounts, no email.

- **Framework:** TanStack Start (React 19, SSR) on Netlify Functions
- **Styling:** Tailwind CSS 4 (via `@tailwindcss/vite`)
- **Data:** Netlify Database (Postgres) + Drizzle ORM
- **Build/test/lint:** Vite+ (`vp`) — wraps Vite 8, Vitest, Oxlint, Oxfmt, tsdown
- **Deploy:** Netlify (auto from `main`) — site id `2e0830d2-6e2f-47fd-b7d0-f111d5985ab8`, live at https://personal-finance-dashboard-dre90.netlify.app
- **Language in UI strings:** Norwegian (Bokmål). Be careful with encoding (see below).

## Workflow

1. Make changes.
2. `vp check --fix` — fmt + lint + typecheck. Must be clean before commit.
3. `vp build` — must pass and must produce `.netlify/v1/functions/server.mjs` and `dist/client/assets/`.
4. Commit with the `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer.
5. Push to `main`. Netlify deploys automatically.
6. Verify deploy via `netlify api listSiteDeploys --data '{"site_id":"2e0830d2-6e2f-47fd-b7d0-f111d5985ab8"}'`.

Do **not** commit unless the user asked for changes to be shipped. Do **not** push automatically without confirmation when changes are risky.

## Commands

| Task                      | Command                                         |
| ------------------------- | ----------------------------------------------- |
| Install deps              | `vp install` (or `npm install` — both work)     |
| Dev server                | `vp dev`                                        |
| Format + lint + typecheck | `vp check` (add `--fix` to auto-fix)            |
| Build                     | `vp build`                                      |
| Tests                     | `vp test` (no tests yet)                        |
| DB migrations             | `npm run db:generate` then `npm run db:migrate` |

## Critical gotchas (learned the hard way — do NOT undo these)

### 1. `useSyncExternalStore` snapshot must be a primitive

`app/lib/query.ts` returns `entry.version` (a number that increments on each notify) from `getSnapshot`, **not** the `entry` object. Returning the same mutated object made React skip re-renders. If you touch the cache, preserve the `version: number` field and bump it in `notify()`.

### 2. Norwegian text + PowerShell = mojibake

Never do `Get-Content -Raw <file> | -replace ... | Set-Content` on files with Norwegian characters (æ, ø, å). PowerShell 5 reads as Windows-1252 by default. Use the `edit` tool, or read explicitly as UTF-8:

```powershell
[System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
```

If mojibake appears (`Ã¸` for `ø`, `Ã¥` for `å`, `Â·` for `·`): read UTF-8 → encode to Windows-1252 bytes → decode as UTF-8 → write back as UTF-8 _without BOM_.

### 3. Vite+ / Netlify constraints

- **No `devEngines.packageManager` in `package.json`.** Netlify build runners pin npm at minor versions (e.g. 11.16.x) and an exact match like `11.17.0` causes `EBADDEVENGINES` even with `onFail: "download"`. Pin Node/npm via `netlify.toml`'s `[build.environment]` instead.
- **Pin `vite-plus` and `@voidzero-dev/vite-plus-core` to exact versions**, never `latest`. CI dislikes `latest` in `overrides`.
- **Keep these in `vite.config.ts`** — they are required for Netlify SSR to work:
  - `environments.ssr.build.rollupOptions.output.inlineDynamicImports: true` (deprecation warning is OK)
  - `esbuild.jsx: "automatic"`
  - Plugins wrapped in `lazyPlugins(() => [...])` so lint/fmt blocks don't double-load them
- **`netlify.toml` builds with `npm run build`**, which delegates to `vp build`. Don't change without testing the deploy.

### 4. Recharts `<Tooltip>` typing

`app/components/charts.tsx` uses `const TT = Tooltip as any` — Recharts' internal generics don't infer from props. Don't try to "fix" the cast unless Recharts updates their types.

## File layout

```
app/
  components/       Shared UI primitives (AppShell, charts, ui, Toaster, SnapshotModal)
  lib/              Hooks + utilities (query, auth, forms, defaults, enums, colors, utils, dashboard-context)
  routes/           TanStack Router routes (file-based)
    dashboard/      Nested dashboard pages
  server/           Server functions (api.ts is the main one; _helpers.ts is shared)
  styles/app.css    Tailwind entry + semantic CSS layer
  routeTree.gen.ts  AUTO-GENERATED. Never edit.
db/                 Drizzle schema + client
netlify/database/   Generated migrations
codex/skills/       Netlify-specific reference docs (see codex/AGENTS.md)
```

## When in doubt

- Norwegian language is the user's preference for chat replies. UI strings are also Norwegian.
- Keep changes surgical. Don't refactor unrelated code.
- See `codex/AGENTS.md` for Netlify platform skill index.
- Session checkpoints in `~/.copilot/session-state/<id>/checkpoints/` have detailed history of prior work.

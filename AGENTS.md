# AGENTS.md

Instructions for AI coding agents working in this repo. Follow these or you will repeatedly redo work that has already been figured out.

## Project at a glance

Personal finance dashboard (Norwegian) — zero-based budget, sinking funds, assets, loans, recap. Anonymous: each dashboard is a UUID the user stores; no accounts, no email.

- **Framework:** TanStack Start (React 19, SSR) on Netlify Functions
- **Styling:** Tailwind CSS 4 (via `@tailwindcss/vite`).
- **UI components:** shadcn/ui (the **base-ui** variant, not Radix — components use the `render` prop, NOT `asChild`). Preset `base-mira`, green theme. Primitives live in `app/components/ui/` (added via `npx shadcn@latest add`); toasts use `sonner`. The shadcn agent skill lives in `.agents/skills/shadcn/`.
- **Theming:** Light/dark/auto. The resolved theme is applied as the `.dark` **class** on `<html>` (shadcn convention — bare `:root` is light, `.dark` is dark), set before first paint by `THEME_INIT_SCRIPT` and kept in sync by `app/lib/theme-context.tsx`; toggle lives in Settings. Colour tokens are shadcn's (`--background`, `--primary`, …) in `app/styles/app.css`; the app adds a `--app-gradient` page background + `--pos`/`--warn` finance colours (backing `text-success`/`text-warning`). Charts read hex palettes from `app/lib/colors.ts`.
- **Data:** Netlify Database (Postgres) + Drizzle ORM
- **Forms and destructive actions:** Use Zod-validated server functions. New complex forms use `@tanstack/react-form`; retain server validation as the safety net. Use the shared `DeleteConfirmationDialog` for ordinary deletion; dashboard deletion intentionally requires typing `SLETT`.
- **Build/test/lint:** Plain Vite 7 + `@netlify/vite-plugin-tanstack-start`. Tooling: standalone `oxlint`, `oxfmt`, `tsc --noEmit`. (We previously tried Vite+ aka `vp` — it caused persistent `504 Outdated Optimize Dep` / `EPERM` issues on Windows. Do NOT migrate back.)
- **Deploy:** Netlify (auto from `main`) — site id `2e0830d2-6e2f-47fd-b7d0-f111d5985ab8`, live at https://personal-finance-dashboard-dre90.netlify.app
- **Language in UI strings:** Norwegian (Bokmål). Be careful with encoding (see below).

## Workflow

1. **Create a branch.** Never work directly on `main`.
   ```bash
   git checkout -b feat/<short-slug>
   ```
2. **Start local dev:** `npm run dev` → http://localhost:5173/ (includes Netlify emulation).
   - Apply pending migrations once: `netlify database migrations apply`.
   - **Bootstrap local Postgres** (needed once per machine, or whenever `NETLIFY_DB_URL` errors appear in SSR logs): `netlify database connect --query "SELECT 1"`. The Vite plugin emulates routing but doesn't actually spin up the local Postgres process — this command does.
   - Reset local DB: `netlify database reset`.
3. Make changes. Test in the browser locally.
4. If `db/schema.ts` changed, run `npm run db:generate`, inspect the generated migration, then run `npm run db:migrate` locally before testing. `netlify database migrations apply` applies pending migrations through the Netlify CLI.
5. `npm run check:fix` — `oxfmt` + `oxlint --fix` + `tsc --noEmit`. Must be clean.
6. `npm run build` — must pass and produce `.netlify/v1/functions/server.mjs` + `dist/client/assets/`.
7. **Run `npm run check:fix` again immediately before every `git commit`** — even if
   you already ran it in step 4. Editors/format-on-save can reformat files after
   that point (e.g. right before you stage them), leaving an uncommitted diff. Only
   `git add` + `git commit` once `git status` is clean of stray formatting changes.
8. Commit with the `Co-authored-by` trailer for the agent making the commit — Copilot uses `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`, Claude uses `Co-Authored-By: Claude <noreply@anthropic.com>`. Model upgrades (including GPT-5.6 Terra) do not change the Copilot attribution trailer.
9. Push the branch and open a PR via `gh pr create` (do NOT merge to main without testing).
10. After merging to `main`, Netlify auto-deploys production.
11. Verify deploy via `netlify api listSiteDeploys --data '{"site_id":"2e0830d2-6e2f-47fd-b7d0-f111d5985ab8"}'`.

**Netlify build credits are scarce.** PR/branch deploys are intentionally disabled (`allowed_branches: ["main"]`, `skip_prs: true`) — only `main` builds. Test everything locally before merging.

Do **not** commit unless the user asked for changes to be shipped. Do **not** push automatically without confirmation when changes are risky.

## Commands

| Task                      | Command                                                                       |
| ------------------------- | ----------------------------------------------------------------------------- |
| Install deps              | `npm install`                                                                 |
| Dev server                | `npm run dev`                                                                 |
| Format + lint + typecheck | `npm run check` (use `check:fix` to auto-fix)                                 |
| Build                     | `npm run build`                                                               |
| DB migrations             | `npm run db:generate` then `npm run db:migrate`                               |
| Seed local DB from prod   | `npm run db:seed-from-prod` (dev server must be running)                      |
| Seed 3 demo dashboards    | `npm run db:seed-demo` (dev server must be running; see README's "Test data") |

## Critical gotchas (learned the hard way — do NOT undo these)

### 1. `useSyncExternalStore` snapshot must be a primitive

`app/lib/query.ts` returns `entry.version` (a number that increments on each notify) from `getSnapshot`, **not** the `entry` object. Returning the same mutated object made React skip re-renders. If you touch the cache, preserve the `version: number` field and bump it in `notify()`.

### 2. Norwegian text + PowerShell = mojibake

Never do `Get-Content -Raw <file> | -replace ... | Set-Content` on files with Norwegian characters (æ, ø, å). PowerShell 5 reads as Windows-1252 by default. Use the `edit` tool, or read explicitly as UTF-8:

```powershell
[System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
```

If mojibake appears (`Ã¸` for `ø`, `Ã¥` for `å`, `Â·` for `·`): read UTF-8 → encode to Windows-1252 bytes → decode as UTF-8 → write back as UTF-8 _without BOM_.

### 3. Vite / Netlify constraints

- **No `devEngines.packageManager` in `package.json`.** Netlify build runners pin npm at minor versions (e.g. 11.16.x) and an exact match like `11.17.0` causes `EBADDEVENGINES` even with `onFail: "download"`. Pin Node/npm via `netlify.toml`'s `[build.environment]` instead.
- **`vite.config.ts` must use `@netlify/vite-plugin-tanstack-start` (NOT bare `@netlify/vite-plugin`).** The TanStack-specific wrapper sets `build.enabled: true` which is what makes Netlify Functions emit `server.mjs`. With plain `@tanstack/react-start/plugin/vite` you must also pass `srcDirectory: "app"` because our routes live in `app/`, not the default `src/`.
- **Do NOT migrate back to Vite+ (`vp` / `vite-plus`).** It caused persistent `504 Outdated Optimize Dep` errors and `EPERM` on `.vite/deps` on Windows. Plain Vite 7 + standalone `oxlint`/`oxfmt`/`tsc` works cleanly and is what the official Netlify TanStack template uses.

### 4. shadcn/ui is the **base-ui** variant (not Radix)

Components in `app/components/ui/` use base-ui. Custom triggers/links use the
`render` prop, NOT `asChild`. A shadcn `<Button>` that renders a `<Link>`
(anchor) needs `nativeButton={false}`, or base-ui logs a dev warning. A base-ui
`<Select>` needs `items={{ value: label }}` on the root for `<SelectValue>` to
show the label instead of the raw value. Charts (`app/components/charts.tsx`)
wrap shadcn's `<ChartContainer>` + `ChartTooltip`/`ChartLegend`; the thin
`MoneyBarChart`/`MoneyLineChart`/`MoneyAreaChart`/`MoneyDonut` API is unchanged
(`series={{ dataKey, name, color }}`).

## File layout

```
app/
  components/       Shared app components (AppShell, charts, Toaster, SnapshotModal, ui.tsx)
    ui/             shadcn/ui primitives (button, card, dialog, table, chart, sidebar, sonner, …)
  features/         Feature code — routes are thin, features hold the real work
    dashboard/      DashboardHome, SettingsPage, server.ts (identity + summary + export)
    budget/         BudgetPage, TemplatesPage, YearlyBudgetPage, server.ts (zero-based templates, periods, purchases)
    sinking-funds/  SinkingFundsPage, HistoryPage, server.ts (funds + transactions)
    assets/         AssetsPage, stacked-series.ts, server.ts
    loans/          LoansPage, server.ts
    recap/          RecapPage
  lib/              Cross-cutting hooks + utilities (query, auth, forms, defaults, enums, colors, utils, theme, theme-context, dashboard-context)
  routes/           TanStack Router routes (file-based). Dashboard routes are THIN — each is a
    dashboard/      ~6-line createFileRoute wrapper around a feature component (+ dashboard.tsx layout → AppShell)
  server/           Shared server-only helpers: _db.ts (assertDashboardExists, randomUUID), _helpers.ts (Zod validators)
  styles/app.css    Tailwind entry + shadcn tokens + app finance tokens (--app-gradient, --pos, --warn)
  routeTree.gen.ts  AUTO-GENERATED. Never edit.
db/                 Drizzle schema + client
netlify/database/   Generated migrations
codex/skills/       Netlify-specific reference docs (see codex/AGENTS.md)
```

## Domain model (db/schema.ts)

- **`dashboards`** — UUID, name, currency, and `payday` (1–28; default 25). The only "identity" in the app; everything cascades from here. `payday` defines the start/end dates for newly created budget periods.
- **`budget_templates`** — reusable zero-based budget plans. `budget_template_groups` and `budget_template_items` hold their ordered income/expense structure and expected amounts. Expense groups can have `isConsumption: true`.
- **`budget_periods`** — immutable instances of templates, with a `startDate` and `endDate` calculated from `payday`. `budget_period_groups` and `budget_period_items` are period-local snapshots: later template changes must never mutate history.
- **`budget_purchases`** — dated purchases assigned to an item in a consumption group. They are the source of the item's actual amount; consumption actuals must not be edited directly.
- **`categories`** and **`budget_entries`** — legacy category/month tables retained for historical compatibility. New budget work uses the zero-based tables above.
- **`sinking_funds`** — named savings goals: `target`, `currentAmount`, `monthlyContribution`, `color`, `notes`, `sortOrder`. `currentAmount` is a denormalised cache of `sinking_fund_transactions` (kept in sync server-side via `recomputeSinkingFundBalance`).
- **`sinking_fund_transactions`** — append-only log of deposits, withdrawals, adjustments, and one-time `opening` rows. `amount` is signed (`numeric 14/2`). `allocationGroupId` (UUID) ties together rows produced by one lump-sum distribution. Source of truth for fund balances.
- **`assets` + `asset_snapshots`** — `kind: 'ask' | 'pension' | 'cash' | 'other'`. Snapshots are unique per `(assetId, snapshotDate)` and drive the time-series charts.
- **`loans` + `loan_snapshots`** — `originalPrincipal`, `currentBalance`, `interestRate` (6/3), `monthlyPayment`. Snapshots track balance over time.

All money is `numeric(14, 2)` stored as strings — convert with `Number()` or the helpers in `app/lib/utils.ts`. Dates are `'YYYY-MM-DD'`, months `'YYYY-MM'`.

## Pages

Each `app/routes/dashboard/<x>.tsx` is a thin `createFileRoute` wrapper; the
actual page component (and its colocated modals/helpers) lives in the feature.

| Route                              | Component (in `app/features/`)       | Purpose                                              |
| ---------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| `/dashboard/`                      | `dashboard/DashboardHome.tsx`        | Recap home: net worth, cash flow, asset/debt summary |
| `/dashboard/budget`                | `budget/BudgetPage.tsx`              | Zero-based budget period, purchases, expected/actual |
| `/dashboard/budget/templates`      | `budget/TemplatesPage.tsx`           | Reusable template editor                             |
| `/dashboard/budget/yearly`         | `budget/YearlyBudgetPage.tsx`        | Annual spending by period and expense group          |
| `/dashboard/assets`                | `assets/AssetsPage.tsx`              | Formue — tabbed by `kind`, stacked area charts       |
| `/dashboard/sinking-funds`         | `sinking-funds/SinkingFundsPage.tsx` | Savings goals tracker (allocate, deposit, withdraw)  |
| `/dashboard/sinking-funds/history` | `sinking-funds/HistoryPage.tsx`      | Global transaction log with filters                  |
| `/dashboard/loans`                 | `loans/LoansPage.tsx`                | Debt paydown                                         |
| `/dashboard/recap`                 | `recap/RecapPage.tsx`                | Cash-flow recap                                      |
| `/dashboard/settings`              | `dashboard/SettingsPage.tsx`         | Dashboard name + theme toggle                        |

Trailing underscore on a route filename segment (e.g. `budget_.yearly.tsx`) opts the route out of nesting under the same-named parent route. Without it TanStack nests the child and the parent must render an `<Outlet />`, which we don't want on flat dashboard pages.

All server-side data ops live in `app/features/<feature>/server.ts` (Zod-validated `createServerFn` handlers). Shared Zod validators are in `app/server/_helpers.ts`; shared server-only db helpers (that must not leak into the client bundle) in `app/server/_db.ts`. The landing/auth page and root layout stay in `app/routes/` (`index.tsx`, `__root.tsx`, `dashboard.tsx`).

For non-trivial client forms, follow the established `@tanstack/react-form` + Zod pattern in `budget/TemplatesPage.tsx`: show Norwegian field feedback, but always validate and normalize values again server-side. Do not send empty strings to numeric database columns; `numericInput()` normalizes an empty money value to `"0"`.

## When in doubt

- Norwegian language is the user's preference for chat replies. UI strings are also Norwegian.
- Keep changes surgical. Don't refactor unrelated code.
- See `codex/AGENTS.md` for Netlify platform skill index.
- Session checkpoints in `~/.copilot/session-state/<id>/checkpoints/` have detailed history of prior work.

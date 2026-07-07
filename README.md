# Personal Finance Dashboard

A private personal finance dashboard: budgets, sinking funds, assets, and loans.

> The user-facing UI is in Norwegian (Bokmål). This documentation is in English.

## Stack

- **TanStack Start** (React 19 + TypeScript, SSR)
- **Tailwind CSS v4**
- **shadcn/ui** (base-ui variant, `base-mira` green preset) for components; `sonner` for toasts
- **Recharts** for charts (wrapped in shadcn's `Chart` primitives)
- **Netlify Database** (Postgres) with Drizzle ORM
- **Netlify Functions** via TanStack `createServerFn`

## Project structure

Code is organised by feature. Route files under `app/routes/dashboard/` are thin
`createFileRoute` wrappers; the real page components, their modals, and the
server functions live in `app/features/<feature>/` (`budget`, `sinking-funds`,
`assets`, `loans`, `recap`, `dashboard`). Shared UI primitives are in
`app/components/ui/` (shadcn) and `app/components/`, cross-cutting utilities in
`app/lib/`, and shared server helpers in `app/server/`. See `AGENTS.md` for the
full layout.

## Features

- **Budget** with monthly tracking and a yearly overview
- **Sinking funds** for savings goals, with a transaction log: split a salary
  lump sum across several funds in one action, register withdrawals, and browse
  the full deposit/withdrawal history per fund or globally
- **Assets** ("Formue") — ASK, pension, savings accounts, and other holdings.
  ASK and pension can each be split into several accounts (e.g. Aksjer/Fond, and
  Egen pensjonskonto/IPS/Pensjonssparekonto), with dedicated tabs showing the
  development per account and combined in one stacked chart.
- **Loans** with balance paydown over time
- **Light/dark theme** that can follow the system automatically (toggle in Settings)

## Auth model

No user accounts. When you create a dashboard you get a unique ID (UUID).
**Keep it safe** — it is your only key to your data.

## Local development

```bash
npm install
npm run dev          # http://localhost:5173 with Netlify emulation
```

First time on a machine (or whenever the SSR log complains about `NETLIFY_DB_URL`):

```bash
netlify database migrations apply   # apply pending migrations
npm run db:seed-from-prod           # optional: copy prod data into the local DB
```

`npm run check` runs `oxfmt` + `oxlint` + `tsc --noEmit` (use `check:fix` to
auto-fix). See `AGENTS.md` for the full workflow and gotchas.

## Test data

```bash
npm run db:seed-demo
```

Seeds three demo dashboards into the local dev DB (does not touch production
or any other existing dashboard). Re-running is safe — each dashboard is
deleted and recreated by a **fixed ID**, so the URLs below stay the same
across reseeds and can be bookmarked. Data is generated with a seeded PRNG,
so re-runs produce identical numbers too.

| Dashboard             | URL (local)                                       | Content                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Demo – Nesten tomt`  | `/dashboard/00000000-0000-0000-0000-000000000001` | Freshly "created" — default categories and empty sinking funds only, one budget month with just salary logged                                                                                        |
| `Demo – Noen måneder` | `/dashboard/00000000-0000-0000-0000-000000000002` | ~5 months of regular use — budget history, sinking fund deposits, 3 asset accounts, 1 mortgage                                                                                                       |
| `Demo – Flere år`     | `/dashboard/00000000-0000-0000-0000-000000000003` | ~3 years of active use — salary raises, seasonal electricity costs, June holiday pay, sinking-fund withdrawals (summer holiday/Christmas/tires), a mortgage plus a car loan paid off partway through |

See `scripts/seed-demo-dashboards.mjs` for the generation logic.

## Deploy

Production deploys automatically when something is merged to `main`. Branch and
PR deploys are intentionally disabled to save Netlify build credits, so test
locally before merging. The first deploy provisions the database automatically.

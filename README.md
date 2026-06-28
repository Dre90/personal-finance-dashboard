# Personlig Økonomi Dashboard

Et privat dashboard for personlig økonomi: budsjett, sinking funds, formue og lån.

## Stack

- **TanStack Start** (React 19 + TypeScript, SSR)
- **Tailwind CSS v4**
- **Recharts** for grafer
- **Netlify Database** (Postgres) med Drizzle ORM
- **Netlify Functions** via TanStack `createServerFn`

## Auth-modell

Ingen brukerkontoer. Når du oppretter et dashboard får du en unik ID (UUID).
**Ta vare på den** — den er din eneste nøkkel til dataene dine.

## Lokal utvikling

```bash
npm install
npm run dev
```

Netlify Database og Functions er tilgjengelig lokalt via `@netlify/vite-plugin`.

## Deploy

```bash
npx netlify deploy        # preview
npx netlify deploy --prod # produksjon
```

Første deploy provisjonerer databasen automatisk.

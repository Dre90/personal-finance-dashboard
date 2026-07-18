// Seed the local development database with a fresh copy of production data.
//
//   npm run db:seed-from-prod
//
// What it does:
//   1. Fetches the production connection string at runtime via the sanctioned
//      `netlify database status --branch production --show-credentials` command
//      (no credentials are ever written to disk).
//   2. Reads PROD read-only, table by table, preserving every id / UUID exactly.
//   3. TRUNCATEs the local dev tables and re-inserts the prod rows, then bumps
//      each serial sequence.
//
// Requirements: the local dev server must be running (`npm run dev`) so the
// embedded Postgres is up. Only the local DB is written to — prod is read-only.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import pg from "pg";

const { Client, types } = pg;

// Return raw text for date/timestamp/timestamptz/numeric/uuid/bool so values
// round-trip losslessly (no timezone or float precision drift). Postgres coerces
// the text back into the column type on insert.
for (const oid of [1082, 1114, 1184, 1700, 2950]) types.setTypeParser(oid, (v) => v);
types.setTypeParser(16, (v) => v); // bool -> 't' / 'f' text (valid bool input)

// Insert order is FK-safe (parents before children). TRUNCATE uses CASCADE.
const ORDER = [
  "dashboards",
  "budget_payday_rules",
  "categories",
  "budget_templates",
  "budget_template_groups",
  "budget_template_items",
  "budget_periods",
  "budget_period_groups",
  "budget_period_items",
  "budget_purchases",
  "budget_entries",
  "sinking_funds",
  "sinking_fund_transactions",
  "assets",
  "asset_snapshots",
  "loans",
  "loan_snapshots",
];
// Tables with a serial `id` whose sequence must be advanced after copy.
// (dashboards uses a uuid default, so it has no sequence.)
const SERIAL = new Set([
  "budget_payday_rules",
  "categories",
  "budget_entries",
  "budget_templates",
  "budget_template_groups",
  "budget_template_items",
  "budget_periods",
  "budget_period_groups",
  "budget_period_items",
  "budget_purchases",
  "sinking_funds",
  "sinking_fund_transactions",
  "assets",
  "asset_snapshots",
  "loans",
  "loan_snapshots",
]);
// Postgres' bind-parameter limit is 65,535 per statement; keep a wide margin
// so wide tables with many columns still batch into several statements.
const MAX_PARAMS_PER_STATEMENT = 5000;

function prodConnectionString() {
  const raw = execFileSync(
    "npx",
    ["netlify", "database", "status", "--branch", "production", "--show-credentials", "--json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const conn = JSON.parse(raw)?.database?.connectionString;
  if (!conn) throw new Error("Could not read production connection string from netlify CLI output");
  return conn;
}

function localClient() {
  // The local embedded Postgres port is dynamic; read it from Netlify's state.
  // The stored URL omits a username, but the local DB accepts `postgres`.
  let state;
  try {
    state = JSON.parse(fs.readFileSync(".netlify/state.json", "utf8"));
  } catch (e) {
    throw new Error(
      `Could not read .netlify/state.json — is \`npm run dev\` running? (${e.message})`,
    );
  }
  const stored = state.dbConnectionString;
  if (!stored)
    throw new Error(
      "No local dbConnectionString in .netlify/state.json — is `npm run dev` running?",
    );
  const u = new URL(stored);
  if (!u.username) u.username = "postgres";
  return new Client({ connectionString: u.toString() });
}

function prodClient(conn) {
  // Strip sslmode from the URL and pass ssl as an option (avoids a pg warning).
  // Certificate verification stays on by default; only disable it via an explicit
  // opt-in env var if Netlify's host ever requires it.
  const u = new URL(conn);
  u.searchParams.delete("sslmode");
  const rejectUnauthorized = process.env.SEED_FROM_PROD_INSECURE_TLS !== "1";
  return new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized } });
}

async function columns(client, table) {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table],
  );
  return r.rows.map((x) => x.column_name);
}

async function main() {
  const prod = prodClient(prodConnectionString());
  const local = localClient();

  try {
    await prod.connect();
  } catch (e) {
    throw new Error(`Could not connect to production DB: ${e.message}`);
  }
  try {
    await local.connect();
  } catch (e) {
    await prod.end().catch(() => {});
    throw new Error(`Could not connect to local DB — is \`npm run dev\` running? (${e.message})`);
  }

  try {
    await local.query("BEGIN");
    await local.query(`TRUNCATE ${ORDER.join(", ")} RESTART IDENTITY CASCADE`);

    const summary = {};
    for (const table of ORDER) {
      const cols = await columns(prod, table);
      if (cols.length === 0) {
        if (table === "budget_payday_rules") {
          const dashboards = await local.query(`SELECT id, payday FROM dashboards`);
          if (dashboards.rows.length > 0) {
            await local.query(
              `INSERT INTO budget_payday_rules (dashboard_id, payday, effective_from)
               SELECT id, payday, '0001-01-01' FROM dashboards`,
            );
          }
          summary[table] = dashboards.rows.length;
        } else {
          summary[table] = "ikke deployet";
        }
        continue;
      }
      const colList = cols.map((c) => `"${c}"`).join(", ");
      const src = await prod.query(`SELECT ${colList} FROM "${table}"`);
      summary[table] = src.rows.length;
      if (src.rows.length === 0) continue;

      // Batch rows into multiple statements so we stay well under Postgres'
      // 65,535 bind-parameter limit (and avoid one huge statement/memory spike).
      const rowsPerBatch = Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / cols.length));
      for (let i = 0; i < src.rows.length; i += rowsPerBatch) {
        const batch = src.rows.slice(i, i + rowsPerBatch);
        const params = [];
        const tuples = batch.map((row) => {
          const ph = cols.map((c) => {
            params.push(row[c]);
            return `$${params.length}`;
          });
          return `(${ph.join(", ")})`;
        });
        await local.query(
          `INSERT INTO "${table}" (${colList}) VALUES ${tuples.join(", ")}`,
          params,
        );
      }

      if (SERIAL.has(table)) {
        await local.query(
          `SELECT setval(pg_get_serial_sequence('"${table}"','id'),
                         GREATEST((SELECT COALESCE(MAX(id),0) FROM "${table}"),1),
                         (SELECT COUNT(*) FROM "${table}") > 0)`,
        );
      }
    }

    await local.query("COMMIT");
    console.log("Seeded local DB from production:");
    for (const t of ORDER) console.log(`  ${t.padEnd(16)} ${summary[t]}`);
    const dash = await local.query("SELECT id, name FROM dashboards");
    for (const d of dash.rows) console.log(`\nDashboard: ${d.name}  (id: ${d.id})`);
  } catch (e) {
    await local.query("ROLLBACK").catch(() => {});
    throw new Error(`Copy failed, rolled back — local DB unchanged: ${e.message}`);
  } finally {
    await prod.end().catch(() => {});
    await local.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(`\nseed-from-prod failed: ${e.message}`);
  process.exit(1);
});

// Seed three demo dashboards for local manual testing:
//
//   1. "Demo – Nesten tomt"   – just created, defaults only, no history
//   2. "Demo – Noen måneder"  – ~5 months of regular use
//   3. "Demo – Flere år"      – ~3 years of active use (incl. a paid-off loan
//                               and sinking-fund withdrawals)
//
//   npm run db:seed-demo
//
// Safe to re-run: it deletes any previous dashboards with these exact names
// (cascades to all child rows) before recreating them. Only touches the
// local dev DB — reads the connection string `npm run dev` writes to
// .netlify/state.json. Never touches production.

import fs from "node:fs";
import pg from "pg";

const { Client, types } = pg;
for (const oid of [1082, 1114, 1184, 1700, 2950]) types.setTypeParser(oid, (v) => v);
types.setTypeParser(16, (v) => v);

function localClient() {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(".netlify/state.json", "utf8"));
  } catch (e) {
    throw new Error(
      `Could not read .netlify/state.json — is \`npm run dev\` running? (${e.message})`,
    );
  }
  const stored = state.dbConnectionString;
  if (!stored) {
    throw new Error(
      "No local dbConnectionString in .netlify/state.json — is `npm run dev` running?",
    );
  }
  const u = new URL(stored);
  if (!u.username) u.username = "postgres";
  return new Client({ connectionString: u.toString() });
}

// -- Deterministic pseudo-random helper (re-runs produce identical data) ----
function rand(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000; // [0, 1)
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function money(n) {
  return round2(n).toFixed(2);
}

// -- Defaults (mirrors app/lib/defaults.ts) ----------------------------------
const CATEGORIES = [
  { name: "Lønn", kind: "income", groupName: "Inntekt", sortOrder: 10 },
  { name: "Bonus", kind: "income", groupName: "Inntekt", sortOrder: 20 },
  { name: "Andre inntekter", kind: "income", groupName: "Inntekt", sortOrder: 30 },
  { name: "Boliglån/Husleie", kind: "expense", groupName: "Faste utgifter", sortOrder: 100 },
  { name: "Strøm", kind: "expense", groupName: "Faste utgifter", sortOrder: 110 },
  { name: "Internett", kind: "expense", groupName: "Faste utgifter", sortOrder: 120 },
  { name: "Mobil", kind: "expense", groupName: "Faste utgifter", sortOrder: 130 },
  { name: "Forsikring", kind: "expense", groupName: "Faste utgifter", sortOrder: 140 },
  { name: "Barnehage/SFO", kind: "expense", groupName: "Faste utgifter", sortOrder: 150 },
  { name: "TV/Streaming", kind: "expense", groupName: "Faste utgifter", sortOrder: 160 },
  { name: "Mat", kind: "expense", groupName: "Variable utgifter", sortOrder: 200 },
  { name: "Transport/Drivstoff", kind: "expense", groupName: "Variable utgifter", sortOrder: 210 },
  { name: "Klær", kind: "expense", groupName: "Variable utgifter", sortOrder: 220 },
  { name: "Personlig pleie", kind: "expense", groupName: "Variable utgifter", sortOrder: 230 },
  { name: "Restaurant/Take-away", kind: "expense", groupName: "Variable utgifter", sortOrder: 240 },
  { name: "Underholdning", kind: "expense", groupName: "Variable utgifter", sortOrder: 250 },
  { name: "Helse", kind: "expense", groupName: "Variable utgifter", sortOrder: 260 },
  { name: "Gaver", kind: "expense", groupName: "Variable utgifter", sortOrder: 270 },
  { name: "Hobby", kind: "expense", groupName: "Variable utgifter", sortOrder: 280 },
  { name: "Buffer", kind: "expense", groupName: "Sparing", sortOrder: 300 },
  { name: "Pensjon", kind: "expense", groupName: "Sparing", sortOrder: 310 },
  { name: "Investering (ASK)", kind: "expense", groupName: "Sparing", sortOrder: 320 },
  { name: "Sinking funds", kind: "expense", groupName: "Sparing", sortOrder: 330 },
];

const SINKING_FUNDS = [
  { name: "Ferie", target: 30000, monthlyContribution: 2500, color: "#10b981" },
  { name: "Bil (service/dekk)", target: 15000, monthlyContribution: 1000, color: "#f59e0b" },
  { name: "Jul/Gaver", target: 10000, monthlyContribution: 800, color: "#ec4899" },
  { name: "Nytt utstyr", target: 20000, monthlyContribution: 1500, color: "#6366f1" },
];

const ASSETS = [
  { kind: "ask", name: "Aksjesparekonto (ASK)", base: 80000, monthlyAdd: 3000, volatility: 0.04 },
  { kind: "pension", name: "Pensjonssparing", base: 40000, monthlyAdd: 1000, volatility: 0.01 },
  { kind: "cash", name: "Bufferkonto", base: 25000, monthlyAdd: 300, volatility: 0.02 },
];

// -- Month helpers ------------------------------------------------------------
function ymAdd(year, month, delta) {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}
function ymStr({ year, month }) {
  return `${year}-${String(month).padStart(2, "0")}`;
}
function dateStr({ year, month }, day = 25) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function monthsUpTo(startYear, startMonth, endYear, endMonth) {
  const out = [];
  let cur = { year: startYear, month: startMonth };
  const endIdx = endYear * 12 + (endMonth - 1);
  while (cur.year * 12 + (cur.month - 1) <= endIdx) {
    out.push(cur);
    cur = ymAdd(cur.year, cur.month, 1);
  }
  return out;
}

const TODAY = { year: 2026, month: 7 };

// -- Budget category economics ------------------------------------------------
function stromBase(month) {
  if ([11, 12, 1, 2, 3].includes(month)) return 2400;
  if ([6, 7, 8].includes(month)) return 650;
  return 1300;
}

/** Returns { budgeted, actual } (strings) for a category in a given month. */
function categoryAmounts(name, ym, yearIndex, seedKey) {
  const m = ym.month;
  let budgeted;
  let fixed = false;
  switch (name) {
    case "Lønn":
      budgeted = 45000 * (1 + 0.03 * yearIndex);
      break;
    case "Bonus":
      budgeted = m === 6 ? 32000 : 0; // feriepenger i juni
      fixed = true;
      break;
    case "Andre inntekter": {
      const has = rand(`${seedKey}:chance`) < 0.18;
      const actual = has ? Math.round(rand(`${seedKey}:amt`) * 1500) : 0;
      return { budgeted: money(0), actual: money(actual) };
    }
    case "Boliglån/Husleie":
      budgeted = 13800;
      fixed = true;
      break;
    case "Strøm":
      budgeted = stromBase(m);
      break;
    case "Internett":
      budgeted = 499;
      fixed = true;
      break;
    case "Mobil":
      budgeted = 298;
      fixed = true;
      break;
    case "Forsikring":
      budgeted = 845;
      break;
    case "Barnehage/SFO":
      budgeted = 3230;
      fixed = true;
      break;
    case "TV/Streaming":
      budgeted = 399;
      break;
    case "Mat":
      budgeted = 6200;
      break;
    case "Transport/Drivstoff":
      budgeted = 1600;
      break;
    case "Klær":
      budgeted = 700;
      break;
    case "Personlig pleie":
      budgeted = 400;
      break;
    case "Restaurant/Take-away":
      budgeted = 1100;
      break;
    case "Underholdning":
      budgeted = 450;
      break;
    case "Helse":
      budgeted = 300;
      break;
    case "Gaver":
      budgeted = m === 12 ? 3800 : 250;
      break;
    case "Hobby":
      budgeted = 550;
      break;
    case "Buffer":
      budgeted = 1000;
      fixed = true;
      break;
    case "Pensjon":
      budgeted = 1000;
      fixed = true;
      break;
    case "Investering (ASK)":
      budgeted = 3000;
      break;
    case "Sinking funds":
      budgeted = 5800; // sum of default fund monthly contributions
      fixed = true;
      break;
    default:
      budgeted = 0;
      fixed = true;
  }
  if (fixed) return { budgeted: money(budgeted), actual: money(budgeted) };
  const variance = (rand(seedKey) - 0.5) * 0.24; // +/- 12%
  return { budgeted: money(budgeted), actual: money(budgeted * (1 + variance)) };
}

/** Barely-used variant: budget plan filled in, almost nothing logged yet. */
function almostNothingAmounts(name) {
  const { budgeted } = categoryAmounts(name, TODAY, 0, `nesten-tomt:${name}`);
  const actual = name === "Lønn" ? budgeted : "0.00";
  return { budgeted, actual };
}

// Fixed IDs (not defaultRandom()) so the demo dashboards keep the same URL
// across reseeds — safe to bookmark while testing.
const DEMO_IDS = {
  "Demo – Nesten tomt": "00000000-0000-0000-0000-000000000001",
  "Demo – Noen måneder": "00000000-0000-0000-0000-000000000002",
  "Demo – Flere år": "00000000-0000-0000-0000-000000000003",
};

// -- Insert helpers ------------------------------------------------------------
async function insertDashboard(client, name, createdAt) {
  const id = DEMO_IDS[name];
  await client.query(`DELETE FROM dashboards WHERE name = $1 OR id = $2`, [name, id]);
  await client.query(
    `INSERT INTO dashboards (id, name, created_at, updated_at) VALUES ($1, $2, $3, now())`,
    [id, name, createdAt],
  );
  await client.query(
    `INSERT INTO budget_payday_rules (dashboard_id, payday, effective_from)
     VALUES ($1, 25, '0001-01-01')`,
    [id],
  );
  return id;
}

async function insertCategories(client, dashboardId) {
  const ids = {};
  for (const c of CATEGORIES) {
    const r = await client.query(
      `INSERT INTO categories (dashboard_id, name, kind, group_name, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [dashboardId, c.name, c.kind, c.groupName, c.sortOrder],
    );
    ids[c.name] = r.rows[0].id;
  }
  return ids;
}

async function insertBudgetEntries(client, dashboardId, categoryIds, months, amountsFn) {
  for (let i = 0; i < months.length; i++) {
    const ym = months[i];
    const ymLabel = ymStr(ym);
    const yearIndex = Math.floor(i / 12);
    for (const c of CATEGORIES) {
      const { budgeted, actual } = amountsFn(c.name, ym, yearIndex, ymLabel);
      await client.query(
        `INSERT INTO budget_entries (dashboard_id, category_id, year_month, budgeted, actual)
         VALUES ($1,$2,$3,$4,$5)`,
        [dashboardId, categoryIds[c.name], ymLabel, budgeted, actual],
      );
    }
  }
}

function budgetPeriodDates(ym, payday = 25) {
  return {
    startDate: dateStr(ymAdd(ym.year, ym.month, payday === 1 ? 0 : -1), payday),
    endDate:
      payday === 1
        ? dateStr(ym, new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate())
        : dateStr(ym, payday - 1),
  };
}

function zeroBasedBudgetGroups() {
  const groups = [];
  for (const [groupName, isConsumption] of [
    ["Inntekt", false],
    ["Faste utgifter", false],
    ["Variable utgifter", true],
    ["Sparing", false],
  ]) {
    const categories = CATEGORIES.filter((category) => category.groupName === groupName);
    if (categories.length === 0) continue;
    groups.push({
      name: groupName,
      kind: categories[0].kind,
      isConsumption,
      items: categories.map((category) => ({
        name: category.name,
        expected: Number(categoryAmounts(category.name, TODAY, 0, `mal:${category.name}`).budgeted),
      })),
    });
  }

  const expectedIncome = groups
    .filter((group) => group.kind === "income")
    .flatMap((group) => group.items)
    .reduce((total, item) => total + item.expected, 0);
  const expectedExpenses = groups
    .filter((group) => group.kind === "expense")
    .flatMap((group) => group.items)
    .reduce((total, item) => total + item.expected, 0);
  groups.push({
    name: "Fordeling",
    kind: "expense",
    isConsumption: false,
    items: [{ name: "Ekstra sparing", expected: round2(expectedIncome - expectedExpenses) }],
  });
  return groups;
}

async function insertZeroBasedBudget(client, dashboardId, months, dashboardKey) {
  const groups = zeroBasedBudgetGroups();
  const templateResult = await client.query(
    `INSERT INTO budget_templates (dashboard_id, name, sort_order)
     VALUES ($1, 'Hverdagsbudsjett', 0) RETURNING id`,
    [dashboardId],
  );
  const templateId = templateResult.rows[0].id;

  for (const [groupIndex, group] of groups.entries()) {
    const groupResult = await client.query(
      `INSERT INTO budget_template_groups
         (template_id, name, kind, is_consumption, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [templateId, group.name, group.kind, group.isConsumption, groupIndex],
    );
    group.templateGroupId = groupResult.rows[0].id;
    for (const [itemIndex, item] of group.items.entries()) {
      await client.query(
        `INSERT INTO budget_template_items (group_id, name, expected, sort_order)
         VALUES ($1,$2,$3,$4)`,
        [group.templateGroupId, item.name, money(item.expected), itemIndex],
      );
    }
  }

  for (const [monthIndex, ym] of months.entries()) {
    const { startDate, endDate } = budgetPeriodDates(ym);
    const periodResult = await client.query(
      `INSERT INTO budget_periods (dashboard_id, template_id, start_date, end_date)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [dashboardId, templateId, startDate, endDate],
    );
    const periodId = periodResult.rows[0].id;
    const yearIndex = Math.floor(monthIndex / 12);
    let distributionGroupId;
    let distributionExpected = 0;

    for (const [groupIndex, group] of groups.entries()) {
      const periodGroupResult = await client.query(
        `INSERT INTO budget_period_groups
           (period_id, name, kind, is_consumption, sort_order)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [periodId, group.name, group.kind, group.isConsumption, groupIndex],
      );
      const periodGroupId = periodGroupResult.rows[0].id;

      if (group.name === "Fordeling") {
        distributionGroupId = periodGroupId;
        distributionExpected = group.items[0].expected;
        continue;
      }

      for (const [itemIndex, item] of group.items.entries()) {
        const amount = categoryAmounts(
          item.name,
          ym,
          yearIndex,
          `${dashboardKey}:zero:${item.name}:${ymStr(ym)}`,
        );
        const actual = Number(amount.actual);
        const itemResult = await client.query(
          `INSERT INTO budget_period_items (group_id, name, expected, actual, sort_order)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [
            periodGroupId,
            item.name,
            money(item.expected),
            group.isConsumption ? "0.00" : money(actual),
            itemIndex,
          ],
        );

        if (group.isConsumption) {
          const firstPurchase = round2(actual * 0.58);
          const secondPurchase = round2(actual - firstPurchase);
          for (const [day, value, description] of [
            [4, firstPurchase, `${item.name} - første kjøp`],
            [14, secondPurchase, `${item.name} - påfyll`],
          ]) {
            if (value <= 0) continue;
            await client.query(
              `INSERT INTO budget_purchases (period_id, item_id, occurred_at, description, amount)
               VALUES ($1,$2,$3,$4,$5)`,
              [periodId, itemResult.rows[0].id, dateStr(ym, day), description, money(value)],
            );
          }
        }
      }
    }

    await client.query(
      `INSERT INTO budget_period_items (group_id, name, expected, actual, sort_order)
       VALUES ($1, 'Ekstra sparing', $2, $3, 0)`,
      [distributionGroupId, money(distributionExpected), money(distributionExpected)],
    );
  }
}

async function insertSinkingFunds(client, dashboardId) {
  const ids = {};
  for (let i = 0; i < SINKING_FUNDS.length; i++) {
    const f = SINKING_FUNDS[i];
    const r = await client.query(
      `INSERT INTO sinking_funds (dashboard_id, name, target, monthly_contribution, color, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [dashboardId, f.name, money(f.target), money(f.monthlyContribution), f.color, i * 10],
    );
    ids[f.name] = r.rows[0].id;
  }
  return ids;
}

async function insertSinkingFundTransactions(
  client,
  dashboardId,
  fundIds,
  months,
  dashboardKey,
  withdrawals,
) {
  for (const f of SINKING_FUNDS) {
    const fundId = fundIds[f.name];
    let running = 0;
    for (const ym of months) {
      const seedKey = `${dashboardKey}:fund:${f.name}:${ymStr(ym)}`;
      const deposit = round2(f.monthlyContribution * (1 + (rand(seedKey) - 0.5) * 0.2));
      await client.query(
        `INSERT INTO sinking_fund_transactions
           (sinking_fund_id, dashboard_id, occurred_at, amount, kind, note)
         VALUES ($1,$2,$3,$4,'deposit',$5)`,
        [fundId, dashboardId, dateStr(ym, 5), money(deposit), "Månedlig sparing"],
      );
      running += deposit;

      if (!withdrawals) continue;

      if (f.name === "Ferie" && ym.month === 7 && running > 5000) {
        const spend = round2(running * (0.6 + rand(`${seedKey}:sp`) * 0.25));
        await client.query(
          `INSERT INTO sinking_fund_transactions
             (sinking_fund_id, dashboard_id, occurred_at, amount, kind, note)
           VALUES ($1,$2,$3,$4,'withdrawal',$5)`,
          [fundId, dashboardId, dateStr(ym, 20), money(-spend), "Sommerferie"],
        );
        running -= spend;
      }
      if (f.name === "Jul/Gaver" && ym.month === 12 && running > 3000) {
        const spend = round2(running * (0.7 + rand(`${seedKey}:sp`) * 0.2));
        await client.query(
          `INSERT INTO sinking_fund_transactions
             (sinking_fund_id, dashboard_id, occurred_at, amount, kind, note)
           VALUES ($1,$2,$3,$4,'withdrawal',$5)`,
          [fundId, dashboardId, dateStr(ym, 22), money(-spend), "Julegaver"],
        );
        running -= spend;
      }
      if (
        f.name === "Bil (service/dekk)" &&
        (ym.month === 4 || ym.month === 10) &&
        running > 6000 &&
        rand(`${seedKey}:car`) < 0.5
      ) {
        const spend = round2(4500 + rand(`${seedKey}:camt`) * 2500);
        await client.query(
          `INSERT INTO sinking_fund_transactions
             (sinking_fund_id, dashboard_id, occurred_at, amount, kind, note)
           VALUES ($1,$2,$3,$4,'withdrawal',$5)`,
          [fundId, dashboardId, dateStr(ym, 12), money(-spend), "Dekkskift/service"],
        );
        running -= spend;
      }
    }
  }
  await client.query(
    `UPDATE sinking_funds sf
     SET current_amount = COALESCE(
       (SELECT SUM(amount) FROM sinking_fund_transactions t WHERE t.sinking_fund_id = sf.id), 0
     )
     WHERE sf.dashboard_id = $1`,
    [dashboardId],
  );
}

async function insertAssets(client, dashboardId, months, dashboardKey) {
  for (let i = 0; i < ASSETS.length; i++) {
    const a = ASSETS[i];
    const r = await client.query(
      `INSERT INTO assets (dashboard_id, kind, name, sort_order) VALUES ($1,$2,$3,$4) RETURNING id`,
      [dashboardId, a.kind, a.name, i * 10],
    );
    const assetId = r.rows[0].id;
    let value = a.base;
    for (const ym of months) {
      const seedKey = `${dashboardKey}:asset:${a.name}:${ymStr(ym)}`;
      const growth = 1 + (rand(seedKey) - 0.5) * 2 * a.volatility;
      value = round2(value * growth + a.monthlyAdd);
      await client.query(
        `INSERT INTO asset_snapshots (asset_id, snapshot_date, value) VALUES ($1,$2,$3)`,
        [assetId, dateStr(ym, 28), money(value)],
      );
    }
  }
}

async function insertLoan(client, dashboardId, loan, months, dashboardKey, payoffAfter) {
  const r = await client.query(
    `INSERT INTO loans
       (dashboard_id, name, original_principal, current_balance, interest_rate, monthly_payment, sort_order)
     VALUES ($1,$2,$3,$3,$4,$5,0) RETURNING id`,
    [
      dashboardId,
      loan.name,
      money(loan.originalPrincipal),
      money(loan.interestRate),
      money(loan.monthlyPayment),
    ],
  );
  const loanId = r.rows[0].id;
  let balance = loan.originalPrincipal;
  for (let i = 0; i < months.length; i++) {
    const ym = months[i];
    if (payoffAfter !== undefined && i >= payoffAfter) {
      balance = 0;
    } else {
      const seedKey = `${dashboardKey}:loan:${loan.name}:${ymStr(ym)}`;
      const interest = balance * (loan.interestRate / 100 / 12);
      const principalPortion = loan.monthlyPayment - interest + (rand(seedKey) - 0.5) * 200;
      balance = Math.max(0, round2(balance - principalPortion));
    }
    await client.query(
      `INSERT INTO loan_snapshots (loan_id, snapshot_date, balance) VALUES ($1,$2,$3)`,
      [loanId, dateStr(ym, 28), money(balance)],
    );
  }
  await client.query(`UPDATE loans SET current_balance = $2 WHERE id = $1`, [
    loanId,
    money(balance),
  ]);
}

// -- Scenario builders ---------------------------------------------------------

async function seedAlmostEmpty(client) {
  const dashboardId = await insertDashboard(client, "Demo – Nesten tomt", dateStr(TODAY, 1));
  const categoryIds = await insertCategories(client, dashboardId);
  await insertZeroBasedBudget(client, dashboardId, [], "nesten-tomt");
  await insertSinkingFunds(client, dashboardId); // defaults only, no transactions
  await insertBudgetEntries(client, dashboardId, categoryIds, [TODAY], (name) =>
    almostNothingAmounts(name),
  );
  return dashboardId;
}

async function seedFewMonths(client) {
  const start = { year: 2026, month: 3 };
  const months = monthsUpTo(start.year, start.month, TODAY.year, TODAY.month); // 5 months
  const dashboardKey = "noen-maneder";
  const dashboardId = await insertDashboard(client, "Demo – Noen måneder", dateStr(start, 3));

  const categoryIds = await insertCategories(client, dashboardId);
  await insertZeroBasedBudget(client, dashboardId, months, dashboardKey);
  await insertBudgetEntries(
    client,
    dashboardId,
    categoryIds,
    months,
    (name, ym, yearIndex, ymLabel) =>
      categoryAmounts(name, ym, yearIndex, `${dashboardKey}:${name}:${ymLabel}`),
  );

  const fundIds = await insertSinkingFunds(client, dashboardId);
  await insertSinkingFundTransactions(client, dashboardId, fundIds, months, dashboardKey, false);

  await insertAssets(client, dashboardId, months, dashboardKey);

  await insertLoan(
    client,
    dashboardId,
    { name: "Boliglån", originalPrincipal: 2800000, monthlyPayment: 14000, interestRate: 4.5 },
    months,
    dashboardKey,
  );

  return dashboardId;
}

async function seedYearsActive(client) {
  const start = { year: 2023, month: 8 };
  const months = monthsUpTo(start.year, start.month, TODAY.year, TODAY.month); // 36 months
  const dashboardKey = "flere-ar";
  const dashboardId = await insertDashboard(client, "Demo – Flere år", dateStr(start, 15));

  const categoryIds = await insertCategories(client, dashboardId);
  await insertZeroBasedBudget(client, dashboardId, months, dashboardKey);
  await insertBudgetEntries(
    client,
    dashboardId,
    categoryIds,
    months,
    (name, ym, yearIndex, ymLabel) =>
      categoryAmounts(name, ym, yearIndex, `${dashboardKey}:${name}:${ymLabel}`),
  );

  const fundIds = await insertSinkingFunds(client, dashboardId);
  await insertSinkingFundTransactions(client, dashboardId, fundIds, months, dashboardKey, true);

  await insertAssets(client, dashboardId, months, dashboardKey);

  await insertLoan(
    client,
    dashboardId,
    { name: "Boliglån", originalPrincipal: 3200000, monthlyPayment: 15500, interestRate: 4.2 },
    months,
    dashboardKey,
  );
  await insertLoan(
    client,
    dashboardId,
    { name: "Billån", originalPrincipal: 280000, monthlyPayment: 4200, interestRate: 6.5 },
    months,
    dashboardKey,
    22, // paid off after 22 months
  );

  return dashboardId;
}

async function main() {
  const client = localClient();
  try {
    await client.connect();
  } catch (e) {
    throw new Error(`Could not connect to local DB — is \`npm run dev\` running? (${e.message})`);
  }

  try {
    const results = [];
    results.push(["Demo – Nesten tomt", await seedAlmostEmpty(client)]);
    results.push(["Demo – Noen måneder", await seedFewMonths(client)]);
    results.push(["Demo – Flere år", await seedYearsActive(client)]);

    console.log("Seeded demo dashboards:\n");
    for (const [name, id] of results) {
      console.log(`  ${name.padEnd(24)} /dashboard/${id}`);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(`\nseed-demo-dashboards failed: ${e.message}`);
  process.exit(1);
});

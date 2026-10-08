import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const request = new Request("http://127.0.0.1/", { headers: { accept: "text/html" } });
  const env = {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
  const context = { waitUntil() {}, passThroughOnException() {} };
  return typeof worker === "function" ? worker(request, context) : worker.fetch(request, env, context);
}

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("server-renders the private finance dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Personal CFO<\/title>/i);
  assert.doesNotMatch(html, /Example User Finance/i);
  assert.match(html, /PERSONAL FINANCIAL OPERATING SYSTEM/);
  assert.match(html, /Private by design/);
});

test("keeps the core working areas and transaction controls available", async () => {
  const page = await source("../app/page.tsx");
  const transactions = await source("../components/Transactions.tsx");
  for (const label of ["Home", "Monthly Review", "Transactions", "Plan", "Tax", "Settings"]) {
    assert.match(page, new RegExp(`label:"${label}"`));
  }
  assert.match(transactions, /aria-label="Transaction account"/);
  assert.match(transactions, /aria-label="Search transactions by merchant or account"/);
  assert.match(transactions, /Credit card/);
  const plan = await source("../components/Plan.tsx");
  const runway = await source("../components/PlanCashRunway.tsx");
  assert.match(plan, /PlanCashRunway/);
  assert.match(runway, /CASH RUNWAY/);
  assert.match(runway, /cash-runway-toggle/);
  assert.match(runway, /aria-expanded/);
  assert.match(runway, /Budget target cash/);
  assert.match(runway, /Inspect transactions/);
  assert.match(plan, /fixed-commitment-toggle/);
  assert.match(plan, /Manage recurring payments/);
  assert.match(page, /window\.history\.pushState/);
  assert.match(page, /addEventListener\("popstate"/);
  assert.match(page, /<Tax store=\{store\}/);
  const tax = await source("../components/Tax.tsx");
  assert.match(tax, /ESTIMATED TAX POSITION/);
  assert.match(await source("../components/tax/TaxYearEnd.tsx"), /P60 replaces accumulated payslip totals/);
  assert.match(tax, /Original PDFs are not stored in the app/);
});

test("does not bundle personal transactions or balances into the public source", async () => {
  const page = await source("../app/page.tsx");
  const gitignore = await source("../.gitignore");
  const publicDataReadme = await source("../public/data/README.md");
  const publicDataFiles = await readdir(new URL("../public/data/", import.meta.url));
  const builtDataFiles = await readdir(new URL("../dist/client/data/", import.meta.url)).catch(() => []);
  assert.match(page, /const initialStore: Store = createFreshStore\(\)/);
  assert.match(page, /No dated financial data yet/);
  assert.match(page, /showGuide&&<Onboarding/);
  assert.match(page, /<strong>Personal CFO<\/strong>/);
  assert.doesNotMatch(page, /<strong>Example User Finance<\/strong>/);
  assert.match(await source("../components/Onboarding.tsx"), /Welcome to Personal CFO/);
  assert.match(await source("../lib/backup.ts"), /personal-cfo-v2/);
  assert.match(await source("../lib/storage.ts"), /FINANCE_DB_NAME = "personal-cfo"/);
  assert.match(await source("../lib/profile.ts"), /transactions: \[\], balances: \[\], goals: \[\]/);
  assert.match(page, /const legacyBaselineBalances: Balance\[\] = \[/);
  assert.match(gitignore, /Private financial information/);
  assert.match(gitignore, /\*\.csv/);
  assert.match(gitignore, /\*\.pdf/);
  assert.match(publicDataReadme, /Never place/);
  assert.deepEqual(publicDataFiles, ["README.md"]);
  assert.equal(builtDataFiles.filter(file => file.endsWith(".json")).length, 0);
  assert.doesNotMatch(page, /monzo-baseline\.json|barclaycard-baseline\.json/);
  assert.equal(builtDataFiles.filter(file => /tax/i.test(file)).length, 0);
});

test("offers safe imports, undo and durable local history", async () => {
  const page = await source("../app/page.tsx");
  const preview = await source("../components/ImportPreview.tsx");
  const versionGenerator = await source("../scripts/generate-app-version.mjs");
  const imports = await source("../lib/imports.ts");
  assert.match(preview, /CHECK BEFORE COMMITTING/);
  assert.match(preview, /Duplicates skipped/);
  assert.match(page, /Undo last import/);
  assert.match(page, /snapshots:/);
  assert.match(page, /aria-label="Choose a Monzo CSV statement"/);
  assert.match(page, /aria-label="Choose a Barclaycard statement"/);
  assert.match(imports, /CSV contains an unclosed quoted field/);
  assert.match(imports, /invalid or zero amount/);
  assert.match(imports, /headerless Barclaycard CSV/);
  assert.match(page, /fetch\("\/app-version\.json"/);
  assert.match(versionGenerator, /buildIdentity\(project\)/);
});

test("limits the PDF helper to the local dashboard origin", async () => {
  const service = await source("../scripts/pdf-parser-server.py");
  assert.match(service, /ALLOWED_ORIGINS/);
  assert.match(service, /http:\/\/127\.0\.0\.1:3000/);
  assert.match(service, /http:\/\/localhost:3000/);
  assert.match(service, /Local dashboard origin required/);
  assert.doesNotMatch(service, /Access-Control-Allow-Origin", "\*"/);
});

test("keeps health scoring, pay cycles and imported identities in pure modules", async () => {
  const health = await source("../lib/health.ts");
  const cycles = await source("../lib/pay-cycles.ts");
  const transactions = await source("../lib/transactions.ts");
  assert.match(health, /HEALTH_SCORE_VERSION = 3/);
  assert.match(health, /function versionThreeComponents/);
  assert.match(health, /function assessHealthReadiness/);
  assert.match(cycles, /function expectedPayDate/);
  assert.match(cycles, /const safePayday/);
  assert.match(cycles, /return payCycleKey\(transaction\.date, payday, salaryDates\)/);
  assert.doesNotMatch(cycles, /transaction\.amount >= 1000/);
  assert.match(transactions, /transaction\.fingerprint/);
  assert.match(transactions, /reconcileImportedTransactions/);
});

test("keeps the controller and screens type-safe without suppression", async () => {
  const page = await source("../app/page.tsx");
  const config = await source("../tsconfig.json");
  const screenProps = await source("../lib/screen-props.ts");
  assert.ok(page.split("\n").length < 1200, "app/page.tsx should remain a manageable controller");
  assert.match(config, /components\/\*\*\/\*\.tsx/);
  assert.match(config, /lib\/\*\*\/\*\.ts/);
  assert.match(screenProps, /HealthScoreHistoryPoint/);
  for (const screen of ["Home", "MonthlyReview", "Transactions", "Plan", "PlanCashRunway", "Tax", "Settings"]) {
    const screenSource = await source(`../components/${screen}.tsx`);
    assert.match(screenSource, new RegExp(`export default function ${screen}`));
    assert.doesNotMatch(screenSource, /@ts-nocheck/);
  }
});

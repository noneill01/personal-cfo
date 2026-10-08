import assert from "node:assert/strict";
import test from "node:test";
import { createDemoStore } from "../lib/demo.ts";
import { parseBackup, serialiseBackup } from "../lib/backup.ts";
import { financeStoresMatch } from "../lib/storage.ts";

test("demo profile is fictional, useful, and completed", () => {
  const demo = createDemoStore(new Date("2026-10-08T12:00:00Z"));
  assert.equal(demo.demoMode, true);
  assert.equal(demo.onboarding?.status, "completed");
  assert.equal(demo.profile?.origin, "fresh");
  assert.equal(demo.profile?.enabledPacks.includes("uk-tax"), false);
  assert.equal(demo.profile?.accounts.length, 4);
  assert.ok(demo.transactions.length >= 20);
  assert.ok(demo.recurringCommitments?.every(item => item.status === "confirmed"));
  assert.equal(demo.profile?.incomeSources?.[0]?.merchantContains.includes("example payroll"), true);
  assert.equal(demo.profile?.paySchedule?.payday, 28);
  assert.equal(demo.goals.find(goal => goal.id === "ef")?.current, 8200);
  assert.equal(demo.planningIncome, 4200);
  assert.equal(demo.profile?.planning?.income, 4200);
  assert.doesNotMatch(JSON.stringify(demo), /Neville|O'Neill|Immersive|Rapid7|Dromore|Carnbane/i);
});

test("demo profile survives backup round-trip", () => {
  const demo = createDemoStore(new Date("2026-10-08T12:00:00Z"));
  const restored = parseBackup(serialiseBackup(demo));
  assert.equal(restored.demoMode, true);
  assert.equal(financeStoresMatch(demo, restored), true);
});

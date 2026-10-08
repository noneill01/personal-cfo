import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createFreshStore, migrateUserProfile } from "../lib/profile.ts";
import { disableFeaturePack, enableFeaturePack, isFeaturePackEnabled, visibleNavigation } from "../lib/feature-packs.ts";
import { parseBackup, serialiseBackup } from "../lib/backup.ts";
import { migrateTaxStore } from "../lib/tax/migration.ts";
import { taxOverview } from "../lib/tax/overview.ts";
import { taxEmployer } from "../lib/tax/employers.ts";
import { createP60Evidence } from "../lib/tax/facts.ts";
import { assetBalance, debtBalance } from "../lib/balances.ts";
import { buildPlanRows } from "../lib/plan.ts";
import { reviewReadiness } from "../lib/review.ts";
import { parseCsv } from "../lib/imports.ts";
import { shouldShowOnboarding } from "../lib/onboarding.ts";

const navigation = [{target:"Overview"},{target:"Tax"},{target:"Settings"}];
const backupRoundTrip = store => migrateUserProfile(parseBackup(serialiseBackup(store)));
const exampleEvidence = () => createP60Evidence({
  id:"document-1",taxYear:"2026/27",employer:"Example Services Limited",date:"2027-04-05",
  taxablePay:35000,taxPaid:7500,importedAt:"2027-04-06",
  employerAliases:[{id:"example-services",displayName:"Example Services",aliases:["Example Services Limited"]}],
});

test("fresh onboarding hides UK Tax and has no personal employer defaults", () => {
  const store=createFreshStore();
  assert.equal(shouldShowOnboarding(store),true);
  assert.deepEqual(store.profile.enabledPacks,[]);
  assert.equal(store.profile.taxEmployers,undefined);
  assert.equal(store.taxDocuments,undefined);
  assert.equal(store.taxFacts,undefined);
  assert.deepEqual(visibleNavigation(navigation,store.profile).map(item=>item.target),["Overview","Settings"]);
  assert.doesNotMatch(JSON.stringify(store.profile),/previousEmployer|currentEmployer|rentalProperty|example-user/i);
});

test("enable, disable and re-enable expose Tax without deleting evidence", () => {
  const evidence=exampleEvidence();
  const fresh=createFreshStore();
  const enabled=migrateTaxStore({...fresh,profile:enableFeaturePack(fresh.profile,"uk-tax"),taxDocuments:[evidence.document],taxFacts:evidence.facts});
  assert.equal(isFeaturePackEnabled(enabled.profile,"uk-tax"),true);
  assert.deepEqual(visibleNavigation(navigation,enabled.profile).map(item=>item.target),["Overview","Tax","Settings"]);
  const before=taxOverview(enabled,"2026/27","2027-04-07");
  const disabled={...enabled,profile:disableFeaturePack(enabled.profile,"uk-tax")};
  assert.deepEqual(visibleNavigation(navigation,disabled.profile).map(item=>item.target),["Overview","Settings"]);
  assert.deepEqual(disabled.taxDocuments,enabled.taxDocuments);
  assert.deepEqual(disabled.taxFacts,enabled.taxFacts);
  const restored=backupRoundTrip(disabled);
  assert.equal(isFeaturePackEnabled(restored.profile,"uk-tax"),false);
  assert.deepEqual(restored.taxFacts,enabled.taxFacts);
  const reenabled=migrateTaxStore({...restored,profile:enableFeaturePack(restored.profile,"uk-tax")});
  assert.deepEqual(taxOverview(reenabled,"2026/27","2027-04-07").position,before.position);
  assert.deepEqual(migrateTaxStore(reenabled),reenabled);
});

test("pre-Phase-8 profiles and old backups retain UK Tax, evidence and totals", () => {
  const evidence=exampleEvidence();
  const old={...createFreshStore(),profile:undefined,balances:[
    {id:"account",name:"Example current",type:"Current account",group:"asset",value:1400},
    {id:"card",name:"Example card",type:"Credit card",group:"liability",value:200},
  ],taxDocuments:[evidence.document],taxFacts:evidence.facts};
  const before={assets:assetBalance(old.balances),debt:debtBalance(old.balances)};
  const migrated=backupRoundTrip(old);
  assert.equal(migrated.profile.origin,"legacy");
  assert.equal(isFeaturePackEnabled(migrated.profile,"uk-tax"),true);
  assert.deepEqual({assets:assetBalance(migrated.balances),debt:debtBalance(migrated.balances)},before);
  assert.deepEqual(migrated.taxFacts,old.taxFacts);
  assert.deepEqual(migrateUserProfile(migrated),migrated);
  const oldProfile={...migrated.profile,version:5,enabledPacks:undefined,taxEmployers:undefined};
  assert.equal(isFeaturePackEnabled(migrateUserProfile({...migrated,profile:oldProfile}).profile,"uk-tax"),true);
  const phaseSevenProfile={...createFreshStore().profile,version:5,enabledPacks:undefined};
  assert.equal(isFeaturePackEnabled(migrateUserProfile({...createFreshStore(),profile:phaseSevenProfile}).profile,"uk-tax"),true);
  assert.equal(migrated.profile.taxEmployers,undefined);
  const configured={...migrated,profile:{...migrated.profile,taxEmployers:[{id:"previous-systems",displayName:"Previous Systems",aliases:["Previous Systems Limited"]}]}};
  assert.equal(taxEmployer("Previous Systems Limited","unknown",migrateUserProfile(configured).profile.taxEmployers).id,"previous-systems");
  assert.equal(taxEmployer("Example Services Limited","unknown",createFreshStore().profile.taxEmployers).id,"employer:example%20services%20limited");
});

test("an explicit disabled choice survives migration, reload-shaped restore and remains idempotent", () => {
  const migrated=migrateUserProfile({...createFreshStore(),profile:undefined});
  const disabled={...migrated,profile:disableFeaturePack(migrated.profile,"uk-tax")};
  assert.equal(isFeaturePackEnabled(backupRoundTrip(disabled).profile,"uk-tax"),false);
  assert.deepEqual(migrateUserProfile(disabled),disabled);
});

test("generic overview, Plan, Review and CSV parsing remain usable with Tax disabled", () => {
  const fresh=createFreshStore();
  const plan=buildPlanRows({categories:["Housing"],lastCycleSpend:{Housing:500},commitments:[],storedPlan:{Housing:500}});
  assert.equal(plan.length,1);
  assert.equal(reviewReadiness({coverageComplete:true,payslipRecorded:true,unreviewed:0}).ready,true);
  assert.deepEqual({assets:assetBalance(fresh.balances),debt:debtBalance(fresh.balances)},{assets:0,debt:0});
  assert.equal(typeof parseCsv("Date,Name,Amount\n2026-01-01,Example,-5"),"object");
  const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
  assert.match(page,/!showGuide&&ukTaxEnabled&&tab==="Tax"&&<Tax/);
  assert.match(page,/activeSection!=="Tax"&&<article className="panel empty-state"/);
  assert.match(page,/visibleNavigation\(primaryNavigation,store\.profile\)/);
  assert.match(page,/if\(isFeaturePackEnabled\(nextStore\.profile,"uk-tax"\)\)nextStore=migrateTaxStore/);
  assert.doesNotMatch(readFileSync(new URL("../lib/feature-packs.ts",import.meta.url),"utf8"),/P45|P60|PAYE/);
});

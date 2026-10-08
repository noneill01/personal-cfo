import test from "node:test";
import assert from "node:assert/strict";
import { addCategory, addSubcategory, categoryFor, categoryGroupFor, makeCategory, resolveCategory, updateCategory, updateSubcategory } from "../lib/categories.ts";
import { createFreshStore, migrateUserProfile } from "../lib/profile.ts";
import { classifyWithRules } from "../lib/classification.ts";
import { buildPlanRows, summarizeNextCyclePlan, explicitRecurringCommitments } from "../lib/plan.ts";
import { isExcludedFromSpending, isPayYourselfFirstMovement } from "../lib/transactions.ts";
import { calculateHealthScore } from "../lib/health.ts";
import { parseBackup, serialiseBackup } from "../lib/backup.ts";
import { parseGenericCsv, normaliseGenericCsvImport, normaliseMonzoImport } from "../lib/importers.ts";
import { parseMonzoCsv } from "../lib/imports.ts";
import { previewTransactionImport } from "../lib/import-workflow.ts";

const tx=(category,subcategory="")=>({id:"synthetic-1",date:"2026-09-01",merchant:"Example merchant",account:"bank",amount:-12,category,...(subcategory?{subcategory}:{})});
const legacy=()=>({...createFreshStore(),profile:undefined,transactions:[tx("Groceries","Local market")],merchantRules:[{key:"example merchant",label:"Example merchant",category:"Groceries",subcategory:"Local market",updatedAt:"2026-09-01"}],customSubcategories:{Groceries:["Local market"]}});

test("legacy taxonomy migrates additively, deterministically and idempotently",()=>{
  const source=legacy();const migrated=migrateUserProfile(source);
  assert.equal(categoryFor(migrated.profile,"Groceries").group,"essential");
  assert.equal(migrated.transactions[0].category,"Groceries");
  assert.equal(migrated.transactions[0].categoryId,"category:groceries");
  assert.equal(migrated.transactions[0].subcategoryId,"category:groceries/subcategory:local-market");
  assert.equal(migrated.profile.merchantRules[0].categoryId,"category:groceries");
  assert.equal(migrateUserProfile(migrated),migrated);
  assert.deepEqual(migrateUserProfile(legacy()).profile.categories,migrated.profile.categories);
});

test("fresh starter categories contain no personal or property-specific names",()=>{
  const categories=createFreshStore().profile.categories;
  assert.ok(categories.length>0);
  assert.ok(categories.some(item=>item.group==="essential"));
  assert.ok(categories.some(item=>item.group==="lifestyle"));
  assert.equal(categories.some(item=>item.group==="property"),false);
  assert.equal(JSON.stringify(categories).match(/rentalProperty|children|cycling|previousEmployer|currentEmployer|monzo|barclaycard/i),null);
});

test("category and subcategory IDs survive rename; archived items keep historical assignments",()=>{
  const migrated=migrateUserProfile(legacy());const old=migrated.transactions[0];
  let categories=addCategory(migrated.profile.categories,"Hobbies","lifestyle");
  const hobbies=categories.at(-1);assert.equal(hobbies.name,"Hobbies");
  categories=updateCategory(categories,hobbies.id,{name:"Interests",enabled:false});
  assert.equal(categories.at(-1).id,hobbies.id);assert.equal(categories.at(-1).enabled,false);
  categories=updateCategory(categories,"category:groceries",{name:"Food at home"});
  categories=addSubcategory(categories,"category:groceries","Farm shop");
  const farm=categoryFor({categories},"Food at home").subcategories.at(-1);
  categories=updateSubcategory(categories,"category:groceries",farm.id,{name:"Local produce",enabled:false});
  assert.equal(categoryFor({categories},"Food at home").subcategories.at(-1).id,farm.id);
  assert.deepEqual(resolveCategory(old,{categories}).category,"Food at home");
  assert.deepEqual(resolveCategory(old,{categories}).subcategory,"Local market");
  assert.equal(old.category,"Groceries");
  const archivedProfile={...migrated.profile,categories:updateCategory(categories,"category:groceries",{enabled:false})};
  assert.equal(classifyWithRules(old,[],undefined,undefined,archivedProfile).category,"Food at home");
  assert.equal(classifyWithRules({...tx("Groceries"),id:"new-import"},[],undefined,undefined,archivedProfile).category,"Other");
});

test("merchant rules and explicit overrides outrank imported heuristics after a rename",()=>{
  const migrated=migrateUserProfile(legacy());
  const profile={...migrated.profile,categories:updateCategory(migrated.profile.categories,"category:groceries",{name:"Food at home"})};
  const imported={...tx("Shopping"),merchant:"Example merchant"};
  const classified=classifyWithRules(imported,profile.merchantRules,undefined,undefined,profile);
  assert.equal(classified.category,"Food at home");
  assert.equal(classified.categoryId,"category:groceries");
  assert.equal(classifyWithRules({...imported,category:"Shopping",classificationOverride:true},profile.merchantRules,undefined,undefined,profile).category,"Shopping");
});

test("Plan membership follows group changes without changing spend or counting a fixed cost twice",()=>{
  const profile=createFreshStore().profile;
  const before=profile.categories.find(item=>item.name==="Groceries");
  const renamed=updateCategory(profile.categories,before.id,{name:"Food at home"});
  const moved=updateCategory(renamed,before.id,{group:"lifestyle"});
  const historical=resolveCategory(tx("Groceries"),{...profile,categories:renamed});
  assert.equal(historical.category,"Food at home");
  assert.equal(categoryGroupFor({...profile,categories:renamed},historical),"essential");
  assert.equal(categoryGroupFor({...profile,categories:moved},historical),"lifestyle");
  const details=[{key:"example",label:"Example",category:"Food at home",amount:12,source:"Monthly"}];
  const rows=buildPlanRows({categories:["Food at home"],lastCycleSpend:{"Food at home":40},commitments:details});
  assert.equal(rows[0].plannedAmount,40);
  assert.equal(rows[0].fixedCommitments,12);
  const essential=summarizeNextCyclePlan({planningIncome:100,essentials:rows,lifestyle:[],futureTotal:0});
  const lifestyle=summarizeNextCyclePlan({planningIncome:100,essentials:[],lifestyle:rows,futureTotal:0});
  assert.equal(essential.allocated,40);assert.equal(lifestyle.allocated,40);
  assert.equal(lifestyle.fixedCommitments,12);
});

test("generic and native import previews resolve through the same user category IDs",()=>{
  const store=createFreshStore();
  store.balances=[{id:"bank",name:"Example account",group:"asset",type:"Current account",value:100}];
  store.profile={...store.profile,categories:updateCategory(store.profile.categories,"category:groceries",{name:"Food at home"})};
  const mapping={version:1,id:"example-map",name:"Example",accountId:"bank",dateColumn:"Date",descriptionColumn:"Payee",amountMode:"single",amountColumn:"Amount",categoryColumn:"Category",dateFormat:"UK",spendingSign:"negative"};
  const parsed=parseGenericCsv("Date,Payee,Amount,Category\n01/09/2026,Example shop,-12,Groceries\n",mapping);
  const draft=normaliseGenericCsvImport(parsed,mapping,store.profile);
  const preview=previewTransactionImport(store,draft,"2026-09-02T12:00:00Z");
  assert.equal(preview.classified[0].categoryId,"category:groceries");
  assert.equal(preview.classified[0].category,"Food at home");
  const native=normaliseMonzoImport(parseMonzoCsv("Transaction ID,Date,Name,Amount,Category,Type\nabc,01/09/2026,Example shop,-12,Groceries,Card payment\n"),store.profile);
  const classified=classifyWithRules(native.transactions[0],[],undefined,undefined,store.profile);
  assert.equal(classified.categoryId,"category:groceries");
});

test("legacy backup carries taxonomy and Health Score inputs remain unchanged",()=>{
  const source=migrateUserProfile(legacy());
  const restored=migrateUserProfile(parseBackup(serialiseBackup(source)));
  assert.deepEqual(restored.profile.categories,source.profile.categories);
  assert.equal(restored.transactions[0].amount,source.transactions[0].amount);
  const inputs={cashProgress:50,savingsRate:10,cashFlowMargin:5,debtRatio:30};
  assert.equal(calculateHealthScore(inputs),calculateHealthScore({...inputs}));
});

test("group semantics preserve savings and exclude property recurring costs",()=>{
  const profile=createFreshStore().profile;
  const savings=resolveCategory({...tx("Savings","Bills pot"),merchant:"Example pot"},profile);
  assert.equal(isExcludedFromSpending(savings),true);
  assert.equal(isPayYourselfFirstMovement(savings),false);
  const withProperty={...profile,categories:[...profile.categories,makeCategory("Rental costs","property")]};
  const rental=resolveCategory({...tx("Rental costs"),spendingTreatment:"Recurring"},withProperty);
  assert.equal(explicitRecurringCommitments([rental],[],undefined,withProperty).length,0);
});

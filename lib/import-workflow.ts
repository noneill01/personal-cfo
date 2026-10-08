import { classifyWithRules } from "./classification.ts";
import { createBalanceSnapshot } from "./balances.ts";
import { syncGoalsWithBalances } from "./goals.ts";
import { applyImportEffects, resolveImportEffects, type NormalisedImportDraft } from "./importers.ts";
import { reconcileImportedTransactions } from "./transactions.ts";
import type { ImportRecord, Store } from "./types.ts";

/** The same provider-neutral reconciliation is used for preview and commit. */
export function previewTransactionImport(store:Store,draft:NormalisedImportDraft,now:string){
  let reconciled=0;
  const classified=draft.transactions.map(row=>classifyWithRules(row,store.profile?.merchantRules??[],store.profile?.incomeSources,store.profile?.merchantSubcategoryHints,store.profile));
  const originalBase=store.imports?.length?store.transactions:store.transactions.filter(row=>!/^\d+$/.test(row.id));
  const incoming=new Set(classified.map(row=>`${row.date}|${row.amount.toFixed(2)}|${row.category}`));
  const unmatched=originalBase.filter(row=>{const replaced=row.account==="Manual"&&incoming.has(`${row.date}|${row.amount.toFixed(2)}|${row.category}`);if(replaced)reconciled++;return !replaced});
  const {base,fresh,skipped}=reconcileImportedTransactions(unmatched,classified);
  const effects=resolveImportEffects({store,draft,classified,fresh,base,now});
  applyImportEffects(store,effects); // validate every proposed account update before showing a confirm button
  return {classified,base,fresh,skipped,reconciled,effects};
}

export function commitTransactionImport(store:Store,draft:NormalisedImportDraft,fileName:string,now:string){
  const preview=previewTransactionImport(store,draft,now);
  const applied=applyImportEffects(store,preview.effects);
  const date=now.slice(0,10),dates=preview.classified.map(row=>row.date).sort();
  const batchBase=`batch-${Date.now()}`;const priorIds=new Set((store.imports??[]).map(item=>item.id));let batchId=batchBase,suffix=2;while(priorIds.has(batchId))batchId=`${batchBase}-${suffix++}`;
  const record:ImportRecord={id:batchId,fileName,importedAt:now,added:preview.fresh.length,skipped:preview.skipped,rejected:draft.rejected,issues:draft.issues,warnings:preview.effects.warnings,needsReview:preview.fresh.filter(row=>row.categoryId==="category:other"||row.subcategoryId==="category:other/subcategory:needs-review"||(!row.categoryId&&row.category==="Other")).length,source:draft.source,importerId:draft.importerId,accountId:draft.accountId,...(draft.mappingId?{mappingId:draft.mappingId}:{}),balanceUpdates:applied.applied,from:dates[0],to:dates.at(-1)};
  const balances=applied.store.balances;
  const next:Store={...applied.store,transactions:[...preview.fresh.map(row=>({...row,importBatch:record.id})),...preview.base],imports:[record,...(store.imports??[])],goals:syncGoalsWithBalances(store.goals,balances),snapshots:applied.applied.length?[...(store.snapshots??[]).filter(item=>item.date!==date),createBalanceSnapshot(balances,date)].sort((a,b)=>a.date.localeCompare(b.date)):store.snapshots,updatedAt:date};
  return {store:next,record,preview};
}

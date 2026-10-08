import { accountKind } from "./balances.ts";
import { legacyCardCoverageAccountId, legacyImportAccountId, legacyTransactionAccountId } from "./legacy-account-compat.ts";
import { cycleBounds, type SalaryDateMap } from "./pay-cycles.ts";
import { defaultAccountCoverage } from "./profile.ts";
import type { AccountKind, Balance, ImportRecord, Store, Tx, UserProfile } from "./types.ts";

export type AccountCoverage = { accountId:string; name:string; kind:AccountKind; requirement:"required"|"optional"|"excluded"; from:string; to:string; gaps:Array<{from:string;to:string}>; count:number };
export type ActivityCoverage = {from:string;to:string;accounts:Record<string,number>;required:AccountCoverage[];optional:AccountCoverage[];excluded:AccountCoverage[];current:AccountCoverage[];credit:AccountCoverage[];currentFrom:string;currentTo:string;creditFrom:string;creditTo:string;currentGaps:Array<{from:string;to:string}>};

const latest=(dates:string[])=>dates.filter(Boolean).sort().at(-1)??"";
const earliest=(dates:string[])=>dates.filter(Boolean).sort()[0]??"";
const gapsBetween=(dates:string[])=>{
  const days=[...new Set(dates)].sort(),gaps:Array<{from:string;to:string}>=[];
  for(let i=1;i<days.length;i++){
    const previous=new Date(`${days[i-1]}T12:00:00Z`),next=new Date(`${days[i]}T12:00:00Z`);
    if((next.getTime()-previous.getTime())/86400000>7){previous.setUTCDate(previous.getUTCDate()+1);next.setUTCDate(next.getUTCDate()-1);gaps.push({from:previous.toISOString().slice(0,10),to:next.toISOString().slice(0,10)});}
  }
  return gaps;
};
export function configuredAccountCoverage(store:Pick<Store,"profile"|"balances"|"transactions"|"imports">):ActivityCoverage {
  const configs:UserProfile["accounts"]=store.profile?.accounts??store.balances.map(balance=>({id:balance.id,name:balance.name,kind:accountKind(balance)}));
  const importAccounts=new Map((store.imports??[]).map(batch=>[batch.id,batch.accountId??legacyImportAccountId(batch)]));
  const dates=new Map<string,string[]>(),counts:Record<string,number>={};
  for(const row of store.transactions){
    counts[row.account]=(counts[row.account]??0)+1;
    const accountId=configs.some(account=>account.id===row.account)?row.account:(row.importBatch?importAccounts.get(row.importBatch):undefined)??legacyTransactionAccountId(row);
    if(accountId&&row.date)dates.set(accountId,[...(dates.get(accountId)??[]),row.date]);
  }
  const all=configs.map(config=>{
    const activity=dates.get(config.id)??[];
    const requirement=config.coverage??defaultAccountCoverage(config.kind);
    return {accountId:config.id,name:config.name,kind:config.kind,requirement,from:earliest(activity),to:latest(activity),gaps:config.kind==="current"?gapsBetween(activity):[],count:activity.length};
  });
  const required=all.filter(account=>account.requirement==="required"),optional=all.filter(account=>account.requirement==="optional"),excluded=all.filter(account=>account.requirement==="excluded");
  const current=required.filter(account=>account.kind==="current"),credit=required.filter(account=>account.kind==="credit-card");
  const allDates=store.transactions.map(row=>row.date).filter(Boolean);
  return {from:earliest(allDates),to:latest(allDates),accounts:counts,required,optional,excluded,current,credit,currentFrom:latest(current.map(item=>item.from)),currentTo:earliest(current.map(item=>item.to)),creditFrom:latest(credit.map(item=>item.from)),creditTo:earliest(credit.map(item=>item.to)),currentGaps:current.flatMap(item=>item.gaps)};
}
/** Resolve modern account IDs first, then old display labels only through compatibility. */
export function transactionAccountId(row:Tx,imports:ImportRecord[]=[],knownAccountIds:string[]=[]):string|undefined {
  if(knownAccountIds.includes(row.account))return row.account;
  const batch=row.importBatch?imports.find(item=>item.id===row.importBatch):undefined;
  return batch?.accountId??(batch?legacyImportAccountId(batch):undefined)??legacyTransactionAccountId(row);
}
export const isCoveredTransaction=(row:Tx,coverage:ActivityCoverage,imports:ImportRecord[]=[])=>{
  const relevant=[...coverage.required,...coverage.optional];
  const accountId=transactionAccountId(row,imports,relevant.map(item=>item.accountId));
  return relevant.some(item=>item.accountId===accountId);
};
/** Keep unmatched historical/manual rows visible; exclude only known non-spending accounts. */
export const participatesInOverview=(row:Tx,coverage:ActivityCoverage,imports:ImportRecord[]=[])=>{
  const all=[...coverage.required,...coverage.optional,...coverage.excluded];
  const accountId=transactionAccountId(row,imports,all.map(item=>item.accountId));
  const config=all.find(item=>item.accountId===accountId);
  return !config||config.requirement!=="excluded";
};
export const accountFreshness=(account:AccountCoverage,today:string)=>{
  const threshold=account.kind==="credit-card"?35:7;
  if(!account.to)return false;
  const date=new Date(`${account.to}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+threshold);
  return date.toISOString().slice(0,10)>=today;
};
export function requiredBalanceFreshness(coverage:ActivityCoverage,balances:Balance[],today:string,snapshotFallback=""){
  const dates=coverage.required.map(account=>balances.find(balance=>balance.id===account.accountId)?.asOf??snapshotFallback);
  const oldest=earliest(dates);
  if(!coverage.required.length||dates.some(date=>!date))return {fresh:false,asOf:oldest};
  const expiry=new Date(`${oldest}T12:00:00Z`);expiry.setUTCDate(expiry.getUTCDate()+35);
  return {fresh:expiry.toISOString().slice(0,10)>=today,asOf:oldest};
}
export const baselineEligibleCycles=(keys:string[],currentKey:string,isComplete:(key:string)=>boolean,annotations:Store["cycleAnnotations"]={},limit=3)=>keys.filter(key=>key<currentKey&&isComplete(key)&&!annotations?.[key]?.excludeFromBaseline).slice(-limit);
function unresolvedForAccount(imports:ImportRecord[],accountId:string,start:string,end:string){
  const target=(batch:ImportRecord)=>batch.accountId??legacyImportAccountId(batch);
  return imports.some(batch=>target(batch)===accountId&&(batch.rejected??0)>0&&(!batch.from||batch.from<=end)&&(!batch.to||batch.to>=start)
    &&!imports.some(clean=>target(clean)===accountId&&clean.importedAt>batch.importedAt&&clean.rejected===0&&clean.from&&clean.to&&batch.from&&batch.to&&clean.from<=batch.from&&clean.to>=batch.to));
}
export function cycleCoverageStatus(key:string,payday:number,salaryDates:SalaryDateMap,coverage:ActivityCoverage,imports:ImportRecord[]=[],confirmations:Store["cardCoverageConfirmations"]={},accountConfirmations:Store["accountCoverageConfirmations"]={}){
  const bounds=cycleBounds(key,payday,salaryDates);
  const accounts=coverage.required.map(account=>{
    const confirmed=account.kind==="credit-card"?(accountConfirmations?.[key]?.[account.accountId]?.through??(account.accountId===legacyCardCoverageAccountId?confirmations?.[key]?.through:undefined)??""):"";
    const effectiveTo=latest([account.to,confirmed]);
    const gap=account.gaps.some(item=>item.from<=bounds.end&&item.to>=bounds.start);
    return {...account,confirmedThrough:confirmed,effectiveTo,complete:Boolean(account.from&&account.from<=bounds.start&&effectiveTo>=bounds.end&&!gap&&!unresolvedForAccount(imports,account.accountId,bounds.start,bounds.end))};
  });
  const current=accounts.filter(item=>item.kind==="current"),credit=accounts.filter(item=>item.kind==="credit-card");
  return {bounds,accounts,complete:accounts.length>0&&accounts.every(item=>item.complete),currentComplete:current.length>0&&current.every(item=>item.complete),creditComplete:credit.every(item=>item.complete),creditHistoryStarted:credit.some(item=>item.from&&item.from<=bounds.start),confirmedCreditThrough:earliest(credit.map(item=>item.confirmedThrough)),effectiveCreditTo:earliest(credit.map(item=>item.effectiveTo))};
}

import type { ImportRecord, Tx } from "./types.ts";
import { recurringDatesInRange } from "./recurring.ts";
import { transactionAccountId } from "./coverage.ts";

export type CashRunwayPoint = {
  date: string;
  actual: number;
  onTrack: number;
  netMovement: number;
  personalSpend: number;
  savingsTopUp: number;
  expectedFixedSpend: number;
};

export type CashRunwayCommitment = {
  key: string;
  expected: number;
  scheduledAmount: number;
  lastDate: string;
  frequency: "weekly" | "monthly" | "quarterly" | "annual" | "irregular";
};

export type CashRunway = {
  points: CashRunwayPoint[];
  openingBalance: number;
  balanceAtEnd: number;
  savingsTopUps: number;
  dataThrough: string;
  hasAccountActivity: boolean;
  hasBalanceAnchor: boolean;
};
export type RunwayCashAccount = {accountId:string;balance:number;balanceThrough:string;balanceKnown?:boolean};

const dateAtNoon = (value: string) => new Date(`${value}T12:00:00`);
const addDays = (value: string, days: number) => { const date=dateAtNoon(value);date.setDate(date.getDate()+days);return date.toISOString().slice(0,10); };
const distanceInDays = (from: string, to: string) => Math.max(0,Math.round((dateAtNoon(to).getTime()-dateAtNoon(from).getTime())/86_400_000));

function expectedFixedSpending(start:string,end:string,commitments:CashRunwayCommitment[]) {
  const expectedByDate=new Map<string,number>();
  const record=(date:string,amount:number)=>expectedByDate.set(date,(expectedByDate.get(date)??0)+amount);
  for(const commitment of commitments){
    if(!commitment.lastDate||commitment.scheduledAmount<=0||commitment.frequency==="irregular")continue;
    recurringDatesInRange(commitment.lastDate,commitment.frequency,start,end).forEach(date=>record(date,commitment.scheduledAmount));
  }
  return expectedByDate;
}

/**
 * Rebuild the current-account path from configured anchored balances. It retains
 * transfers from savings as real top-ups. Its target path places known fixed
 * commitments on their expected collection dates, then spreads only the
 * variable-spending allowance across the rest of the cycle. Card purchases
 * are intentionally not treated as current cash until the card payment leaves
 * a selected current account.
 */
export function buildCashRunway({
  allTransactions,
  personalTransactions,
  start,
  end,
  cashAccounts,
  imports = [],
  spendingPlan,
  fixedCommitments = [],
  live,
}: {
  allTransactions: Tx[];
  personalTransactions: Tx[];
  start: string;
  end: string;
  cashAccounts: RunwayCashAccount[];
  imports?: ImportRecord[];
  spendingPlan: number;
  fixedCommitments?: CashRunwayCommitment[];
  live: boolean;
}): CashRunway {
  const accountIds=cashAccounts.map(account=>account.accountId);
  const selected=allTransactions.filter(transaction=>accountIds.includes(transactionAccountId(transaction,imports,accountIds)??""));
  const personalIds=new Set(personalTransactions.map(transaction=>transaction.id));
  const inCycle=selected.filter(transaction=>transaction.date>=start&&transaction.date<=end);
  const latestActivity=inCycle.map(transaction=>transaction.date).sort().at(-1)??"";
  const accountThrough=cashAccounts.map(account=>account.balanceThrough||selected.filter(row=>transactionAccountId(row,imports,accountIds)===account.accountId).map(row=>row.date).sort().at(-1)||"").filter(Boolean);
  const reconstructionThrough=accountThrough.sort()[0]??"";
  const preferredEnd=live?(latestActivity||start):end;
  const chartEnd=reconstructionThrough&&reconstructionThrough<preferredEnd?reconstructionThrough:preferredEnd;
  const totalDays=distanceInDays(start,end)+1;
  const displayedDays=distanceInDays(start,chartEnd)+1;
  const fixedByDate=expectedFixedSpending(start,end,fixedCommitments);
  const fixedPlan=[...fixedByDate.values()].reduce((total,value)=>total+value,0);
  const variableSpendingPlan=Math.max(0,spendingPlan-fixedPlan);
  const cycleTransactions=inCycle.filter(transaction=>transaction.date<=chartEnd);
  const balanceAtEnd=cashAccounts.reduce((total,account)=>{
    const through=account.balanceThrough||selected.filter(row=>transactionAccountId(row,imports,accountIds)===account.accountId).map(row=>row.date).sort().at(-1)||"";
    const laterMovement=selected.filter(transaction=>transactionAccountId(transaction,imports,accountIds)===account.accountId&&transaction.date>chartEnd&&(!through||transaction.date<=through)).reduce((sum,transaction)=>sum+transaction.amount,0);
    return total+account.balance-laterMovement;
  },0);
  const openingBalance=balanceAtEnd-cycleTransactions.reduce((total,transaction)=>total+transaction.amount,0);
  const byDate=new Map<string,Tx[]>();
  for(const transaction of cycleTransactions)byDate.set(transaction.date,[...(byDate.get(transaction.date)??[]),transaction]);
  const points:CashRunwayPoint[]=[];
  let actual=openingBalance;
  let onTrack=openingBalance;
  let savingsTopUps=0;
  for(let index=0;index<displayedDays;index+=1){
    const date=addDays(start,index);
    const day=byDate.get(date)??[];
    const netMovement=day.reduce((total,transaction)=>total+transaction.amount,0);
    const personalSpend=day.filter(transaction=>personalIds.has(transaction.id)).reduce((total,transaction)=>total-transaction.amount,0);
    const nonPersonalMovement=netMovement+personalSpend;
    // A transfer between two selected current accounts is not a savings top-up.
    const dayTopUps=Math.max(0,day.filter(transaction=>transaction.categoryGroup?["future","transfer"].includes(transaction.categoryGroup):["Savings","Transfers"].includes(transaction.category)).reduce((total,transaction)=>total+transaction.amount,0));
    const expectedFixedSpend=fixedByDate.get(date)??0;
    actual+=netMovement;
    onTrack+=nonPersonalMovement-expectedFixedSpend-variableSpendingPlan/totalDays;
    savingsTopUps+=dayTopUps;
    points.push({date,actual,onTrack,netMovement,personalSpend,savingsTopUp:dayTopUps,expectedFixedSpend});
  }
  return {points,openingBalance,balanceAtEnd,savingsTopUps,dataThrough:chartEnd,hasAccountActivity:cycleTransactions.length>0,hasBalanceAnchor:cashAccounts.length>0&&cashAccounts.every(account=>account.balanceKnown!==false)};
}

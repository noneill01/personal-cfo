import type { HomeScreenPropsWithHealthHistory } from './screen-props';

/** Labels are presentation only: saved routes and browser history remain compatible. */
export const navigationItems = [
  {label:'Home',target:'Overview'}, {label:'Activity',target:'Transactions'},
  {label:'Plan',target:'Budget'}, {label:'Review',target:'Monthly Review'},
  {label:'Settings',target:'Settings'}, {label:'Tax',target:'Tax'},
] as const;
export function screenTitle(tab:string) {
  return ({Overview:'Home',Transactions:'Activity',Budget:'Plan',Plan:'Plan',
    'Monthly Review':'Review',Income:'Payroll & pension','Direct Debits':'Regular payments',
    Update:'Data & imports',Backup:'Backup & privacy',Leakage:'Spending insights'} as Record<string,string>)[tab]??tab;
}

/** Group established values without changing their accounting definitions. */
export function buildHomeSummary(props:HomeScreenPropsWithHealthHistory) {
  return {
    position:{netWorth:props.totals.net,cashAfterCards:props.totals.netLiquid,
      currentAccounts:props.totals.currentAccount,asOf:props.balancesAsOf},
    period:{key:props.overviewCycleKey,label:props.cycleLabel(props.overviewCycleKey,props.payday,props.salaryDates),
      ready:props.overviewFlowReady,state:props.overviewDataState,income:props.overviewIncome,
      spending:props.overviewSpending,saved:props.overviewSavings,result:props.overviewUnallocated},
    attention:props.cfoAttentionItems,
    categories:props.overviewCategorySpend,
    trend:props.snapshots.map(snapshot=>({date:snapshot.date,netWorth:snapshot.netWorth})),
  };
}

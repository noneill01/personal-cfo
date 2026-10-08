import type { AccountKind, Balance, CardStatementSummary, Snapshot, Store, UserProfile } from "./types.ts";

const LEGACY_ACCOUNT_KINDS: Record<string, AccountKind> = {
  "Current account": "current",
  Cash: "savings",
  "Cash ISA": "cash-isa",
  ISA: "investment-isa",
  "Stocks & Shares ISA": "investment-isa",
  VCT: "investment",
  Investment: "investment",
  "Credit card": "credit-card",
  Mortgage: "mortgage",
  Loan: "loan",
  Pension: "pension",
  Property: "property",
};

/** Interpret old saved labels without rewriting or narrowing the saved Balance. */
export function accountKind(balance: Pick<Balance, "type">): AccountKind {
  return Object.prototype.hasOwnProperty.call(LEGACY_ACCOUNT_KINDS, balance.type)
    ? LEGACY_ACCOUNT_KINDS[balance.type]
    : "other";
}

export function isCashAccount(balance: Pick<Balance, "type">): boolean {
  return ["current", "savings", "cash-isa"].includes(accountKind(balance));
}

const sum = (balances: Balance[], group: Balance["group"], kinds?: readonly AccountKind[]) =>
  balances.filter(b => b.group === group && (!kinds || kinds.includes(accountKind(b)))).reduce((total, b) => total + b.value, 0);
const roundedSum = (balances: Balance[], group: Balance["group"], kinds?: readonly AccountKind[]) =>
  Math.round(sum(balances, group, kinds) * 100) / 100;

export function assetBalance(balances: Balance[]) { return sum(balances, "asset"); }
export function debtBalance(balances: Balance[]) { return sum(balances, "liability"); }
export function currentAccountBalance(balances: Balance[]) { return sum(balances, "asset", ["current"]); }
export function savingsBalance(balances: Balance[]) { return sum(balances, "asset", ["savings"]); }
export function pensionBalance(balances: Balance[]) { return sum(balances, "asset", ["pension"]); }
export function propertyAssetBalance(balances: Balance[]) { return roundedSum(balances, "asset", ["property"]); }
export function investmentBalance(balances: Balance[]) { return roundedSum(balances, "asset", ["investment", "investment-isa"]); }

export function cashBalance(balances: Balance[]) {
  return roundedSum(balances, "asset", ["current", "savings", "cash-isa"]);
}

export function isaBalance(balances: Balance[]) {
  return roundedSum(balances, "asset", ["investment-isa"]);
}

export function cardDebtBalance(balances: Balance[]) {
  return roundedSum(balances, "liability", ["credit-card"]);
}

export function cashAfterCardDebt(balances: Balance[]) {
  return Math.round((cashBalance(balances) - cardDebtBalance(balances)) * 100) / 100;
}

/** Spendable current cash is distinct from reserves; coverage exclusion can opt a current account out of planning. */
export function planningCashPosition(balances:Balance[],profile?:UserProfile) {
  const config=new Map(profile?.accounts.map(account=>[account.id,account])??[]);
  const kind=(balance:Balance)=>config.get(balance.id)?.kind??accountKind(balance);
  const currentAccounts=balances.filter(balance=>balance.group==="asset"&&kind(balance)==="current"&&config.get(balance.id)?.coverage!=="excluded");
  const reserves=balances.filter(balance=>balance.group==="asset"&&["savings","cash-isa"].includes(kind(balance)));
  const cards=balances.filter(balance=>balance.group==="liability"&&kind(balance)==="credit-card");
  const total=(items:Balance[])=>Math.round(items.reduce((sum,item)=>sum+item.value,0)*100)/100;
  const current=total(currentAccounts),reserve=total(reserves),cardDebt=total(cards);
  return {currentAccounts,current,reserve,cardDebt,liquid:Math.round((current+reserve)*100)/100,afterCardDebt:Math.round((current+reserve-cardDebt)*100)/100};
}

export function mortgageDebtBalance(balances: Balance[]) { return roundedSum(balances, "liability", ["mortgage"]); }
export function propertyEquity(balances: Balance[]) { return Math.round((propertyAssetBalance(balances) - mortgageDebtBalance(balances)) * 100) / 100; }
export function emergencyBalance(balances: Balance[]) { return Math.max(0, cashAfterCardDebt(balances)); }

export function createBalanceSnapshot(balances: Balance[], date: string): Snapshot {
  return { date, netWorth: roundedSum(balances, "asset") - roundedSum(balances, "liability"), cash: cashAfterCardDebt(balances),
    cashBasis: "net-cash-v2", grossCash: cashBalance(balances), cardDebt: cardDebtBalance(balances),
    isa: isaBalance(balances), cashIsa: roundedSum(balances, "asset", ["cash-isa"]),
    pension: roundedSum(balances, "asset", ["pension"]), debt: roundedSum(balances, "liability"),
    accountBalances: balances.map(b => ({ ...b })) };
}

export function comparableCash(snapshot: Snapshot): number | undefined {
  return snapshot.cashBasis === "net-cash-v2" || snapshot.cashBasis === "net-cash-v1" ? snapshot.cash : undefined;
}

/** Older records lack the account breakdown needed to reconstruct cash honestly. */
export function migrateBalanceHistory(store: Store): Store {
  return { ...store, balanceSchemaVersion: 2,
    balances: store.balances.map(b => b.type === "ISA" ? { ...b, type: "Stocks & Shares ISA" } : b),
    snapshots: (store.snapshots ?? []).map(s => {
      if (s.cashBasis) return s;
      if (s.accountBalances) return { ...s, ...createBalanceSnapshot(s.accountBalances, s.date) };
      return { ...s, cashBasis: s.isa !== undefined ? "net-cash-v1" : "legacy-unknown" };
    }) };
}

export function cashChange(snapshots: Snapshot[]): number | undefined {
  const ordered = [...snapshots].sort((a,b) => a.date.localeCompare(b.date));
  const latest = ordered.at(-1), previous = ordered.at(-2);
  if (!latest || !previous || comparableCash(latest) === undefined || comparableCash(previous) === undefined) return undefined;
  return Math.round((latest.cash - previous.cash) * 100) / 100;
}

export function cardStatementCanUpdate(balances: Balance[], previous: CardStatementSummary | undefined, incoming: CardStatementSummary,accountId?:string) {
  const latest=[accountId?balances.find(b=>b.id===accountId)?.asOf??"":balances.filter(b=>b.group==="liability"&&accountKind(b)==="credit-card").map(b=>b.asOf??"").sort().at(-1)??"",previous?.statementDate??""].sort().at(-1)??"";
  return incoming.statementDate >= latest;
}

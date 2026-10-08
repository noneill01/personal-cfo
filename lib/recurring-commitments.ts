import { merchantRuleKey } from "./classification.ts";
import type { DirectDebitSetting, RecurringCommitment, Store, Tx, UserProfile } from "./types.ts";
import type { RecurringCommitmentDefinition } from "./plan.ts";
import { inferRecurringFrequency } from "./recurring.ts";
import { categoryGroupFor } from "./categories.ts";
import { hasRole } from "./transaction-roles.ts";

export type CommitmentEvidence = RecurringCommitmentDefinition & {
  paymentMethod: RecurringCommitment["paymentMethod"];
  status: RecurringCommitment["status"];
};

const priority = { detected: 0, confirmed: 1, "user-overridden": 2 } as const;
const identity = (key: string) => `merchant:${key}`;
const matchingEvidence = (record: RecurringCommitment, candidates: RecurringCommitment[]) => {
  const sameMerchant = candidates.filter(item=>item.key===record.key);
  if (record.reference) return sameMerchant.find(item=>signal(item.reference)===signal(record.reference));
  if (record.description) return sameMerchant.find(item=>signal(item.description)===signal(record.description));
  if (sameMerchant.length===1) return sameMerchant[0];
  if (record.id!==identity(record.key)) return undefined;
  return sameMerchant.sort((a,b)=>Math.abs(a.scheduledAmount-record.scheduledAmount)-Math.abs(b.scheduledAmount-record.scheduledAmount)||a.id.localeCompare(b.id))[0];
};
const signal = (value: string | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const amountBand = (amount: number) => Math.round(Math.abs(amount) / 5) * 5;
type TransactionGroup = { id: string; key: string; reference?: string; description?: string; subcategory?: string; transactions: Tx[] };

/** Provider IDs identify individual payments, never mandates. Use obligation-level signals only. */
export function groupCommitmentTransactions(transactions: Tx[]): TransactionGroup[] {
  const byMerchant = new Map<string, Tx[]>();
  for (const transaction of transactions.filter(row => row.amount < 0)) {
    const key = merchantRuleKey(transaction.merchant);
    if (key) { const rows=byMerchant.get(key); if(rows)rows.push(transaction); else byMerchant.set(key,[transaction]); }
  }
  const groups: TransactionGroup[] = [];
  for (const [key, merchantRows] of byMerchant) {
    const repeatDates = (field: (row: Tx) => string) => {
      const dates = new Map<string, Set<string>>();
      for (const row of merchantRows) { const value=field(row); if(value)dates.set(value,(dates.get(value)??new Set()).add(row.date)); }
      return dates;
    };
    const references = repeatDates(row=>signal(row.reference));
    const descriptions = repeatDates(row=>signal(row.originalDescription));
    const strong = new Map<string, TransactionGroup>();
    const fallback = new Map<string, Tx[]>();
    for (const transaction of merchantRows) {
      const rawReference = signal(transaction.reference);
      const reference = rawReference && (/direct debit|standing order/i.test(transaction.transactionType??"") || (references.get(rawReference)?.size??0)>=2)
        ? rawReference : "";
      const description = signal(transaction.originalDescription);
      const merchantDescription = signal(transaction.merchant);
      const distinctiveDescription = description && description !== merchantDescription && (descriptions.get(description)?.size??0)>=2 ? description : "";
      const strongId = reference ? `ref:${key}:${reference}` : distinctiveDescription ? `description:${key}:${distinctiveDescription}` : "";
      if (strongId) {
        const group = strong.get(strongId) ?? { id: strongId, key, reference: reference || undefined,
          description: distinctiveDescription || undefined, subcategory: transaction.subcategory, transactions: [] };
        group.transactions.push(transaction);
        strong.set(strongId, group);
      } else {
        const fallbackKey = `${transaction.category}\u0000${transaction.subcategory ?? ""}`;
        const rows=fallback.get(fallbackKey); if(rows)rows.push(transaction); else fallback.set(fallbackKey,[transaction]);
      }
    }
    for (const [fallbackKey, rows] of fallback) {
      const [category, subcategory] = fallbackKey.split("\u0000");
      const compatible = [...strong.values()].filter(group => {
        const sample = group.transactions[0];
        const median = [...group.transactions.map(row => Math.abs(row.amount))].sort((a,b)=>a-b)[Math.floor(group.transactions.length/2)];
        return sample.category === category && (sample.subcategory ?? "") === subcategory &&
          rows.every(row => Math.abs(Math.abs(row.amount)-median) <= Math.max(5,median*.15));
      });
      if (compatible.length === 1) { compatible[0].transactions.push(...rows); continue; }
      const bands = new Map<number, Tx[]>();
      for (const row of rows) { const band=amountBand(row.amount); const items=bands.get(band); if(items)items.push(row); else bands.set(band,[row]); }
      const recurringBands = [...bands.values()].filter(items => new Set(items.map(item => item.date.slice(0,7))).size >= 2);
      const overlapping = recurringBands.length >= 2 && recurringBands.some((first,index) => recurringBands.slice(index+1).some(second =>
        first.some(item => second.some(other => item.date.slice(0,7) === other.date.slice(0,7)))));
      const byDay = new Map<number, Tx[]>();
      for (const row of rows) { const day=Number(row.date.slice(8,10)); const items=byDay.get(day); if(items)items.push(row); else byDay.set(day,[row]); }
      const recurringDays = [...byDay.values()].filter(items=>new Set(items.map(item=>item.date.slice(0,7))).size>=2);
      const overlappingDays = recurringDays.length>=2 && recurringDays.some((first,index)=>recurringDays.slice(index+1).some(second=>
        first.some(item=>second.some(other=>item.date.slice(0,7)===other.date.slice(0,7)))));
      const partitions = overlapping ? [...bands.entries()].map(([value,items])=>({kind:"amount",value,items}))
        : overlappingDays ? [...byDay.entries()].map(([value,items])=>({kind:"day",value,items}))
          : [{kind:"single",value:0,items:rows}];
      for (const {kind,value,items} of partitions) groups.push({
        id: kind !== "single" ? `pattern:${key}:${signal(category)}:${signal(subcategory)}:${kind}:${value}`
          : fallback.size === 1 && strong.size === 0 ? identity(key) : `fallback:${key}:${signal(category)}:${signal(subcategory)}`,
        key, subcategory: subcategory || undefined, transactions: items,
      });
    }
    groups.push(...strong.values());
  }
  return groups.sort((a,b)=>a.id.localeCompare(b.id));
}

export function paymentMethodFor(transaction: Tx): RecurringCommitment["paymentMethod"] {
  const type = transaction.transactionType?.toLowerCase() ?? "";
  if (type.includes("direct debit")) return "direct-debit";
  if (type.includes("standing order")) return "standing-order";
  if (type.includes("card") || /barclaycard|credit card/i.test(transaction.account)) return "card";
  if (type.includes("transfer")) return "transfer";
  return transaction.account === "Manual" ? "manual" : "unknown";
}

export function detectedDirectDebitDefinitions(transactions: Tx[], through: string): RecurringCommitmentDefinition[] {
  return groupCommitmentTransactions(transactions.filter(row => /direct debit/i.test(row.transactionType ?? "")))
    .flatMap(group => {
      const byDate = new Map<string, number>();
      for (const row of group.transactions) byDate.set(row.date,(byDate.get(row.date)??0)-row.amount);
      const payments = [...byDate].sort(([a],[b])=>a.localeCompare(b)).map(([date,amount])=>({date,amount}));
      const latest = [...group.transactions].sort((a,b)=>a.date.localeCompare(b.date)).at(-1)!;
      const amounts = payments.slice(-3).map(payment=>payment.amount).sort((a,b)=>a-b);
      const scheduledAmount = amounts[Math.floor(amounts.length/2)];
      const frequency = inferRecurringFrequency(payments);
      const lastDate = payments.at(-1)!.date;
      const age = through ? (Date.parse(`${through}T12:00:00`)-Date.parse(`${lastDate}T12:00:00`))/86400000 : 999;
      const window = frequency === "weekly" ? 21 : frequency === "quarterly" ? 125 : frequency === "annual" ? 400 : 75;
      const expected = frequency === "weekly" ? scheduledAmount*52/12 : scheduledAmount/(frequency === "quarterly" ? 3 : frequency === "annual" ? 12 : 1);
      if (age > window) return [];
      return [{ id: group.id, key: group.key, label: latest.merchant, category: latest.category,
        subcategory: group.subcategory, reference: group.reference, description: group.description,
        expected, scheduledAmount, frequency, lastDate, source: `${frequency[0].toUpperCase()}${frequency.slice(1)} · Direct Debit`, payments }];
    });
}

/** Persisted IDs and strong transaction evidence identify obligations; merchant is only a fallback. */
export function reconcileRecurringCommitments(
  saved: RecurringCommitment[] | undefined,
  evidence: CommitmentEvidence[],
  legacySettings: Record<string, DirectDebitSetting> = {},
): RecurringCommitment[] {
  const result = new Map<string, RecurringCommitment>();
  for (const candidate of evidence) {
    if (!candidate.key || candidate.scheduledAmount <= 0) continue;
    const candidateId = candidate.id ?? identity(candidate.key);
    const next: RecurringCommitment = {
      id: candidateId, key: candidate.key, label: candidate.label,
      category: candidate.category,
      ...(candidate.subcategory ? { subcategory: candidate.subcategory } : {}),
      ...(candidate.reference ? { reference: candidate.reference } : {}),
      ...(candidate.description ? { description: candidate.description } : {}),
      scheduledAmount: candidate.scheduledAmount,
      frequency: candidate.frequency, lastDate: candidate.lastDate,
      paymentMethod: candidate.paymentMethod, status: candidate.status, source: candidate.source,
    };
    const previous = result.get(next.id);
    if (!previous || priority[next.status] > priority[previous.status] ||
      (priority[next.status] === priority[previous.status] && next.lastDate > previous.lastDate)) result.set(next.id, next);
  }
  for (const record of saved ?? []) {
    const key = record.key.trim();
    if (!key) continue;
    const exact = result.get(record.id);
    // Phase 4 records used merchant:<key>. Match one candidate deterministically,
    // retaining the explicit decision while allowing other mandates to survive.
    const matched = !exact ? matchingEvidence(record,[...result.values()]) : undefined;
    const detected = exact ?? matched;
    const preserveId = detected && record.id !== identity(key) && !record.id.startsWith("ref:") && !record.id.startsWith("description:") && !record.id.startsWith("pattern:") && !record.id.startsWith("fallback:");
    const targetId = preserveId ? record.id : detected?.id ?? record.id;
    // Detected evidence may refresh amount/date, but cannot reverse an explicit decision.
    if (!detected || priority[record.status] >= priority[detected.status]) {
      if (detected && targetId !== detected.id) result.delete(detected.id);
      result.set(targetId, record.status === "detected" && detected
        ? { ...detected, id: targetId, ...(record.archived === undefined ? {} : { archived: record.archived }) }
        : record.status === "confirmed" && detected?.status === "confirmed"
          ? { ...detected, id: targetId, ...(record.archived === undefined ? {} : { archived: record.archived }) }
          : { ...detected, ...record, id: targetId, key,
            scheduledAmount: record.status === "user-overridden" ? record.scheduledAmount : detected?.scheduledAmount ?? record.scheduledAmount,
            lastDate: detected?.lastDate && detected.lastDate > record.lastDate ? detected.lastDate : record.lastDate });
    }
  }
  // Old backups stored user decisions here; migrate them without changing keys.
  for (const [key, setting] of Object.entries(legacySettings)) {
    for (const current of [...result.values()].filter(item=>item.key===key && item.status!=="user-overridden"))
      result.set(current.id, { ...current, frequency: setting.frequency, archived: setting.archived, status: "user-overridden" });
  }
  return [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function commitmentEvidence(
  transactions: Tx[],
  directDebits: RecurringCommitmentDefinition[],
  explicit: RecurringCommitmentDefinition[],
  maintenance: RecurringCommitmentDefinition[],
): CommitmentEvidence[] {
  const groups = groupCommitmentTransactions(transactions);
  const latestFor = (row: RecurringCommitmentDefinition) => {
    const group = groups.find(item=>item.id===(row.id??identity(row.key)));
    return group?.transactions.sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
  };
  return [
    ...directDebits.map(row => ({ ...row, paymentMethod: "direct-debit" as const, status: "detected" as const })),
    ...explicit.map(row => ({ ...row, paymentMethod: paymentMethodFor(latestFor(row) ?? {
      id: "", date: "", merchant: row.label, category: row.category, amount: -row.scheduledAmount, account: "Manual",
    }), status: "confirmed" as const })),
    ...maintenance.map(row => ({ ...row, paymentMethod: "transfer" as const, status: "detected" as const })),
  ];
}

export function activeCommitmentDefinitions(
  records: RecurringCommitment[], transactions: Tx[], evidence: RecurringCommitmentDefinition[],
  rental?: UserProfile["propertyConfig"], profile?:UserProfile,
): RecurringCommitmentDefinition[] {
  const byId = new Map(evidence.map(row => [row.id??identity(row.key), row]));
  const evidenceRows = evidence.map(row=>({id:row.id??identity(row.key),key:row.key,label:row.label,category:row.category,
    scheduledAmount:row.scheduledAmount,frequency:row.frequency,lastDate:row.lastDate,paymentMethod:"unknown" as const,
    status:"detected" as const,source:row.source,reference:row.reference,description:row.description}));
  const evidenceFor=(record:RecurringCommitment)=>{
    const match=matchingEvidence(record,evidenceRows);
    return byId.get(record.id)??(match?byId.get(match.id):undefined);
  };
  const groups = new Map(groupCommitmentTransactions(transactions).map(group=>[group.id,group]));
  return records.filter(record => !record.archived && record.scheduledAmount > 0 &&
    (evidenceFor(record) || (record.status !== "detected" && record.paymentMethod !== "direct-debit")) &&
    record.key !== rental?.rentalMortgageMerchantKey && record.category !== rental?.rentalCategory && categoryGroupFor(profile,record.category)!=="property")
    .map(record => {
      const matchedEvidence=evidenceFor(record);
      const matches = record.key === "child-maintenance"
        ? transactions.filter(transaction=>transaction.amount<0&&hasRole(transaction,"maintenance"))
        : groups.get(matchedEvidence?.id??record.id)?.transactions ?? [];
      const payments = matchedEvidence?.payments ?? matches.map(transaction => ({ date: transaction.date, amount: -transaction.amount }));
      const months = record.frequency === "monthly" ? 1 : record.frequency === "quarterly" ? 3 : record.frequency === "annual" ? 12 : 0;
      return { id: record.id, evidenceId: matchedEvidence?.id, key: record.key, label: record.label, category: record.category,
        subcategory: record.subcategory, reference: record.reference, description: record.description,
        expected: record.frequency === "weekly" ? record.scheduledAmount * 52 / 12 : months ? record.scheduledAmount / months : 0,
        scheduledAmount: record.scheduledAmount, frequency: record.frequency,
        lastDate: record.lastDate, source: record.source, payments };
    });
}

export function migrateRecurringCommitments(store: Store, evidence: CommitmentEvidence[]): Store {
  const next = reconcileRecurringCommitments(store.recurringCommitments, evidence, store.directDebitSettings);
  return JSON.stringify(next) === JSON.stringify(store.recurringCommitments ?? [])
    ? store : { ...store, recurringCommitments: next };
}

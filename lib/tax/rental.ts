import type { TaxFact, TaxIssue } from "./types.ts";

const day = 86_400_000;
const dateDistance = (left?: string, right?: string) => left && right
  ? Math.abs(new Date(`${left}T12:00:00Z`).getTime() - new Date(`${right}T12:00:00Z`).getTime()) / day
  : Number.POSITIVE_INFINITY;

export function matchingRentalTransactions(input: { date: string; amount: number }, facts: TaxFact[], toleranceDays = 3) {
  return facts.filter(fact => fact.type === "rental-income" && fact.sourceType === "transaction"
    && Math.abs(fact.amount - input.amount) < .005 && dateDistance(fact.date, input.date) <= toleranceDays);
}

export function probableRentalDuplicatePairs(facts: TaxFact[]) {
  return facts.flatMap(manual => {
    if (manual.type !== "rental-income" || manual.sourceType !== "manual" || manual.provenance?.separateEconomicEvent === true || manual.linkedTransactionIds?.length) return [];
    return matchingRentalTransactions({ date: manual.date ?? "", amount: manual.amount }, facts).map(transaction => ({ manual, transaction }));
  });
}

export function rentalDuplicateIssues(facts: TaxFact[]): TaxIssue[] {
  return probableRentalDuplicatePairs(facts).map(({ manual, transaction }) => ({
    id: `rental-possible-duplicate-${manual.id}-${transaction.id}`, severity: "attention", category: "reconciliation",
    title: "Possible duplicate rental receipt",
    explanation: `A manual £${manual.amount.toFixed(2)} rental receipt is close to a matching bank transaction. Link them as one event or confirm they are separate.`,
    action: "Review rental evidence",
  }));
}

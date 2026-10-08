import { factsForTaxYear } from "./facts.ts";
import { employerKey, withEmployerIdentity } from "./employers.ts";
import { normalisePensionFacts } from "./pensions.ts";
import type { TaxDocument, TaxFact, TaxFactType } from "./types.ts";

export type ReconciledTaxEvidence = {
  facts: TaxFact[];
  reconciled: Array<{ employer: string; type: TaxFactType; preferred: TaxFact; replaced: TaxFact[]; difference: number }>;
  linked: Array<{ preferred: TaxFact; replaced: TaxFact[] }>;
};
const sum = (facts: TaxFact[]) => facts.reduce((total, fact) => total + fact.amount, 0);

/** A bank transaction and its manually-confirmed tax fact are one event, not two. */
function deduplicateLinkedFacts(facts: TaxFact[]) {
  const chosen = new Map<string, TaxFact>();
  const linkedGroups = new Map<string, TaxFact[]>();
  const rank = (fact: TaxFact) => (fact.confidence === "verified" ? 4 : fact.confidence === "high" ? 3 : fact.confidence === "medium" ? 2 : 1) + (fact.sourceType === "manual" ? .5 : 0);
  for (const fact of facts) {
    const linkedTransaction = fact.linkedTransactionIds?.[0];
    if (!linkedTransaction) { chosen.set(`fact:${fact.id}`, fact); continue; }
    const key = `${fact.type}|${linkedTransaction}`;
    const existing = chosen.get(key);
    if (!existing || rank(fact) > rank(existing)) chosen.set(key, fact);
    linkedGroups.set(key, [...(linkedGroups.get(key) ?? []), fact]);
  }
  return { facts: [...chosen.values()], linked: [...linkedGroups.entries()].flatMap(([key, rows]) => rows.length > 1 ? [{ preferred: chosen.get(key)!, replaced: rows.filter(row => row.id !== chosen.get(key)!.id) }] : []) };
}

/**
 * A P60 (or P45 for a finished role) replaces, rather than supplements, the
 * corresponding payslip aggregate for the same employer and tax year.
 */
export function reconcileTaxEvidence(taxYear: string, allFacts: TaxFact[], documents: TaxDocument[] = []): ReconciledTaxEvidence {
  const deduplicated = deduplicateLinkedFacts(factsForTaxYear(normalisePensionFacts(allFacts).map(fact=>withEmployerIdentity(fact)), taxYear));
  const facts = deduplicated.facts;
  const documentIds = new Set(documents.filter(document => document.taxYear === taxYear).map(document => document.id));
  const result: TaxFact[] = [];
  const reconciled: ReconciledTaxEvidence["reconciled"] = [];
  const grouped = new Map<string, TaxFact[]>();
  for (const fact of facts) {
    const key = `${employerKey(fact)}|${fact.type}`;
    grouped.set(key, [...(grouped.get(key) ?? []), fact]);
  }
  for (const rows of grouped.values()) {
    const authoritative = rows.filter(fact => ["employment-taxable-pay", "income-tax-deducted"].includes(fact.type) && (fact.sourceType === "p60" || fact.sourceType === "p45") && ["verified", "high"].includes(fact.confidence) && (!fact.documentId || documentIds.has(fact.documentId)));
    if (!authoritative.length) { result.push(...rows); continue; }
    const preferred = [...authoritative].sort((a, b) => (b.sourceType === "p60" ? 1 : 0) - (a.sourceType === "p60" ? 1 : 0) || (b.date ?? "").localeCompare(a.date ?? ""))[0];
    const replaced = rows.filter(fact => fact.id !== preferred.id);
    result.push(preferred);
    const periodEvidence = replaced.filter(fact => fact.sourceType === "payslip");
    const comparison = periodEvidence.length ? sum(periodEvidence) : replaced[0]?.amount ?? preferred.amount;
    if (replaced.length) reconciled.push({ employer: preferred.employer || preferred.provider || "Unknown employer", type: preferred.type, preferred, replaced, difference: Math.round((preferred.amount - comparison) * 100) / 100 });
  }
  return { facts: result, reconciled, linked: deduplicated.linked };
}

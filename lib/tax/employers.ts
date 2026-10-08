import type { TaxFact } from "./types.ts";
import type { EmployerAlias } from "../types.ts";

export type TaxEmployer = EmployerAlias;
// Exact aliases only: removing arbitrary corporate words could merge unrelated businesses.
const nameKey = (name: string) => name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export function taxEmployer(name?: string, unknownId = "unidentified", aliases: readonly TaxEmployer[] = []): TaxEmployer {
  if (!name?.trim() || name === "Unknown employer") return { id: `unknown:${unknownId}`, displayName: "Unknown employer", aliases: [] };
  return aliases.find(employer => employer.aliases.some(alias => nameKey(alias) === nameKey(name)))
    ?? { id: `employer:${encodeURIComponent(nameKey(name))}`, displayName: name.trim(), aliases: [name.trim()] };
}
export function employerKey(fact: TaxFact, aliases: readonly TaxEmployer[] = []) {
  return fact.employerId ?? taxEmployer(fact.employer || fact.provider, fact.sourceId || fact.documentId || fact.id, aliases).id;
}
export function withEmployerIdentity(fact: TaxFact, aliases: readonly TaxEmployer[] = []): TaxFact {
  return fact.employer || fact.employerId || ["payslip", "p60", "p45"].includes(fact.sourceType) ? { ...fact, employerId: employerKey(fact,aliases) } : fact;
}
export function knownTaxEmployers(facts: TaxFact[], aliases: readonly TaxEmployer[] = []) {
  return [...new Map(facts.filter(fact => fact.employer && !employerKey(fact,aliases).startsWith("unknown:")).map(fact => [employerKey(fact,aliases), { id: employerKey(fact,aliases), displayName: fact.employer! }])).values()];
}

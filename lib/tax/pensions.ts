import type { TaxFact } from "./types.ts";
import { employerKey } from "./employers.ts";

/** Preserve every legacy fact as evidence, but supersede proven duplicate representations.
 * V1's "possible salary sacrifice" was generated without evidence: never promote it to confirmed treatment.
 */
export function normalisePensionFacts(facts: TaxFact[]): TaxFact[] {
  return facts.map(fact => {
    if (fact.type !== "employee-pension" && fact.type !== "salary-sacrifice") return fact;
    const duplicate = fact.type === "salary-sacrifice" && fact.sourceId ? facts.find(other =>
      other.id !== fact.id && ["employee-pension", "pension-contribution"].includes(other.type)
      && other.sourceId === fact.sourceId && other.taxYear === fact.taxYear && other.date === fact.date
      && employerKey(other) === employerKey(fact) && other.amount === fact.amount) : undefined;
    return {
      ...fact, type: "pension-contribution", treatment: fact.treatment ?? "unknown",
      status: duplicate && fact.status !== "ignored" ? "superseded" : fact.status,
      provenance: { ...fact.provenance, legacyType: fact.type, ...(duplicate ? { supersededBy: duplicate.id, migrationReason: "Same contribution represented twice in Tax V1" } : {}) },
    };
  });
}

import type { Store } from "../types.ts";
import { normalisePensionFacts } from "./pensions.ts";
import { withEmployerIdentity } from "./employers.ts";

/** Backwards-compatible, additive migration for existing local finance data. */
export function migrateTaxStore(store: Store): Store {
  const migrated = {
    ...store,
    taxDocuments: store.taxDocuments ?? [],
    taxFacts: normalisePensionFacts(store.taxFacts ?? []).map(fact=>withEmployerIdentity(fact,store.profile?.taxEmployers)),
    taxSchemaVersion: Math.max(store.taxSchemaVersion ?? 0, 2),
  };
  // Readiness is derived, not stored. Safely repair any experimental backup
  // that happened to persist the now-retired label.
  if ((migrated as Store & { taxReadiness?: string }).taxReadiness === "Complete") {
    (migrated as Store & { taxReadiness?: string }).taxReadiness = "Good";
  }
  return migrated;
}

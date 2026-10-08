import type { TaxFact } from "../../lib/tax/types.ts";
import type { ReconciledTaxEvidence } from "../../lib/tax/reconciliation.ts";

export default function TaxEvidenceAudit({ reconciliation, superseded, gbp }: {
  reconciliation: ReconciledTaxEvidence; superseded: TaxFact[]; gbp: Intl.NumberFormat;
}) {
  if (!reconciliation.reconciled.length && !reconciliation.linked.length && !superseded.length) return null;
  return <details className="panel tax-reconciliation"><summary>Reconciliation audit — superseded evidence</summary>
    {reconciliation.reconciled.map(item => <div key={item.preferred.id}>
      <h4>{item.employer} · {item.type === "income-tax-deducted" ? "PAYE" : "Taxable pay"}</h4>
      <p>Using {item.preferred.sourceType.toUpperCase()}: {gbp.format(item.preferred.amount)}. Earlier evidence is retained below and excluded from the total.</p>
      {item.replaced.map(fact => <p key={fact.id}>{fact.sourceType} · {fact.date} · {gbp.format(fact.amount)} · {fact.explanation}</p>)}
    </div>)}
    {reconciliation.linked.map(item => <div key={`linked-${item.preferred.id}`}>
      <h4>Linked evidence · counted once</h4>
      <p>Using {item.preferred.sourceType}: {gbp.format(item.preferred.amount)}. The matching source below is retained for provenance and excluded from the total.</p>
      {item.replaced.map(fact => <p key={fact.id}>{fact.sourceType} · {fact.date} · {gbp.format(fact.amount)} · {fact.explanation}</p>)}
    </div>)}
    {superseded.map(fact => <div key={fact.id}><h4>Legacy contribution evidence · excluded from totals</h4>
      <p>{fact.employer} · {fact.date} · {gbp.format(fact.amount)}</p>
      <p>{fact.explanation} {fact.provenance?.migrationReason} · Linked to {fact.provenance?.supersededBy}</p>
    </div>)}
  </details>;
}

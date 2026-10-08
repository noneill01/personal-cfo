"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import type { EmployerAlias, Store } from "../../lib/types.ts";
import { createP60Evidence, documentFingerprintExists, knownTaxEmployers, taxYearBounds, taxYearCompleted, type TaxFact } from "../../lib/tax/index.ts";

export default function TaxYearEnd({ taxYear, facts, setStore, documents, aliases }: {
  taxYear: string; facts: TaxFact[]; documents: NonNullable<Store["taxDocuments"]>; aliases: readonly EmployerAlias[]; setStore: Dispatch<SetStateAction<Store>>;
}) {
  const end = taxYearBounds(taxYear).end;
  const employers = knownTaxEmployers(facts.filter(fact => fact.taxYear === taxYear),aliases);
  const [employerChoice, setEmployerChoice] = useState(employers[0]?.displayName ?? "");
  const [draft, setDraft] = useState({ employer: "", taxablePay: "", taxPaid: "", notes: "" });
  const [notice, setNotice] = useState("");
  const employer = employerChoice || draft.employer.trim();
  const completed = taxYearCompleted(taxYear);
  const valid = completed && employer && draft.taxablePay.trim() !== "" && draft.taxPaid.trim() !== ""
    && Number.isFinite(Number(draft.taxablePay)) && Number(draft.taxablePay) >= 0
    && Number.isFinite(Number(draft.taxPaid));
  function save() {
    if (!valid) return;
    const evidence = createP60Evidence({ id: `tax-document-${crypto.randomUUID()}`, taxYear, employer, date: end,
      taxablePay: Number(draft.taxablePay), taxPaid: Number(draft.taxPaid), notes: draft.notes, importedAt: new Date().toISOString(),employerAliases:aliases });
    if (documentFingerprintExists(documents, evidence.document.fingerprint,aliases)) { setNotice("That P60 is already recorded."); return; }
    setStore(current => ({ ...current, taxDocuments: [...(current.taxDocuments ?? []), evidence.document], taxFacts: [...(current.taxFacts ?? []), ...evidence.facts], taxSchemaVersion: 2, updatedAt: new Date().toISOString().slice(0, 10) }));
    setNotice("P60 saved. This employer's PAYE totals are now reconciled.");
    setDraft({ employer: "", taxablePay: "", taxPaid: "", notes: "" });
  }
  return <article className="panel tax-entry">
    <span className="insight-label">YEAR-END RECONCILIATION</span><h3>{completed ? "Add confirmed P60 totals" : "P60 available after year end"}</h3>
    {!completed ? <p>Add your P60 after the tax year ends on {new Date(end + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Use payslip evidence while the year is in progress.</p>
      : <><p>A P60 replaces accumulated payslip totals for the same employer and tax year; it never adds them together. Enter this employment’s pay and tax, excluding previous employment.</p>
        <div className="tax-form-grid">
          <label>Employer<select value={employerChoice} onChange={event => setEmployerChoice(event.target.value)}>{employers.map(item => <option key={item.id} value={item.displayName}>{item.displayName}</option>)}<option value="">Other employer</option></select></label>
          {!employerChoice && <label>Employer name<input value={draft.employer} onChange={event => setDraft(value => ({ ...value, employer: event.target.value }))}/></label>}
          <label>Tax year ending<input type="date" value={end} readOnly/></label>
          <label>Taxable pay — this employment<input type="number" min="0" step="0.01" value={draft.taxablePay} onChange={event => setDraft(value => ({ ...value, taxablePay: event.target.value }))}/></label>
          <label>Tax deducted — this employment<input type="number" step="0.01" value={draft.taxPaid} onChange={event => setDraft(value => ({ ...value, taxPaid: event.target.value }))}/></label>
          <label className="wide">Notes<input value={draft.notes} onChange={event => setDraft(value => ({ ...value, notes: event.target.value }))}/></label>
          <button className="primary" disabled={!valid} onClick={save}>Save P60 evidence</button>
        </div></>}
    {notice && <p role="status">{notice}</p>}
  </article>;
}

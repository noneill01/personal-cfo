"use client";
import { useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import type { EmployerAlias, Store } from "../../lib/types.ts";
import { createP45Evidence, documentFingerprintExists, knownTaxEmployers, parseP45File, taxYearBounds, taxYearForDate, type TaxFact } from "../../lib/tax/index.ts";

export default function TaxEmploymentEnd({ taxYear, facts, documents, setStore, aliases }: {
  taxYear: string; facts: TaxFact[]; documents: NonNullable<Store["taxDocuments"]>; aliases: readonly EmployerAlias[]; setStore: Dispatch<SetStateAction<Store>>;
}) {
  const employers = knownTaxEmployers(facts.filter(fact => fact.taxYear === taxYear),aliases);
  const [employerChoice, setEmployerChoice] = useState(employers[0]?.displayName ?? "");
  const [draft, setDraft] = useState({ employer: "", leavingDate: "", taxablePay: "", taxPaid: "", taxCode: "", payeReference: "" });
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const employer = employerChoice || draft.employer.trim();
  const { start, end } = taxYearBounds(taxYear);
  const valid = Boolean(employer && draft.leavingDate && taxYearForDate(draft.leavingDate) === taxYear
    && draft.taxablePay.trim() !== "" && Number.isFinite(Number(draft.taxablePay)) && Number(draft.taxablePay) >= 0
    && draft.taxPaid.trim() !== "" && Number.isFinite(Number(draft.taxPaid)));
  function save() {
    if (!valid) return;
    const evidence = createP45Evidence({ id: `tax-document-${crypto.randomUUID()}`, fileName: uploadRef.current?.dataset.fileName, taxYear, employer, leavingDate: draft.leavingDate,
      taxablePay: Number(draft.taxablePay), taxPaid: Number(draft.taxPaid), taxCode: draft.taxCode.trim() || undefined,
      payeReference: draft.payeReference.trim() || undefined, importedAt: new Date().toISOString(),employerAliases:aliases });
    if (documentFingerprintExists(documents, evidence.document.fingerprint,aliases)) { setNotice("That P45 is already recorded."); return; }
    setStore(current => ({ ...current, taxDocuments: [...(current.taxDocuments ?? []), evidence.document], taxFacts: [...(current.taxFacts ?? []), ...evidence.facts], taxSchemaVersion: 2, updatedAt: new Date().toISOString().slice(0, 10) }));
    setNotice("P45 saved. This ended employment is now reconciled without adding a second copy of its pay.");
    setDraft({ employer: "", leavingDate: "", taxablePay: "", taxPaid: "", taxCode: "", payeReference: "" });
    if (uploadRef.current) { uploadRef.current.value = ""; delete uploadRef.current.dataset.fileName; }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setNotice("");
    try {
      const extracted = await parseP45File(file);
      setDraft(current => ({ ...current, employer: extracted.employer || current.employer, leavingDate: extracted.leavingDate || current.leavingDate,
        taxablePay: extracted.taxablePay === undefined ? current.taxablePay : String(extracted.taxablePay), taxPaid: extracted.taxPaid === undefined ? current.taxPaid : String(extracted.taxPaid),
        taxCode: extracted.taxCode || current.taxCode, payeReference: extracted.payeReference || current.payeReference }));
      setEmployerChoice("");
      event.target.dataset.fileName = file.name;
      const extractedTaxYear = extracted.leavingDate ? taxYearForDate(extracted.leavingDate) : undefined;
      const yearMismatch = extractedTaxYear !== undefined && extractedTaxYear !== taxYear;
      setNotice(yearMismatch ? `P45 read. Its leaving date belongs to ${extractedTaxYear}; select that tax year before saving.` : extracted.warnings.length ? `P45 partially read: ${extracted.warnings.join(" ")} Review the pre-filled figures before saving.` : "P45 read. Review the pre-filled figures before saving.");
    } catch (error) {
      setNotice(`I could not read that P45 (${error instanceof Error ? error.message : "unknown error"}). Enter the figures below; nothing has been added.`);
    } finally { setUploading(false); }
  }
  return <article className="panel tax-entry">
    <span className="insight-label">ENDED EMPLOYMENT</span><h3>Add confirmed P45 totals</h3>
    <p>A P45 replaces accumulated payslip totals only for this employer. Other employments remain separate. Uploading fills the form only; you confirm every figure before it is saved.</p>
    <input ref={uploadRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" aria-label="Upload P45 PDF" onChange={upload}/>
    <button className="secondary" type="button" onClick={() => uploadRef.current?.click()} disabled={uploading}>{uploading ? "Reading P45…" : "Upload P45 PDF"}</button>
    <div className="tax-form-grid">
      <label>Employer<select value={employerChoice} onChange={event => setEmployerChoice(event.target.value)}>{employers.map(item => <option key={item.id} value={item.displayName}>{item.displayName}</option>)}<option value="">Other employer</option></select></label>
      {!employerChoice && <label>Employer name<input value={draft.employer} onChange={event => setDraft(value => ({ ...value, employer: event.target.value }))}/></label>}
      <label>Leaving date<input type="date" min={start} max={end} value={draft.leavingDate} onChange={event => setDraft(value => ({ ...value, leavingDate: event.target.value }))}/></label>
      <label>Taxable pay — this employment<input type="number" min="0" step="0.01" value={draft.taxablePay} onChange={event => setDraft(value => ({ ...value, taxablePay: event.target.value }))}/></label>
      <label>PAYE deducted — this employment<input type="number" step="0.01" value={draft.taxPaid} onChange={event => setDraft(value => ({ ...value, taxPaid: event.target.value }))}/></label>
      <label>Tax code<input value={draft.taxCode} onChange={event => setDraft(value => ({ ...value, taxCode: event.target.value }))} placeholder="Optional"/></label>
      <label>Employer PAYE reference<input value={draft.payeReference} onChange={event => setDraft(value => ({ ...value, payeReference: event.target.value }))} placeholder="Optional"/></label>
      <button className="primary" disabled={!valid} onClick={save}>Save P45 evidence</button>
    </div>
    {notice && <p role="status">{notice}</p>}
  </article>;
}

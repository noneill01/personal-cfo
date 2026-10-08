"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Store } from "../lib/types.ts";
import { currentTaxYear, isTrackedTaxYear, matchingRentalTransactions, taxYearCompleted, taxYearForDate, taxYearLabel, type PensionTaxTreatment, type TaxDocument, type TaxFact, type TaxFactType } from "../lib/tax/index.ts";
import { taxOverview } from "../lib/tax/overview.ts";
import TaxYearEnd from "./tax/TaxYearEnd.tsx";
import TaxEmployments from "./tax/TaxEmployments.tsx";
import TaxEvidenceAudit from "./tax/TaxEvidenceAudit.tsx";
import TaxEmploymentEnd from "./tax/TaxEmploymentEnd.tsx";

type ManualDraft = { type: TaxFactType; amount: string; date: string; provider: string; explanation: string; treatment: PensionTaxTreatment; rentalDisposition: "" | "link" | "separate"; linkedTransactionId: string };
const manualOptions: Array<{ value: TaxFactType; label: string; note: string }> = [
  { value: "savings-interest", label: "Savings interest", note: "Evidence only; detailed savings tax is not estimated in V1." },
  { value: "dividend-income", label: "Dividend income", note: "Evidence only; dividend tax is not estimated in V1." },
  { value: "rental-income", label: "Rental income", note: "Adds to property evidence." },
  { value: "rental-expense", label: "Confirmed rental expense", note: "Use only once you are comfortable it is allowable." },
  { value: "vct-subscription", label: "VCT subscription", note: "Tracked as evidence; relief is not assumed." },
  { value: "vct-relief", label: "VCT relief confirmed", note: "Reduces the displayed estimated balance, not taxable income." },
  { value: "self-assessment-payment", label: "Self Assessment payment", note: "Tracks tax already paid." },
  { value: "other-taxable-income", label: "Other taxable income", note: "Included in the UK-main-rates estimate." },
  { value: "pension-contribution", label: "Pension contribution", note: "Visible as evidence; tax treatment requires review." },
];
const blankManual = (date = new Date().toISOString().slice(0, 10)): ManualDraft => ({ type: "savings-interest", amount: "", date, provider: "", explanation: "", treatment: "unknown", rentalDisposition: "", linkedTransactionId: "" });
const sourceLabel = (value: TaxFact["sourceType"]) => value === "manual" ? "Manual" : value === "p60" ? "P60" : value === "p45" ? "P45" : value === "payslip" ? "Payslip" : value === "transaction" ? "Bank transaction" : value;
const confidenceLabel = (value: TaxFact["confidence"]) => value === "verified" ? "Verified" : value === "high" ? "High confidence" : value === "medium" ? "Needs review" : "Low confidence";

export default function Tax({ store, setStore, gbp }: { store: Store; setStore: Dispatch<SetStateAction<Store>>; gbp: Intl.NumberFormat }) {
  const [taxYear, setTaxYear] = useState(currentTaxYear());
  const { facts, activeFacts, years, activeTaxYear, position, documents, reconciliation, superseded } = useMemo(() => taxOverview(store, taxYear), [store, taxYear]);
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);
  const [manual, setManual] = useState<ManualDraft>(() => blankManual());
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [entryNotice, setEntryNotice] = useState("");
  const manualFacts = (store.taxFacts ?? []).filter(fact => fact.taxYear === activeTaxYear && fact.sourceType === "manual" && fact.status !== "superseded");
  const rentalCandidates = manual.type === "rental-income" && manual.amount.trim() !== "" && Number.isFinite(Number(manual.amount))
    ? matchingRentalTransactions({ date: manual.date, amount: Number(manual.amount) }, facts) : [];

  function saveManualFact() {
    const amount = Number(manual.amount);
    if (!manual.date || manual.amount.trim() === "" || !Number.isFinite(amount) || amount < 0) return;
    if (!isTrackedTaxYear(taxYearForDate(manual.date))) { setEntryNotice("Tax tracking starts on 6 April 2026. Choose a date in a supported year."); return; }
    const now = new Date().toISOString();
    const existing = (store.taxFacts ?? []).find(item => item.id === editingFactId);
    if (manual.type === "rental-income" && rentalCandidates.length && !manual.rentalDisposition) { setEntryNotice("Choose whether the matching bank receipt is this same rental payment or a separate payment."); return; }
    const linkedTransactionIds = manual.type === "rental-income" && manual.rentalDisposition === "link" && manual.linkedTransactionId ? [manual.linkedTransactionId] : undefined;
    const fact: TaxFact = { ...existing, id: editingFactId || `tax-manual-${Date.now()}`, taxYear: taxYearForDate(manual.date), type: manual.type, amount: Math.round(amount * 100) / 100, date: manual.date, sourceType: "manual", confidence: "medium", status: "active", provider: manual.provider.trim() || undefined, explanation: manual.explanation.trim() || "Manual tax fact.", treatment: manual.type === "pension-contribution" ? manual.treatment : undefined, linkedTransactionIds, provenance: { ...existing?.provenance, enteredAt: now, separateEconomicEvent: manual.type === "rental-income" ? manual.rentalDisposition === "separate" : undefined } };
    setStore(current => ({ ...current, taxFacts: editingFactId ? (current.taxFacts ?? []).map(item => item.id === editingFactId ? fact : item) : [...(current.taxFacts ?? []), fact], taxSchemaVersion: 2, updatedAt: now.slice(0, 10) }));
    setTaxYear(fact.taxYear); setEditingFactId(null); setManual(blankManual());
    setEntryNotice(editingFactId ? "Manual tax fact updated locally." : "Manual tax fact added locally.");
  }

  function editManualFact(fact: TaxFact) { setEditingFactId(fact.id); setManual({ type: fact.type, amount: String(fact.amount), date: fact.date || new Date().toISOString().slice(0, 10), provider: fact.provider || "", explanation: fact.explanation || "", treatment: fact.treatment ?? "unknown", rentalDisposition: fact.linkedTransactionIds?.length ? "link" : fact.provenance?.separateEconomicEvent === true ? "separate" : "", linkedTransactionId: fact.linkedTransactionIds?.[0] ?? "" }); }
  function removeManualFact(id: string) { setStore(current => ({ ...current, taxFacts: (current.taxFacts ?? []).filter(fact => fact.id !== id), updatedAt: new Date().toISOString().slice(0, 10) })); if (editingFactId === id) { setEditingFactId(null); setManual(blankManual()); } }
  function removeDocument(document: TaxDocument) { setStore(current => ({ ...current, taxDocuments: (current.taxDocuments ?? []).filter(item => item.id !== document.id), taxFacts: (current.taxFacts ?? []).filter(fact => fact.documentId !== document.id), updatedAt: new Date().toISOString().slice(0, 10) })); }

  const estimatedBalance = position.estimatedBalance;
  const evidenceFor = (label: string) => position.evidence.find(item => item.label === label)?.facts ?? [];
  const employmentEvidence = evidenceFor("Employment");
  const pensionEvidence = evidenceFor("Pension contributions");
  const rentalEvidence = evidenceFor("Rental income");
  const payeEvidence = evidenceFor("PAYE tax paid");
  return <section className="tax-screen">
    <section className="tax-hero panel">
      <div><span className="insight-label">ESTIMATED TAX POSITION</span><h2>Tax — {activeTaxYear}</h2><p>{taxYearCompleted(activeTaxYear) ? "Completed tax year" : activeTaxYear === currentTaxYear() ? "Current tax year" : "Upcoming tax year"} · {taxYearLabel(activeTaxYear)}. Figures reflect recorded evidence.</p></div>
      <label className="tax-year-picker"><span>Tax year</span><select value={activeTaxYear} onChange={event => setTaxYear(event.target.value)}>{years.map(year => <option key={year} value={year}>{year} · {taxYearLabel(year)}</option>)}</select></label>
      <span className={`tax-readiness status-${position.readiness.status.toLowerCase().replace(/\s+/g, "-")}`}>{position.readiness.status}</span>
    </section>

    <section className="tax-position-grid" aria-label="Estimated tax position">
      {position.taxYearStatus === "open" ? <>
        <article><span>Taxable pay YTD</span><strong>{employmentEvidence.length ? gbp.format(position.income.employment) : "No evidence"}</strong><small>Recorded employment taxable pay so far</small></article>
        <article><span>PAYE paid YTD</span><strong>{position.hasTaxPaidEvidence ? gbp.format(position.taxPaid.paye) : "No evidence"}</strong><small>PAYE deducted so far</small></article>
        <article className="neutral"><span>Estimated full-year liability</span><strong>Not yet projected</strong><small>No annual projection is inferred from partial-year evidence</small></article>
      </> : <>
        <article><span>Taxable income</span><strong>{position.taxableIncome === undefined ? "Incomplete" : gbp.format(position.taxableIncome)}</strong><small>Known income after the personal allowance</small></article>
        <article><span>Tax already paid</span><strong>{position.hasTaxPaidEvidence ? gbp.format(position.taxPaid.total) : "Incomplete"}</strong><small>PAYE and recorded Self Assessment payments</small></article>
        <article><span>Estimated liability</span><strong>{position.estimatedLiability === undefined ? "Incomplete" : gbp.format(position.estimatedLiability)}</strong><small>UK main income-tax rates only</small></article>
        <article className={estimatedBalance === undefined ? "neutral" : estimatedBalance > 0 ? "due" : "overpaid"}><span>Estimated balance</span><strong>{estimatedBalance === undefined ? "Incomplete" : `${estimatedBalance > 0 ? "Potentially due " : estimatedBalance < 0 ? "Potential overpayment " : ""}${gbp.format(Math.abs(estimatedBalance))}`}</strong><small>{position.calculationStatus === "partial" ? "Partial estimate — review exclusions" : "Estimate after recorded tax paid"}</small></article>
      </>}
    </section>
    <p className="tax-calculation-note"><b>{position.calculationStatus === "estimated" ? "Estimate available." : position.calculationStatus === "partial" ? "Partial estimate." : "Annual estimate unavailable."}</b> {position.calculationNote}</p>

    <section className="tax-layout">
      <div className="tax-main">
        <TaxEmployments position={position} gbp={gbp}/>
        <article className="panel tax-income-panel"><div className="panel-head"><div><span className="insight-label">INCOME & TAX PAID</span><h3>What the estimate is built from</h3><p>Click a row to see each supporting fact and source.</p></div></div>
          <div className="tax-evidence-rows">{[
            ["Employment", position.income.employment, employmentEvidence],
            ["Pension contributions", position.adjustments.pensions, pensionEvidence],
            ["Rental property", position.income.property, rentalEvidence],
            ["Savings interest", position.income.savings, activeFacts.filter(fact => fact.taxYear === activeTaxYear && fact.type === "savings-interest")],
            ["Dividends", position.income.dividends, activeFacts.filter(fact => fact.taxYear === activeTaxYear && fact.type === "dividend-income")],
            ["Other taxable income", position.income.other, activeFacts.filter(fact => fact.taxYear === activeTaxYear && fact.type === "other-taxable-income")],
            ["PAYE tax paid", position.taxPaid.paye, payeEvidence],
          ].map(([label, amount, evidence]) => <div className="tax-evidence-row" key={label as string}><button onClick={() => setOpenEvidence(openEvidence === label ? null : label as string)} aria-expanded={openEvidence === label}><span><b>{label as string}</b><small>{(evidence as TaxFact[]).length ? `${(evidence as TaxFact[]).length} evidence item${(evidence as TaxFact[]).length === 1 ? "" : "s"}` : "No evidence recorded"}</small></span><strong>{(evidence as TaxFact[]).length ? gbp.format(amount as number) : "—"}</strong><i>{openEvidence === label ? "−" : "+"}</i></button>{openEvidence === label && <div className="tax-evidence-detail">{(evidence as TaxFact[]).length ? (evidence as TaxFact[]).map(fact => <div key={fact.id}><span><b>{sourceLabel(fact.sourceType)}</b> · {confidenceLabel(fact.confidence)}{fact.date ? ` · ${new Date(`${fact.date}T12:00:00`).toLocaleDateString("en-GB")}` : ""}</span><strong>{gbp.format(fact.amount)}</strong><small>{fact.employer ? `${fact.employer} · ` : ""}{fact.explanation || "No explanation recorded."}{fact.treatment ? ` Treatment: ${fact.treatment === "unknown" ? "Needs review" : fact.treatment}.` : ""}</small></div>) : <span>Nothing has been recorded for this category yet.</span>}</div>}</div>)}
          </div>
        </article>

        <article className="panel tax-evidence-panel"><div className="panel-head"><div><span className="insight-label">EVIDENCE</span><h3>Documents and imports</h3><p>Original PDFs are not stored in the app. Only private local metadata and confirmed figures are saved.</p></div></div>
          <div className="tax-document-list">{documents.length ? documents.map(document => <div className="tax-document-row" key={document.id}><span className={`tax-document-icon ${document.type}`}>{document.type.toUpperCase()}</span><div><strong>{document.title}</strong><small>{document.provider || "Provider not recorded"}{document.date ? ` · ${new Date(`${document.date}T12:00:00`).toLocaleDateString("en-GB")}` : ""}{document.fileName ? ` · ${document.fileName}` : ""}</small></div><b className={["p60", "p45"].includes(document.type) ? "verified" : "high"}>{["p60", "p45"].includes(document.type) ? "Verified" : "Processed"}</b>{document.type !== "payslip" && <button className="text-button" onClick={() => removeDocument(document)}>Remove</button>}</div>) : <div className="empty-state"><strong>No tax evidence for this year yet.</strong><span>Your existing payslips will appear here automatically once their dates fall in this tax year.</span></div>}</div>
        </article>
      </div>

      <aside className="tax-side">
        <article className="panel tax-readiness-panel"><span className="insight-label">DATA READINESS</span><h3>{position.readiness.status}</h3><p>{position.readiness.summary}</p><div>{position.readiness.checks.map(check => <div className={`tax-check ${check.status}`} key={check.label}><i>{check.status === "complete" ? "✓" : check.status === "partial" ? "◐" : "—"}</i><span><b>{check.label}</b><small>{check.detail}</small></span></div>)}</div></article>
        <article className="panel tax-issues-panel"><span className="insight-label">WHAT NEEDS ATTENTION</span><h3>{position.issues.length ? `${position.issues.length} item${position.issues.length === 1 ? "" : "s"}` : "Nothing urgent"}</h3>{position.issues.length ? <ul>{position.issues.map(issue => <li className={issue.severity} key={issue.id}><b>{issue.title}</b><span>{issue.explanation}</span>{issue.action && <small>{issue.action}</small>}</li>)}</ul> : <p>Keep importing evidence as it arrives, then review this position before using it for a return.</p>}</article>
      </aside>
    </section>

    <TaxEvidenceAudit reconciliation={reconciliation} superseded={superseded} gbp={gbp}/>
    <section className="tax-entry-grid">
      <TaxYearEnd key={activeTaxYear} taxYear={activeTaxYear} facts={facts} documents={store.taxDocuments ?? []} aliases={store.profile?.taxEmployers??[]} setStore={setStore}/>
      <TaxEmploymentEnd key={`p45-${activeTaxYear}`} taxYear={activeTaxYear} facts={facts} documents={store.taxDocuments ?? []} aliases={store.profile?.taxEmployers??[]} setStore={setStore}/>
      <article className="panel tax-entry"><span className="insight-label">MANUAL EVIDENCE</span><h3>{editingFactId ? "Edit manual fact" : "Add a tax fact"}</h3><p>Manual entries always remain labelled as manual and can be changed or removed.</p>
        <div className="tax-form-grid">
          <label>Type<select value={manual.type} onChange={event => setManual(value => ({ ...value, type: event.target.value as TaxFactType, rentalDisposition: "", linkedTransactionId: "" }))}>{manualOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Date<input type="date" value={manual.date} onChange={event => setManual(value => ({ ...value, date: event.target.value, rentalDisposition: "", linkedTransactionId: "" }))}/></label>
          <label>Amount<input type="number" min="0" step="0.01" value={manual.amount} onChange={event => setManual(value => ({ ...value, amount: event.target.value, rentalDisposition: "", linkedTransactionId: "" }))}/></label>
          <label>Provider<input value={manual.provider} onChange={event => setManual(value => ({ ...value, provider: event.target.value }))} placeholder="Optional"/></label>
          {manual.type === "pension-contribution" && <label>Pension treatment<select value={manual.treatment} onChange={event => setManual(value => ({ ...value, treatment: event.target.value as PensionTaxTreatment }))}><option value="unknown">Unknown — needs review</option><option value="salary-sacrifice">Salary sacrifice</option><option value="net-pay">Net pay</option><option value="relief-at-source">Relief at source</option></select></label>}
          {manual.type === "rental-income" && rentalCandidates.length > 0 && <fieldset className="wide"><legend>Matching bank receipt found</legend>
            <p>{rentalCandidates.map(candidate => `${candidate.date} · ${gbp.format(candidate.amount)} · ${candidate.provider || "Bank transaction"}`).join("; ")}</p>
            <label><input type="radio" name="rental-match" checked={manual.rentalDisposition === "link"} onChange={() => setManual(value => ({ ...value, rentalDisposition: "link", linkedTransactionId: rentalCandidates[0].linkedTransactionIds?.[0] ?? "" }))}/>Same payment — link and count once</label>
            <label><input type="radio" name="rental-match" checked={manual.rentalDisposition === "separate"} onChange={() => setManual(value => ({ ...value, rentalDisposition: "separate", linkedTransactionId: "" }))}/>Separate payment — count both</label>
          </fieldset>}
          <label className="wide">Why / source<input value={manual.explanation} onChange={event => setManual(value => ({ ...value, explanation: event.target.value }))} placeholder={manualOptions.find(option => option.value === manual.type)?.note}/></label>
          <button className="primary" onClick={saveManualFact} disabled={!manual.amount || !manual.date}>{editingFactId ? "Save change" : "Add evidence"}</button>{editingFactId && <button className="ghost" onClick={() => { setEditingFactId(null); setManual(blankManual()); }}>Cancel</button>}
        </div>
        {manualFacts.length > 0 && <div className="tax-manual-list">{manualFacts.map(fact => <div key={fact.id}><span><b>{manualOptions.find(option => option.value === fact.type)?.label || fact.type}</b><small>{fact.date} · {fact.provider || "Manual source"}</small></span><strong>{gbp.format(fact.amount)}</strong><button className="text-button" onClick={() => editManualFact(fact)}>Edit</button><button className="text-button danger" onClick={() => removeManualFact(fact.id)}>Remove</button></div>)}</div>}
      </article>
    </section>
    {entryNotice && <div className="tax-entry-notice" role="status">{entryNotice}</div>}
  </section>;
}

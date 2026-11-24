"use client";

import type { Dispatch, SetStateAction } from "react";
import type { PayslipDraft, RegionalConfig } from "../lib/types";
import { normaliseRegion } from "../lib/region";

type PayslipFormProps = {
  draft: PayslipDraft;
  setDraft: Dispatch<SetStateAction<PayslipDraft | null>>;
  onSave: () => void;
  onCancel: () => void;
  region?: RegionalConfig;
  ukTaxEnabled: boolean;
};

export default function PayslipForm({ draft, setDraft, onSave, onCancel, region, ukTaxEnabled }: PayslipFormProps) {
  const { currency } = normaliseRegion(region);
  const patch = (values: Partial<PayslipDraft>) => setDraft(current => current && ({ ...current, ...values }));
  return <div className="manual-payslip">
    <div className="manual-payslip-head">
      <div><span className="insight-label">RELIABLE FALLBACK</span><h4>Enter the payslip totals</h4><p>Use current-period figures except in the explicitly labelled YTD fields. Saving replaces the same employer’s record on that pay date. Leave optional tax fields blank if they are not shown.</p></div>
      <button className="text-button" onClick={onCancel}>Cancel</button>
    </div>
    <div className="manual-payslip-grid">
      <label>Employer<input value={draft.employer ?? ""} onChange={event => patch({ employer: event.target.value })}/></label>
      {ukTaxEnabled && (["taxablePay", "ytdTaxablePay", "ytdTaxPaid"] as const).map((field, index) => <label key={field}>{[`Taxable pay — this period (${currency})`, `Taxable pay YTD — this employment (${currency})`, `PAYE tax YTD — this employment (${currency})`][index]}<input inputMode="decimal" value={draft[field] ?? ""} onChange={event => patch({ [field]: event.target.value })}/></label>)}
      {ukTaxEnabled && <label>Pension tax treatment<select value={draft.pensionTaxTreatment ?? "unknown"} onChange={event => patch({ pensionTaxTreatment: event.target.value as PayslipDraft["pensionTaxTreatment"] })}><option value="unknown">Unknown — needs review</option><option value="salary-sacrifice">Salary sacrifice</option><option value="net-pay">Net pay</option><option value="relief-at-source">Relief at source</option></select></label>}
      <label>Pay date<input type="date" value={draft.payDate} onChange={event => patch({ payDate: event.target.value })}/></label>
      <label>Gross salary ({currency})<input inputMode="decimal" placeholder="5000.00" value={draft.salary} onChange={event => patch({ salary: event.target.value })}/></label>
      <label>Total earnings ({currency})<input inputMode="decimal" placeholder="4750.00" value={draft.cashEarnings} onChange={event => patch({ cashEarnings: event.target.value })}/></label>
      <label>{ukTaxEnabled ? `PAYE tax (${currency})` : `Tax deducted (${currency})`}<input inputMode="decimal" value={draft.tax} onChange={event => patch({ tax: event.target.value })}/></label>
      <label>National Insurance ({currency})<input inputMode="decimal" value={draft.ni} onChange={event => patch({ ni: event.target.value })}/></label>
      <label>Net pay ({currency})<input inputMode="decimal" value={draft.netPay} onChange={event => patch({ netPay: event.target.value })}/></label>
      <label>Employee pension ({currency})<input inputMode="decimal" value={draft.employeePension} onChange={event => patch({ employeePension: event.target.value })}/></label>
      <label>Employer pension ({currency})<input inputMode="decimal" value={draft.employerPension} onChange={event => patch({ employerPension: event.target.value })}/></label>
      <label>Annual leave payout ({currency})<input inputMode="decimal" value={draft.annualLeavePayout} onChange={event => patch({ annualLeavePayout: event.target.value })}/></label>
      {ukTaxEnabled && <label>Tax code<input placeholder="e.g. 2461T" value={draft.taxCode} onChange={event => patch({ taxCode: event.target.value })}/></label>}
    </div>
    <button className="primary manual-payslip-save" onClick={onSave}>Save payslip</button>
  </div>;
}

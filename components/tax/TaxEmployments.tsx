import type { TaxPosition } from "../../lib/tax/index.ts";

export default function TaxEmployments({ position, gbp }: { position: TaxPosition; gbp: Intl.NumberFormat }) {
  return <article className="panel tax-employments"><span className="insight-label">EMPLOYMENT EVIDENCE</span><h3>Each employer, separately reconciled</h3>
    {position.readiness.employments.length ? position.readiness.employments.map(item => <div className="tax-employment" key={item.employerId}>
      <div><strong>{item.employer}</strong><span className={item.status}>{item.detail}</span></div>
      <dl><div><dt>Taxable pay recorded</dt><dd>{item.taxablePay === undefined ? "Missing" : gbp.format(item.taxablePay)}</dd></div>
        <div><dt>PAYE paid recorded</dt><dd>{item.taxPaid === undefined ? "Missing" : gbp.format(item.taxPaid)}</dd></div></dl>
    </div>) : <p>Add a payslip to start tracking employment income.</p>}
  </article>;
}

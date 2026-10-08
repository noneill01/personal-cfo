import type { Tx } from "../lib/types";
import { spendingBreakdown } from "../lib/review";

export default function SpendingSummary({ transactions }: { transactions: Tx[] }) {
  const amounts = spendingBreakdown(transactions);
  const money = new Intl.NumberFormat("en-GB", {style:"currency",currency:"GBP",maximumFractionDigits:0});
  const rows = [["Recurring payments", amounts.recurring], ["Normal variable spending", amounts.variable], ["Planned one-offs", amounts.planned], ["Unplanned one-offs", amounts.unplanned]] as const;
  return <div className="spending-summary" aria-label="Personal spending breakdown">
    <div className="spending-summary-total"><span>Total personal spending</span><strong>{money.format(amounts.personal)}</strong></div>
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money.format(value)}</dd></div>)}</dl>
    <p>Separately tracked: <b>{money.format(amounts.business)}</b> reimbursable work expenses and <b>{money.format(amounts.excluded)}</b> transfers, savings movements and card repayments. These are excluded from personal spending.</p>
  </div>;
}

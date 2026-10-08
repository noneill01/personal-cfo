"use client";
import type { PendingImport, RegionalConfig } from "../lib/types";
import { DEFAULT_REGION, regionalFormatters } from "../lib/region";
export default function ImportPreview({pendingImport,onCancel,onConfirm,region}:{pendingImport:PendingImport;onCancel:()=>void;onConfirm:()=>void;region?:RegionalConfig}){
  const regional=regionalFormatters({region:region??DEFAULT_REGION});
  return <div className="detail-backdrop" role="presentation"><section className="import-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="import-preview-title">
    <button className="detail-close" aria-label="Cancel import" onClick={onCancel}>×</button>
    <span className="insight-label">CHECK BEFORE COMMITTING</span><h2 id="import-preview-title">{pendingImport.source} import preview</h2><p>{pendingImport.file.name}</p>
    <div className="import-preview-summary"><div><span>New transactions</span><strong>{pendingImport.added}</strong></div><div><span>Duplicates skipped</span><strong>{pendingImport.skipped}</strong></div><div><span>Manual entries reconciled</span><strong>{pendingImport.reconciled}</strong></div><div><span>Rejected rows</span><strong>{pendingImport.rejected}</strong></div><div><span>Categories to review</span><strong>{pendingImport.needsReview}</strong></div></div>
    {(pendingImport.effectPreview??[]).map((effect,index)=><div className="import-statement-summary" key={index}><span>{effect.title}</span><strong>{effect.value}</strong><small>{effect.note}</small></div>)}
    {pendingImport.preview.length?<div className="table-wrap"><table><caption>First {pendingImport.preview.length} new transactions</caption><thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Amount</th></tr></thead><tbody>{pendingImport.preview.map(transaction=><tr key={transaction.id}><td>{regional.formatDate(transaction.date)}</td><td>{transaction.merchant}</td><td>{transaction.category} › {transaction.subcategory}</td><td className="amount">{regional.moneyExact.format(transaction.amount)}</td></tr>)}</tbody></table></div>:<div className="empty-state"><strong>Everything in this file is already present</strong><span>No transactions will be added.</span></div>}
    {pendingImport.issues.length>0&&<details className="import-issues"><summary>View {pendingImport.rejected} rejected row{pendingImport.rejected===1?"":"s"}</summary><ul>{pendingImport.issues.map(issue=><li key={issue}>{issue}</li>)}</ul></details>}
    <p className="import-guidance">A backup will download before import. Review the result, then use Undo last import if needed.</p>{(pendingImport.warnings??[]).map((warning,index)=><p className="import-warning" role="alert" key={index}>{pendingImport.rejected>0?`${pendingImport.rejected} rows will not be imported. `:""}{warning}</p>)}
    <div className="dialog-actions"><button className="ghost" onClick={onCancel}>Cancel</button><button className="primary" disabled={!pendingImport.added&&!pendingImport.providerMetadata?.cardStatement} onClick={onConfirm}>Confirm import</button></div>
  </section></div>;
}

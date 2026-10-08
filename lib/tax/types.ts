/**
 * Tax evidence is deliberately separate from the calculation.  It records
 * what the app knows, where it came from and how trustworthy it is; a future
 * calculation can therefore be improved without rewriting the evidence.
 */
export type TaxYearId = string;
export type TaxDocumentType = "p60" | "p45" | "p11d" | "payslip" | "pension" | "rsu" | "bank-interest" | "rental" | "vct" | "eis" | "hmrc" | "other";
export type TaxEvidenceSource = "payslip" | "p60" | "p45" | "p11d" | "pension" | "rsu" | "bank-interest" | "rental" | "vct" | "eis" | "hmrc" | "transaction" | "manual";
export type EvidenceConfidence = "verified" | "high" | "medium" | "low";
export type TaxFactStatus = "active" | "superseded" | "reconciled" | "ignored";
export type PensionTaxTreatment = "salary-sacrifice" | "net-pay" | "relief-at-source" | "unknown";
export type TaxFactType =
  | "employment-taxable-pay"
  | "employment-gross-pay"
  | "income-tax-deducted"
  | "employee-ni"
  | "employee-pension"
  | "pension-contribution"
  | "employer-pension"
  | "salary-sacrifice"
  | "taxable-benefit"
  | "rental-income"
  | "rental-expense"
  | "rental-expense-uncertain"
  | "savings-interest"
  | "dividend-income"
  | "rsu-taxable-income"
  | "capital-gain"
  | "vct-subscription"
  | "vct-relief"
  | "self-assessment-payment"
  | "other-taxable-income";

export type TaxDocument = {
  id: string;
  type: TaxDocumentType;
  title: string;
  fileName?: string;
  taxYear: TaxYearId;
  provider?: string;
  date?: string;
  importedAt: string;
  processingStatus: "processed" | "manual" | "needs-review";
  fingerprint: string;
  notes?: string;
};

export type TaxFact = {
  id: string;
  taxYear: TaxYearId;
  type: TaxFactType;
  amount: number;
  date?: string;
  period?: { from: string; to: string };
  sourceType: TaxEvidenceSource;
  sourceId?: string;
  documentId?: string;
  confidence: EvidenceConfidence;
  status: TaxFactStatus;
  employer?: string;
  employerId?: string;
  treatment?: PensionTaxTreatment;
  provider?: string;
  explanation?: string;
  linkedTransactionIds?: string[];
  /** Extensible source details, such as a P60's PAYE reference. */
  provenance?: Record<string, string | number | boolean | undefined>;
};

export type TaxIssue = {
  id: string;
  severity: "info" | "attention" | "blocking";
  category: "evidence" | "reconciliation" | "income" | "relief" | "calculation";
  title: string;
  explanation: string;
  action?: string;
};

export type TaxReadiness = {
  status: "Setup needed" | "Partial" | "Good";
  summary: string;
  checks: Array<{ label: string; status: "complete" | "partial" | "missing"; detail: string }>;
  employments: Array<{ employerId: string; employer: string; status: "verified" | "current" | "incomplete"; detail: string; taxablePay?: number; taxPaid?: number }>;
};

export type TaxPosition = {
  taxYear: TaxYearId;
  taxYearStatus: "open" | "closed";
  income: { employment: number; property: number; savings: number; dividends: number; other: number; total: number };
  adjustments: { pensions: number; vctRelief: number; other: number };
  taxableIncome?: number;
  taxPaid: { paye: number; selfAssessment: number; other: number; total: number };
  hasTaxPaidEvidence: boolean;
  estimatedLiability?: number;
  estimatedBalance?: number;
  calculationStatus: "estimated" | "partial" | "not-available";
  calculationNote: string;
  readiness: TaxReadiness;
  issues: TaxIssue[];
  evidence: Array<{ label: string; amount: number; facts: TaxFact[]; confidence: EvidenceConfidence }>;
};

import type { PensionTaxTreatment, TaxDocument, TaxFact } from "./tax/types.ts";

export type SpendingTreatment = "Recurring" | "Normal variable" | "Planned one-off" | "Unplanned one-off" | "Reimbursable business" | "Transfer / savings";
/** Runtime classification only. Balance.type remains the persisted legacy label. */
export type AccountKind = "current" | "savings" | "cash-isa" | "investment-isa" | "investment" | "credit-card" | "mortgage" | "loan" | "pension" | "property" | "other";
export type CategoryGroup = "essential" | "lifestyle" | "future" | "income" | "transfer" | "property" | "work";
export type TransactionRole = "none" | "salary" | "rental-income" | "maintenance" | "savings-contribution" | "savings-challenge" | "bills-reserve" | "debt-repayment" | "transfer";
export type SubcategoryConfig = { id: string; name: string; enabled: boolean; role?: TransactionRole };
export type CategoryConfig = { id: string; name: string; group: CategoryGroup; enabled: boolean; subcategories: SubcategoryConfig[] };
export type Tx = { originalDescription?: string; importedCategory?: string; importBatch?: string; fingerprint?: string; id: string; sourceId?: string; date: string; transactionTime?: string; merchant: string; reference?: string; category: string; categoryId?: string; categoryGroup?: CategoryGroup; subcategory?: string; subcategoryId?: string; role?: TransactionRole; amount: number; account: string; transactionType?: string; classificationOverride?: boolean; spendingTreatment?: SpendingTreatment };
export type Balance = { id: string; name: string; group: "asset" | "liability"; type: string; value: number; asOf?: string };
export type CsvImportMapping = { version: 1; id: string; name: string; accountId: string; dateColumn: string; descriptionColumn: string; amountMode: "single" | "debit-credit"; amountColumn?: string; debitColumn?: string; creditColumn?: string; referenceColumn?: string; transactionTypeColumn?: string; categoryColumn?: string; balanceColumn?: string; dateFormat?: "UK" | "ISO" | "US"; spendingSign?: "negative" | "positive" };
export type Goal = { id: string; name: string; target: number; current: number; colour: string };
export type SinkingFund = { id: string; name: string; target: number; current: number; monthly: number; colour: string };
export type Snapshot = { cashBasis?: "net-cash-v2" | "net-cash-v1" | "legacy-unknown"; grossCash?: number; cardDebt?: number; cashIsa?: number; accountBalances?: Balance[]; date: string; netWorth: number; cash: number; isa?: number; pension: number; debt: number; healthScore?: number; healthScoreVersion?: 1 | 2 | 3; healthInputs?: { cashProgress: number; savingsRate: number; cashFlowMargin?: number; debtRatio: number } };
export type ImportRecord = { id: string; fileName: string; importedAt: string; added: number; skipped: number; rejected?: number; issues?: string[]; warnings?: string[]; needsReview?: number; source?: "Monzo" | "Barclaycard" | "Generic CSV"; importerId?: string; accountId?: string; mappingId?: string; balanceUpdates?: Array<{accountId:string;from:number;to:number;asOf:string}>; from?: string; to?: string };
export type PayslipRecord = { id: string; fileName: string; employer?: string; employerId?: string; payDate: string; payPeriod?: { from: string; to: string }; salary: number; cashEarnings: number; taxablePay?: number; taxablePaySource?: "reported" | "estimated"; ytdTaxablePay?: number; ytdTaxPaid?: number; taxEvidence?: "reported" | "missing"; pensionTaxTreatment?: PensionTaxTreatment; tax: number; ni: number; netPay: number; employeePension: number; employerPension: number; espp: number; esppRefund?: number; annualLeavePayout?: number; rsuGain: number; rsuTaxCredit: number; taxCode: string };
export type PayslipDraft = { fileName: string; employer?: string; taxablePay?: string; ytdTaxablePay?: string; ytdTaxPaid?: string; pensionTaxTreatment?: PensionTaxTreatment; payDate: string; salary: string; cashEarnings: string; tax: string; ni: string; netPay: string; employeePension: string; employerPension: string; espp: string; esppRefund: string; annualLeavePayout: string; rsuGain: string; rsuTaxCredit: string; taxCode: string };
export type MerchantRule = { key: string; label: string; category: string; categoryId?: string; subcategory: string; subcategoryId?: string; role?: TransactionRole; updatedAt: string; effectiveFrom?: string };
export type ClassificationScope = "one" | "forward" | "all";
export type PendingClassification = { transactionId: string; nextCategory: string; nextSubcategory: string; nextRole: TransactionRole };
export type DirectDebitFrequency = "weekly" | "monthly" | "quarterly" | "annual" | "irregular";
export type DirectDebitSetting = { frequency: DirectDebitFrequency; archived?: boolean };
/** Provider-neutral fixed obligation. Legacy Direct Debit settings remain readable. */
export type RecurringCommitment = {
  id: string; key: string; label: string; category: string; scheduledAmount: number;
  reference?: string; description?: string; subcategory?: string;
  frequency: DirectDebitFrequency; lastDate: string;
  paymentMethod: "direct-debit" | "standing-order" | "card" | "transfer" | "manual" | "unknown";
  status: "detected" | "confirmed" | "user-overridden";
  source: string; archived?: boolean;
};
export type MortgagePlanner = { balance: number; annualRate: number; monthlyPayment: number; monthlyOverpayment: number; annualOverpayment: number; investmentReturn: number };
export type MortgageProjection = { months: number; interest: number; totalPaid: number; balances: number[]; valid: boolean };
export type MortgageAccountId = "mortgage" | "rental-mortgage";
export type MortgageStatementRecord = { id: string; fileName: string; mortgageId: MortgageAccountId; importerId?: string; accountId?: string; lender: string; statementDate: string; balance: number; previousBalance?: number; rows: number; importedAt: string; interestPaid?: number; interestRate?: number; interestRateDate?: string; capitalPaid?: number; payments?: number };
export type MortgageImportDraft = { fileName: string; mortgageId: MortgageAccountId; lender: string; statementDate: string; balance: number; previousBalance?: number; rows: number; interestPaid?: number; interestRate?: number; interestRateDate?: string; capitalPaid?: number; payments?: number; duplicate: boolean; warnings: string[] };
export type PotPosition = { bills: number; savings: number; updatedAt?: string };
export type MonzoBalanceTracking = { enabled: boolean; syncedThrough: string; updatedAt: string };
export type SavingsChallengeTracking = { balance: number; syncedThrough: string; updatedAt: string };
export type BalanceReconciliation = { id: string; reconciledAt: string; transactionsThrough: string; trackedBalance: number; actualBalance: number; difference: number; reason: string };
export type CycleCloseout = { cycle: string; closedAt: string; income: number; personalSpend: number; rentalIncome: number; rentalMortgage: number; cashFlow: number; payYourselfFirst?: number; unallocated?: number; spendingPlan: number; planVariance: number; unreviewed: number; note: string; currentAccount: number; netWorth: number };
export type CycleAnnotationKind = "Normal" | "Transition" | "Holiday" | "Home renovation" | "Bonus month" | "RSU vest" | "Large annual bill";
export type CycleAnnotation = { kind: CycleAnnotationKind; title?: string; note?: string; excludeFromBaseline?: boolean };
export type ReviewedSpendingSignal = { id: string; cycle: string; title: string; reviewedAt: string };
export type CardStatementSummary = { statementDate: string; balance: number; minimumPayment: number; dueDate: string; creditLimit: number; fileName: string };
export type CardImportTransaction = Omit<Tx, "id" | "category" | "account"> & { sourceCategory?: string };
export type ParsedCardFile = { transactions: CardImportTransaction[]; summary?: CardStatementSummary; format: "PDF" | "CSV"; rejected: number; issues: string[] };
export type PendingImport = { needsReview: number; file: File; source: "Monzo" | "Barclaycard" | "Generic CSV"; importerId: string; accountId: string; mappingId?: string; providerMetadata?: {cardStatement?:CardStatementSummary;requestedBalance?:{value:number;asOf:string}}; transactions: Tx[]; added: number; skipped: number; reconciled: number; rejected: number; issues: string[]; warnings?: string[]; effectPreview?: Array<{title:string;value:string;note:string}>; preview: Tx[] };
export type DetailKey = "health" | "cashflow" | "growth" | "assets" | "debt" | "accessible" | "savings" | "pensions" | "equity" | "runway" | "payslip";
export type OnboardingStep = "welcome" | "accounts" | "import" | "income" | "commitments" | "categories" | "goals" | "review";
export type OnboardingState = { version: 1; status: "not-started" | "in-progress" | "completed"; step: OnboardingStep };
export type EmployerAlias = { id: string; displayName: string; aliases: string[] };

/** Configuration only. Financial values and history stay in their existing stores. */
export type UserProfile = {
  version: number;
  origin: "fresh" | "legacy";
  /** Optional first-party features; absent only in pre-Phase-8 profiles. */
  enabledPacks?: import("./feature-packs.ts").FeaturePackId[];
  /** Employer identity is user configuration, not a Tax calculation default. */
  taxEmployers?: EmployerAlias[];
  accounts: Array<{ id: string; name: string; kind: AccountKind; coverage?: "required" | "optional" | "excluded" }>;
  csvMappings?: CsvImportMapping[];
  goals: Array<Pick<Goal, "id" | "name" | "target" | "colour">>;
  paySchedule?: { payday: number; rules: NonNullable<Store["paydayRules"]> };
  merchantRules: MerchantRule[];
  categories?: CategoryConfig[];
  customSubcategories: Record<string, string[]>;
  /** Only populated for a migrated installation when it used these rules. */
  incomeSources?: Array<{ kind: "salary" | "rental"; merchantContains: string[] }>;
  merchantCategoryHints?: Array<{ category: string; merchantContains: string[] }>;
  merchantSubcategoryHints?: Array<{ category: string; subcategory: string; merchantContains: string[] }>;
  planning?: { income: number; budgetPlan: Record<string, number>; seedPlan?: Record<string, number>; annualSalary?: number; employeePensionRate?: number; employerPensionRate?: number; pensionProvider?: string };
  propertyConfig?: { rentalCategory: string; rentalMortgageMerchantKey: string; homeMortgageMerchantKey: string };
};

export type Store = {
  /** True only for the built-in fictional evaluation profile. */
  demoMode?: boolean;
  profile?: UserProfile;
  onboarding?: OnboardingState;
  transactions: Tx[];
  balances: Balance[];
  goals: Goal[];
  sinkingFunds?: SinkingFund[];
  paydayAllocationsMoved?: Record<string, boolean>;
  potPosition?: PotPosition;
  monzoBalanceTracking?: MonzoBalanceTracking;
  savingsChallengeTracking?: SavingsChallengeTracking;
  balanceReconciliations?: BalanceReconciliation[];
  cycleCloseouts?: CycleCloseout[];
  cycleAnnotations?: Record<string, CycleAnnotation>;
  reviewedSpendingSignals?: ReviewedSpendingSignal[];
  snapshots?: Snapshot[];
  imports?: ImportRecord[];
  payslips?: PayslipRecord[];
  mortgageStatements?: MortgageStatementRecord[];
  /** Evidence metadata and extracted facts only; original tax documents are never stored in the app bundle. */
  taxDocuments?: TaxDocument[];
  taxFacts?: TaxFact[];
  merchantRules?: MerchantRule[];
  customSubcategories?: Record<string, string[]>;
  cardStatement?: CardStatementSummary;
  cardCoverageConfirmations?: Record<string, { through: string; confirmedAt: string }>;
  accountCoverageConfirmations?: Record<string, Record<string, { through: string; confirmedAt: string }>>;
  directDebitHidden?: string[];
  directDebitSettings?: Record<string, DirectDebitSetting>;
  recurringCommitments?: RecurringCommitment[];
  mortgagePlanner?: MortgagePlanner;
  esppRefunded?: boolean;
  esppRefundAmount?: number;
  monthlyBudget: number;
  planningIncome?: number;
  budgetPlan?: Record<string, number>;
  budgetVersion?: number;
  transactionDataVersion?: number;
  cardDataVersion?: number;
  classificationVersion?: number;
  balanceRepairVersion?: number;
  balanceSchemaVersion?: number;
  taxSchemaVersion?: number;
  payday?: number;
  paydayRules?: Array<{ effectiveFrom: string; payday: number; employer?: string; strictStart?: boolean }>;
  paydayScheduleVersion?: number;
  lastBackupAt?: string;
  updatedAt: string;
};

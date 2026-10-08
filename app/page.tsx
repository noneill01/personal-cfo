"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Balance, BalanceReconciliation, ClassificationScope, CycleAnnotation, CycleCloseout, DetailKey, DirectDebitFrequency, DirectDebitSetting, MerchantRule, MortgageAccountId, MortgageImportDraft, MortgagePlanner, PayslipDraft, PayslipRecord, PendingClassification, PendingImport, SavingsChallengeTracking, SinkingFund, Snapshot, SpendingTreatment, Store, Tx } from "../lib/types";
import { categories as taxonomyCategories, classifyWithRules, defaultSubcategories, inferSubcategory, isInternalPotTransfer, isSavingsChallengeTransfer, merchantRuleKey, subcategories } from "../lib/classification";
import { cycleBounds, cycleLabel as cycleLabelFor, isRentalIncome, isSalaryTransaction, nextMonthKey, ordinalDay, payCycleAnchorDates, payCycleKey, previousMonthKey, shiftIsoDate, transactionCycleKey } from "../lib/pay-cycles";
import { accountFreshness, baselineEligibleCycles, configuredAccountCoverage, cycleCoverageStatus, isCoveredTransaction, participatesInOverview, requiredBalanceFreshness, transactionAccountId } from "../lib/coverage";
import { baselineMortgagePlanner, futureValueOfContributions, mortgageProjection } from "../lib/mortgage";
import { businessExpensePosition, isBusinessExpenseActivity, isCardRepayment, isExcludedFromSpending, isPayYourselfFirstMovement, savingsFundingUsed, savingsMovementBreakdown, spendingTreatmentFor, spendingTreatmentSummary, transactionKey } from "../lib/transactions";
import { HEALTH_SCORE_VERSION, assessHealthReadiness, calculateHealthScore, explainHealthMovement, type HealthInputs } from "../lib/health";
import { syncGoalsWithBalances } from "../lib/goals";
import { accountKind, assetBalance, debtBalance, isCashAccount, pensionBalance, cardDebtBalance, cashAfterCardDebt, cashBalance, isaBalance, mortgageDebtBalance, planningCashPosition, propertyEquity, createBalanceSnapshot, migrateBalanceHistory, comparableCash, cashChange } from "../lib/balances";
import { groupPayslipsByMonth, latestPayslipRecord, payrollFallbackEntries, payslipForCycle, salaryIncomeForMonth } from "../lib/payslips";
import { manualPayslipTaxEvidence, mergeImportedPayslip } from "../lib/tax/payslip-evidence.ts";
import { taxEmployer } from "../lib/tax/employers.ts";
import { parsePayslip, statementMoney } from "../lib/imports";
import { applyImportEffects, barclaycardImporter, genericCsvImporter, monzoImporter, mortgageImporter, mortgageImportEffects, normaliseBarclaycardImport, normaliseGenericCsvImport, normaliseMonzoImport, type NormalisedImportDraft } from "../lib/importers";
import { commitTransactionImport, previewTransactionImport } from "../lib/import-workflow";
import type { CsvImportMapping, AccountKind } from "../lib/types";
import { backupAgeInDays, discoverLocalFinanceStore, LOCAL_STORE_KEY, parseBackup, serialiseBackup, storeWithBackupTimestamp } from "../lib/backup";
import { latestAutomaticBackup, writeAutomaticBackup, type WritableDirectoryHandle } from "../lib/auto-backup";
import { clearAutomaticBackupDirectory, deleteFinanceDatabase, financeStoresMatch, INDEXED_DB_MIGRATION_BACKUP_KEY, loadAutomaticBackupDirectory, saveAutomaticBackupDirectory, saveFinanceStore, loadFinanceStore } from "../lib/storage";
import { reviewReadiness, closeoutHasChanged, canUndoImport, savingsTotals } from "../lib/review";
import { buildPlanRows, dedupeRecurringCommitments, expectedPlanCommitmentAmount, explicitRecurringCommitments, selectLastCompletedCycle, summarizeNextCyclePlan, type RecurringCommitmentDefinition } from "../lib/plan";
import { activeCommitmentDefinitions, commitmentEvidence, detectedDirectDebitDefinitions, groupCommitmentTransactions, migrateRecurringCommitments, reconcileRecurringCommitments } from "../lib/recurring-commitments";
import HomeScreen from "../components/Home";
import MonthlyReview from "../components/MonthlyReview";
import TransactionsScreen from "../components/Transactions";
import Plan from "../components/Plan";
import Settings from "../components/Settings";
import Onboarding from "../components/Onboarding";
import ImportPreview from "../components/ImportPreview";
import { finishOnboarding, setOnboardingStep, shouldShowOnboarding } from "../lib/onboarding.ts";
import { disableFeaturePack, enableFeaturePack, isFeaturePackEnabled, visibleNavigation } from "../lib/feature-packs.ts";
import Tax from "../components/Tax";
import { migrateTaxStore } from "../lib/tax/index.ts";
import { applyUserProfile, classifyConfiguredIncome, createFreshStore, migrateUserProfile, syncUserProfileInPlace } from "../lib/profile.ts";
import { addSubcategory, categoryFor, categoryGroupFor, resolveCategory } from "../lib/categories.ts";
import { hasRole } from "../lib/transaction-roles.ts";
import { useCategorySelectionSync } from "../lib/category-selection.ts";
import { regionalFormatters } from "../lib/region.ts";
import { createDemoStore } from "../lib/demo.ts";
/**
 * Safe first-run defaults. Personal balances and history live only in the
 * browser's IndexedDB store (or an exported backup), never in the repository.
 */
const baselineSavingsChallengeTracking:SavingsChallengeTracking={balance:0,syncedThrough:"",updatedAt:""};
const primaryNavigation=[
  {label:"Home",target:"Overview"},
  {label:"Monthly Review",target:"Monthly Review"},
  {label:"Transactions",target:"Transactions"},
  {label:"Plan",target:"Plan"},
  {label:"Tax",target:"Tax"},
  {label:"Settings",target:"Settings"},
] as const;
const appTabs=["Overview","Monthly Review","Transactions","Plan","Budget","Goals","Mortgage","Leakage","Tax","Settings","Update","Accounts","Income","Direct Debits"] as const;
function isAppTab(value:unknown): value is string { return typeof value==="string"&&appTabs.includes(value as typeof appTabs[number]); }
function parentSection(tab:string){
  if(tab==="Overview")return "Home";
  if(tab==="Monthly Review")return "Monthly Review";
  if(tab==="Transactions")return "Transactions";
  if(["Plan","Budget","Goals","Mortgage","Leakage"].includes(tab))return "Plan";
  if(tab==="Tax")return "Tax";
  return "Settings";
}
const directDebitDefinitions: {key:string;label:string;category:string}[]=[];
// Compatibility only: old saves with missing fields retain their former defaults.
// A fresh installation never receives these accounts or goals.
const legacyBaselineBalances: Balance[] = [
  { id: "home", name: "Main home", group: "asset", type: "Property", value: 0 },
  { id: "pension", name: "Workplace pension", group: "asset", type: "Pension", value: 0 },
  { id: "savings", name: "Cash savings", group: "asset", type: "Cash", value: 0 },
  { id: "monzo-current", name: "Monzo current account", group: "asset", type: "Current account", value: 0 },
  { id: "isa", name: "Stocks & Shares ISA", group: "asset", type: "ISA", value: 0 },
  { id: "mortgage", name: "Main mortgage", group: "liability", type: "Mortgage", value: 0 },
  { id: "barclaycard-debt", name: "Credit card balance", group: "liability", type: "Credit card", value: 0 },
];
const legacyBaselineGoals = [
  { id: "ef", name: "Emergency fund", target: 10000, current: 0, colour: "#167c63" },
  { id: "isa", name: "ISA milestone", target: 10000, current: 0, colour: "#3768b0" },
  { id: "pension", name: "Pension milestone", target: 100000, current: 0, colour: "#9a6b21" },
];
const baselineSinkingFunds:SinkingFund[]=[];
const baselineCycleAnnotations: Record<string, CycleAnnotation>={};
type AutomaticBackupStatus = "checking"|"not-configured"|"ready"|"needs-permission"|"unsupported"|"saving"|"error";
const initialStore: Store = createFreshStore();
export default function Home() {
  const [store, setStoreState] = useState<Store>(initialStore);
  const regional=useMemo(()=>regionalFormatters(store.profile),[store.profile]),gbp=regional.money,gbpExact=regional.moneyExact;
  const cycleLabel=(key:string,payday?:number,salaryDates?:import("../lib/pay-cycles").SalaryDateMap)=>cycleLabelFor(key,payday,salaryDates,regional.region.locale);
  const categories=useMemo(()=>store.profile?.categories?.filter(item=>item.enabled).map(item=>item.name)??taxonomyCategories,[store.profile?.categories]);
  const resolvedTransactions=useMemo(()=>store.transactions.map(item=>resolveCategory(item,store.profile)),[store.transactions,store.profile]);
  const displayStore=useMemo(()=>({...store,transactions:resolvedTransactions}),[store,resolvedTransactions]);
  const needsReview=(transaction:Tx)=>transaction.categoryId==="category:other"||transaction.subcategoryId==="category:other/subcategory:needs-review"||(!transaction.categoryId&&transaction.category==="Other");
  // Existing controls still write legacy fields; the bridge promotes edits to
  // UserProfile, then projects its authoritative configuration back to them.
  const setStore = useCallback<Dispatch<SetStateAction<Store>>>(update => {
    setStoreState(previous => syncUserProfileInPlace(typeof update === "function" ? update(previous) : update, previous));
  }, []);
  const [hydrated, setHydrated] = useState(false);
  const [storageError,setStorageError]=useState("");
  const [savedAt,setSavedAt]=useState("");
  const [appVersion,setAppVersion]=useState("Checking build…");
  const [persistenceMode,setPersistenceMode]=useState<"loading"|"indexeddb"|"localstorage">("loading");
  const [automaticBackupStatus,setAutomaticBackupStatus]=useState<AutomaticBackupStatus>("checking");
  const [automaticBackupFolder,setAutomaticBackupFolder]=useState("");
  const [automaticBackupSavedAt,setAutomaticBackupSavedAt]=useState("");
  const [automaticBackupError,setAutomaticBackupError]=useState("");
  const [importBusy,setImportBusy]=useState(false);
  const undoCommitted=useRef<Store|null>(null);
  const saveQueue=useRef<Promise<void>>(Promise.resolve());
  const automaticBackupDirectory=useRef<WritableDirectoryHandle|null>(null);
  const automaticBackupBusy=useRef(false);
  const automaticBackupLastStore=useRef<Store|null>(null);
  const [tab, setTab] = useState("Overview");
  const [setupOpen,setSetupOpen]=useState(false);
  const [setupDismissed,setSetupDismissed]=useState(false);
  const [setupEditStep,setSetupEditStep]=useState<import("../lib/types").OnboardingStep>("review");
  const [query, setQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState("All accounts");
  const [category, setCategory] = useState("All categories");
  const [subcategoryFilter, setSubcategoryFilter] = useState("All subcategories");
  const [period, setPeriod] = useState("Current pay cycle");
  const [notice, setNotice] = useState("");
  const [importError,setImportError]=useState("");
  const [pendingImport,setPendingImport]=useState<PendingImport|null>(null);
  const [undoStore,setUndoStore]=useState<Store|null>(null);
  const [dragging, setDragging] = useState(false);
  const [theme, setTheme] = useState<"light"|"dark">("light");
  const [txLimit, setTxLimit] = useState(30);
  const [txView,setTxView]=useState<"Spending"|"Savings"|"Work expenses"|"All activity"|"Income">("Spending");
  const [budgetCycle,setBudgetCycle]=useState("latest");
  const [overviewCycle,setOverviewCycle]=useState("latest");
  const [reviewCycleSelection,setReviewCycleSelection]=useState("latest");
  const [detailKey, setDetailKeyState] = useState<DetailKey|null>(null);
  const [selectedPayslipId,setSelectedPayslipId]=useState<string|null>(null);
  const [subcategoryDialog,setSubcategoryDialog]=useState<{category:string;transactionId?:string}|null>(null);
  const [classificationDialog,setClassificationDialog]=useState<PendingClassification|null>(null);
  const [newSubcategory,setNewSubcategory]=useState("");
  const [showArchivedDirectDebits,setShowArchivedDirectDebits]=useState(false);
  const [manual, setManual] = useState({date:"",merchant:"",amount:"",category:"Other",subcategory:"Needs review",account:"Manual"});
  useCategorySelectionSync(categories,store.profile,category,setCategory,setSubcategoryFilter,manual,setManual);
  const [payslipDraft,setPayslipDraft]=useState<PayslipDraft|null>(null);
  const [mortgageImportTarget,setMortgageImportTarget]=useState<MortgageAccountId>("mortgage");
  const [mortgageImportDraft,setMortgageImportDraft]=useState<MortgageImportDraft|null>(null);
  const [reconcileBalance,setReconcileBalance]=useState("");
  const [reconcileReason,setReconcileReason]=useState("Routine balance check");
  const [closeoutNotes,setCloseoutNotes]=useState<Record<string,string>>({});
  const [challengeBalanceInput,setChallengeBalanceInput]=useState(String(baselineSavingsChallengeTracking.balance));
  const [challengeBalanceDate,setChallengeBalanceDate]=useState(baselineSavingsChallengeTracking.syncedThrough);
  // Screens are deliberately kept in browser history. This makes the normal
  // browser Back and Forward buttons work without storing finance data in URLs.
  const navigateToTab=(next:SetStateAction<string>)=>{
    setSetupOpen(false);setSetupDismissed(true);
    const target=typeof next==="function"?next(tab):next;
    if(target==="Tax"&&!isFeaturePackEnabled(store.profile,"uk-tax"))return;
    if(target===tab)return;
    if(typeof window!=="undefined")window.history.pushState({...window.history.state,personalCfoTab:target},"",window.location.href);
    setTab(target);
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);
  const payslipRef = useRef<HTMLInputElement>(null);
  const mortgageStatementRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  // Browser storage is scoped to the exact origin. `127.0.0.1` and
  // `localhost` therefore have separate IndexedDB databases, which can make
  // the dashboard appear empty even though the established local record is
  // intact. Keep one canonical address for this private app.
  useEffect(() => {
    if (window.location.hostname !== "127.0.0.1") return;
    const canonical = new URL(window.location.href);
    canonical.hostname = "localhost";
    window.location.replace(canonical.toString());
  }, []);
  useEffect(() => {
    let active=true;
    void (async()=>{
    let nextStore=initialStore;
    let rawSaved:string|null=null;
    let loadedFromIndexedDb=false;
    const savedTheme=(localStorage.getItem("personal-cfo-theme") as "light"|"dark"|null)??(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
    let indexedStore:Store|null=null;
    try { indexedStore=await loadFinanceStore();loadedFromIndexedDb=Boolean(indexedStore); }
    catch { indexedStore=null; }
    try {
      const localRecord=discoverLocalFinanceStore(localStorage);
      rawSaved=localRecord?.raw??null;
      const saved=indexedStore??localRecord?.store??null;
      if(saved){
      if(rawSaved&&(saved.balanceSchemaVersion??0)<2&&!localStorage.getItem(`${LOCAL_STORE_KEY}-before-balances-v2`))localStorage.setItem(`${LOCAL_STORE_KEY}-before-balances-v2`,rawSaved);
      // Do not inject source-code defaults into an established financial record.
      // New accounts are created explicitly through Settings.
      const snapshots = saved.snapshots;
      const budgetNeedsRefresh=(saved.budgetVersion??0)<5;
      const payslips=[...(saved.payslips??[])].sort((a,b)=>b.payDate.localeCompare(a.payDate));
      const migratedDirectDebitSettings=saved.directDebitSettings??Object.fromEntries((saved.directDebitHidden??[]).map(key=>[key,{frequency:"monthly",archived:true}]));
      const migratedTransactions=(saved.transactions??[]).map(t=>t.role===undefined&&isCardRepayment(t)?{...t,category:"Transfers",subcategory:"Credit card payment"}:t);
      nextStore={ ...saved, payday:saved.payday??(saved.profile?.origin==="fresh"?undefined:28), paydayRules:saved.paydayRules??[], paydayScheduleVersion:1, planningIncome:saved.planningIncome??initialStore.planningIncome, budgetVersion:5, budgetPlan:budgetNeedsRefresh?{}:(saved.budgetPlan??{}), snapshots, merchantRules:saved.merchantRules??[],customSubcategories:saved.customSubcategories??{},directDebitHidden:saved.directDebitHidden??[],directDebitSettings:migratedDirectDebitSettings,mortgagePlanner:saved.mortgagePlanner??baselineMortgagePlanner,mortgageStatements:saved.mortgageStatements??[],sinkingFunds:saved.sinkingFunds??baselineSinkingFunds,paydayAllocationsMoved:saved.paydayAllocationsMoved??{},potPosition:saved.potPosition??{bills:0,savings:0},monzoBalanceTracking:saved.monzoBalanceTracking??initialStore.monzoBalanceTracking,savingsChallengeTracking:saved.savingsChallengeTracking??baselineSavingsChallengeTracking,balanceReconciliations:saved.balanceReconciliations??[],cycleCloseouts:saved.cycleCloseouts??[],cycleAnnotations:{...baselineCycleAnnotations,...(saved.cycleAnnotations??{})},cardStatement:saved.cardStatement??initialStore.cardStatement, payslips, esppRefunded:saved.esppRefunded??false,esppRefundAmount:saved.esppRefundAmount??0,transactions:migratedTransactions, balances:saved.balances??(saved.profile?.origin==="fresh"?[]:legacyBaselineBalances),balanceRepairVersion:1 };
      }
    }
    catch { if(discoverLocalFinanceStore(localStorage)){setStorageError("Your saved data could not be loaded. It has been preserved. Reload to try again, or download it for recovery.");return;}nextStore=initialStore; }
    // Historical data is imported through the app or restored from a backup.
    // Never fetch a bundled personal bank or card history from source control.
    nextStore=applyUserProfile(migrateUserProfile(nextStore));
    nextStore={...nextStore,transactions:classifyConfiguredIncome(nextStore.transactions,nextStore.profile)};
    const savedRules=(nextStore.profile?.merchantRules??[]).filter(rule=>!/\bpot\b\s*$/.test(rule.key)||categoryGroupFor(nextStore.profile,rule)==="future");
    nextStore={...nextStore,profile:{...nextStore.profile!,merchantRules:savedRules},merchantRules:savedRules,classificationVersion:2,transactions:nextStore.transactions.map(transaction=>classifyWithRules(transaction,savedRules,nextStore.profile?.incomeSources,nextStore.profile?.merchantSubcategoryHints,nextStore.profile)),goals:syncGoalsWithBalances(nextStore.goals??(nextStore.profile?.origin==="fresh"?[]:legacyBaselineGoals),nextStore.balances)};
    nextStore=migrateBalanceHistory(nextStore);
    if(isFeaturePackEnabled(nextStore.profile,"uk-tax"))nextStore=migrateTaxStore(nextStore);
    nextStore={...nextStore,goals:syncGoalsWithBalances(nextStore.goals,nextStore.balances)};
    nextStore=syncUserProfileInPlace(nextStore);
    try {
      if(!loadedFromIndexedDb&&rawSaved&&!localStorage.getItem(INDEXED_DB_MIGRATION_BACKUP_KEY))localStorage.setItem(INDEXED_DB_MIGRATION_BACKUP_KEY,rawSaved);
      await saveFinanceStore(nextStore);
      const verified=await loadFinanceStore();
      if(!verified||!financeStoresMatch(nextStore,verified))throw new Error("IndexedDB migration verification failed.");
      setPersistenceMode("indexeddb");
    } catch {
      try { localStorage.setItem(LOCAL_STORE_KEY,serialiseBackup(nextStore));setPersistenceMode("localstorage"); }
      catch { setStorageError("Your financial data could not be saved. Download a recovery backup before closing the app.");return; }
    }
    if(active)queueMicrotask(()=>{const challenge=nextStore.savingsChallengeTracking??baselineSavingsChallengeTracking;setStore(nextStore);setTheme(savedTheme);setChallengeBalanceInput(challenge.balance.toFixed(2));setChallengeBalanceDate(challenge.syncedThrough);setManual(m=>({...m,date:new Date().toISOString().slice(0,10)}));setHydrated(true)});
    })();
    return()=>{active=false};
  }, [setStore]);

  useEffect(()=>{
    let active=true;
    void fetch("/app-version.json",{cache:"no-store"})
      .then(response=>response.ok?response.json() as Promise<{version?:unknown}>:Promise.reject(new Error("Version unavailable")))
      .then(payload=>{if(active&&typeof payload.version==="string")setAppVersion(payload.version)})
      .catch(()=>{if(active)setAppVersion("Build version unavailable")});
    return()=>{active=false};
  },[]);
  useEffect(()=>{
    if(!hydrated)return;
    const initial=window.history.state?.personalCfoTab;
    if(isAppTab(initial))queueMicrotask(()=>setTab(initial));
    else window.history.replaceState({...window.history.state,personalCfoTab:tab},"",window.location.href);
    const restoreTab=(event:PopStateEvent)=>setTab(isAppTab(event.state?.personalCfoTab)?event.state.personalCfoTab:"Overview");
    window.addEventListener("popstate",restoreTab);
    return()=>window.removeEventListener("popstate",restoreTab);
  },[hydrated,tab]);

  useEffect(() => {
    if(!hydrated||persistenceMode==="loading")return;
    const timer=setTimeout(()=>{
      const persist=async()=>{
        try {
          if(persistenceMode==="indexeddb")await saveFinanceStore(store);
          else localStorage.setItem(LOCAL_STORE_KEY,serialiseBackup(store));
          setSavedAt(new Date().toISOString());setStorageError("");
        } catch {
          try { localStorage.setItem(LOCAL_STORE_KEY,serialiseBackup(store));setPersistenceMode("localstorage");setSavedAt(new Date().toISOString());setStorageError("IndexedDB was unavailable, so changes are being kept in the legacy browser store. Export a backup when convenient."); }
          catch { setStorageError("Changes could not be saved in this browser. Download a backup now before closing the app."); }
        }
      };
      saveQueue.current=saveQueue.current.then(persist,persist);
    },300);
    if(undoCommitted.current&&store!==undoCommitted.current){setUndoStore(null);undoCommitted.current=null;}
    return()=>clearTimeout(timer);
  }, [store,hydrated,persistenceMode]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;if(hydrated)try{localStorage.setItem("personal-cfo-theme",theme)}catch{}},[theme,hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (!("showDirectoryPicker" in window)) { queueMicrotask(()=>setAutomaticBackupStatus("unsupported")); return; }
    let active = true;
    void (async () => {
      try {
        const directory = await loadAutomaticBackupDirectory() as WritableDirectoryHandle | null;
        if (!directory) { if (active) setAutomaticBackupStatus("not-configured"); return; }
        const permission = await directory.queryPermission({ mode: "readwrite" });
        const latest = permission === "granted" ? await latestAutomaticBackup(directory) : null;
        if (!active) return;
        automaticBackupDirectory.current = directory;
        setAutomaticBackupFolder(directory.name);
        setAutomaticBackupSavedAt(latest?.savedAt ?? "");
        setAutomaticBackupStatus(permission === "granted" ? "ready" : "needs-permission");
      } catch (error) {
        if (!active) return;
        setAutomaticBackupStatus("error");
        setAutomaticBackupError(error instanceof Error ? error.message : "The selected backup folder could not be opened.");
      }
    })();
    return () => { active = false; };
  }, [hydrated]);

  const writeRecoveryPoint = useCallback(async (snapshot: Store, notify = false) => {
    const directory = automaticBackupDirectory.current;
    if (!directory || automaticBackupBusy.current) return;
    automaticBackupBusy.current = true;
    setAutomaticBackupStatus("saving");
    try {
      const permission = await directory.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") { setAutomaticBackupStatus("needs-permission"); return; }
      const saved = await writeAutomaticBackup(directory, snapshot);
      automaticBackupLastStore.current = snapshot;
      setAutomaticBackupSavedAt(saved.savedAt);
      setAutomaticBackupStatus("ready");
      setAutomaticBackupError("");
      if (notify) { setNotice(`Recovery point saved locally. The newest ${saved.retained} are retained.`); setTimeout(() => setNotice(""), 4200); }
    } catch (error) {
      setAutomaticBackupStatus("error");
      setAutomaticBackupError(error instanceof Error ? error.message : "The automatic backup could not be written.");
    } finally {
      automaticBackupBusy.current = false;
    }
  }, []);

  async function enableAutomaticBackups() {
    if (!("showDirectoryPicker" in window)) { setAutomaticBackupStatus("unsupported"); return; }
    try {
      const picker = (window as Window & { showDirectoryPicker(options: { mode: "readwrite"; id: string }): Promise<WritableDirectoryHandle> }).showDirectoryPicker;
      const directory = await picker({ mode: "readwrite", id: "personal-cfo-backups" });
      const permission = await directory.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") { setAutomaticBackupStatus("needs-permission"); return; }
      await saveAutomaticBackupDirectory(directory);
      automaticBackupDirectory.current = directory;
      setAutomaticBackupFolder(directory.name);
      setAutomaticBackupStatus("ready");
      setAutomaticBackupError("");
      await writeRecoveryPoint(store, true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setAutomaticBackupStatus("error");
      setAutomaticBackupError(error instanceof Error ? error.message : "A backup folder could not be selected.");
    }
  }

  async function reconnectAutomaticBackups() {
    const directory = automaticBackupDirectory.current;
    if (!directory) { await enableAutomaticBackups(); return; }
    try {
      const permission = await directory.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") { setAutomaticBackupStatus("needs-permission"); return; }
      setAutomaticBackupStatus("ready");
      await writeRecoveryPoint(store, true);
    } catch (error) {
      setAutomaticBackupStatus("error");
      setAutomaticBackupError(error instanceof Error ? error.message : "The backup folder could not be reconnected.");
    }
  }

  async function disableAutomaticBackups() {
    try {
      await clearAutomaticBackupDirectory();
      automaticBackupDirectory.current = null;
      setAutomaticBackupFolder("");
      setAutomaticBackupSavedAt("");
      setAutomaticBackupError("");
      setAutomaticBackupStatus("not-configured");
      setNotice("Automatic backups stopped. Existing recovery files were left in place.");
      setTimeout(() => setNotice(""), 4200);
    } catch (error) {
      setAutomaticBackupStatus("error");
      setAutomaticBackupError(error instanceof Error ? error.message : "Automatic backup settings could not be changed.");
    }
  }

  useEffect(() => {
    if (!hydrated || automaticBackupStatus !== "ready") return;
    if (automaticBackupLastStore.current === store) return;
    const timer = setTimeout(() => void writeRecoveryPoint(store), 1800);
    return () => clearTimeout(timer);
  }, [store, hydrated, automaticBackupStatus,writeRecoveryPoint]);

  const totals = useMemo(() => {
    const assets = assetBalance(store.balances);
    const debt = debtBalance(store.balances);
    const cash = cashBalance(store.balances);
    const isa = isaBalance(store.balances);
    const pension = pensionBalance(store.balances);
    const cardDebt=cardDebtBalance(store.balances);
    const currentAccount=planningCashPosition(store.balances,store.profile).current;
    return { assets, debt, net: assets - debt, cash, isa, pension,cardDebt,currentAccount,netLiquid:cashAfterCardDebt(store.balances),accessibleInvestments:isa };
  }, [store.balances,store.profile]);
  // The legacy pot/reconciliation controls edit one account; never feed them
  // the aggregate of several current accounts used by overview totals.
  const legacyCurrentBalance=store.balances.find(balance=>balance.id==="monzo-current")?.value??0;
  const legacyAccountTotals={...totals,currentAccount:legacyCurrentBalance};
  const goals=useMemo(()=>syncGoalsWithBalances((store.profile?.goals??[]).map(config=>({...config,current:store.goals.find(goal=>goal.id===config.id)?.current??0})),store.balances),[store.profile?.goals,store.goals,store.balances]);
  const monzoBalanceTracking=store.monzoBalanceTracking??{enabled:false,syncedThrough:"",updatedAt:""};
  const mortgageSettings=store.mortgagePlanner??baselineMortgagePlanner;
  const mortgageStatementHistory=useMemo(()=>[...(store.mortgageStatements??[])].sort((a,b)=>b.statementDate.localeCompare(a.statementDate)),[store.mortgageStatements]);
  const selectedMortgageHistory=mortgageStatementHistory.filter(record=>record.mortgageId===mortgageImportTarget);
  const latestMortgageStatement=selectedMortgageHistory[0];
  const baseMortgage=mortgageProjection(mortgageSettings,0,0);
  const plannedMortgage=mortgageProjection(mortgageSettings);
  const mortgageMonthsSaved=baseMortgage.valid&&plannedMortgage.valid?Math.max(0,baseMortgage.months-plannedMortgage.months):0;
  const mortgageInterestSaved=baseMortgage.valid&&plannedMortgage.valid?Math.max(0,baseMortgage.interest-plannedMortgage.interest):0;
  const investedAlternative=baseMortgage.valid?futureValueOfContributions(mortgageSettings.monthlyOverpayment,mortgageSettings.annualOverpayment,baseMortgage.months,mortgageSettings.investmentReturn):0;
  const investmentContributions=baseMortgage.valid?mortgageSettings.monthlyOverpayment*baseMortgage.months+mortgageSettings.annualOverpayment*Math.floor(baseMortgage.months/12):0;
  const investmentGrowth=Math.max(0,investedAlternative-investmentContributions);
  const investedAfterEarlyPayoff=mortgageMonthsSaved?futureValueOfContributions(mortgageSettings.monthlyPayment+mortgageSettings.monthlyOverpayment,mortgageSettings.annualOverpayment,mortgageMonthsSaved,mortgageSettings.investmentReturn):0;
  const mortgageDate=(months:number)=>{const date=new Date();date.setMonth(date.getMonth()+months);return regional.formatDate(date,{month:"long",year:"numeric"})};
  const mortgageChartYears=Array.from({length:Math.max(baseMortgage.balances.length,plannedMortgage.balances.length)},(_,index)=>index);

  const payday=store.profile?.paySchedule?.payday??1;
  const paydayRules=useMemo(()=>store.profile?.paySchedule?.rules??[],[store.profile?.paySchedule?.rules]);
  const availableSubcategories=useMemo(()=>Object.fromEntries(categories.map(name=>[name,store.profile?.categories?.find(item=>item.name===name)?.subcategories.filter(item=>item.enabled).map(item=>item.name)??subcategories[name]??[]])),[categories,store.profile?.categories]);
  const classificationTarget=classificationDialog?store.transactions.find(transaction=>transaction.id===classificationDialog.transactionId):undefined;
  const classificationMerchantMatches=classificationTarget?store.transactions.filter(transaction=>merchantRuleKey(transaction.merchant)===merchantRuleKey(classificationTarget.merchant)):[];
  const classificationForwardMatches=classificationTarget?classificationMerchantMatches.filter(transaction=>transaction.date>=classificationTarget.date):[];
  const incomeSources=store.profile?.incomeSources;
  const salaryTransaction=useCallback((transaction:Tx)=>isSalaryTransaction(transaction,incomeSources),[incomeSources]);
  const rentalIncomeTransaction=(transaction:Tx)=>isRentalIncome(transaction,incomeSources);
  const salaryDates=useMemo(()=>{
    const anchors=[
      ...(store.payslips??[]).map(payslip=>({date:payslip.payDate,employer:payslip.employer})),
      ...resolvedTransactions.filter(salaryTransaction).map(transaction=>({date:transaction.date,employer:transaction.merchant})),
    ];
    const furthestKnown=[...anchors.map(anchor=>anchor.date.slice(0,7)),new Date().toISOString().slice(0,7)].sort().at(-1)??new Date().toISOString().slice(0,7);
    return payCycleAnchorDates(anchors,paydayRules,payday,nextMonthKey(furthestKnown));
  },[resolvedTransactions,store.payslips,payday,paydayRules,salaryTransaction]);
  const todayIso=new Date().toISOString().slice(0,10);
  const currentCycleKey=payCycleKey(todayIso,payday,salaryDates);
  const lastCompletedCycleKey=previousMonthKey(currentCycleKey);
  const accountCoverage=useMemo(()=>configuredAccountCoverage(store),[store]);
  const planningCash=useMemo(()=>planningCashPosition(store.balances,store.profile),[store.balances,store.profile]);
  const spendingAccountIds=planningCash.currentAccounts.map(account=>account.id);
  const currentAccountRows=resolvedTransactions.filter(row=>spendingAccountIds.includes(transactionAccountId(row,store.imports??[],spendingAccountIds)??""));
  const legacyCurrentThrough=[...accountCoverage.required,...accountCoverage.optional].find(account=>account.accountId==="monzo-current")?.to??"";
  const coverage={...accountCoverage,monzoFrom:accountCoverage.currentFrom,monzoTo:accountCoverage.currentTo,cardFrom:accountCoverage.creditFrom,cardTo:accountCoverage.creditTo,monzoGaps:accountCoverage.currentGaps};
  const directDebitRows=useMemo(()=>{
    const nativeDefinitions=resolvedTransactions.filter(transaction=>/direct debit/i.test(transaction.transactionType??"")).reduce<typeof directDebitDefinitions>((rows,transaction)=>{const key=merchantRuleKey(transaction.merchant);return rows.some(row=>row.key===key)?rows:[...rows,{key,label:transaction.merchant,category:transaction.category}]},[]);
    const definitions=[...directDebitDefinitions,...nativeDefinitions.filter(native=>!directDebitDefinitions.some(known=>known.key===native.key))];
    return definitions.map(definition=>{
      const matches=resolvedTransactions.filter(transaction=>transaction.account==="Monzo"&&transaction.amount<0&&merchantRuleKey(transaction.merchant)===definition.key);
      const byDate=matches.reduce<Record<string,number>>((dates,transaction)=>{dates[transaction.date]=(dates[transaction.date]||0)-transaction.amount;return dates},{});
      const payments=Object.entries(byDate).sort(([a],[b])=>a.localeCompare(b)).map(([date,amount])=>({date,amount}));
      const last=payments.at(-1);const recent=payments.slice(-3).map(payment=>payment.amount).sort((a,b)=>a-b);const expected=recent.length?recent[Math.floor(recent.length/2)]:0;
      const intervals=payments.slice(1).map((payment,index)=>(new Date(`${payment.date}T12:00:00`).getTime()-new Date(`${payments[index].date}T12:00:00`).getTime())/86400000).sort((a,b)=>a-b);
      const medianInterval=intervals.length?intervals[Math.floor(intervals.length/2)]:30;
      const inferredFrequency:DirectDebitFrequency=medianInterval>=250?"annual":medianInterval>=60?"quarterly":"monthly";
      const setting=store.directDebitSettings?.[definition.key];const frequency=setting?.frequency??inferredFrequency;
      const frequencyMonths=frequency==="monthly"?1:frequency==="quarterly"?3:frequency==="annual"?12:0;
      const monthlyEquivalent=frequency==="weekly"?expected*52/12:frequencyMonths?expected/frequencyMonths:0;const annualCost=monthlyEquivalent*12;
      const ageDays=last&&legacyCurrentThrough?Math.round((new Date(`${legacyCurrentThrough}T12:00:00`).getTime()-new Date(`${last.date}T12:00:00`).getTime())/86400000):999;
      const activeWindow=frequency==="annual"?400:frequency==="quarterly"?125:frequency==="weekly"?21:75;const active=ageDays<=activeWindow;const archived=Boolean(setting?.archived);const enabled=active&&!archived;
      return {...definition,category:matches.at(-1)?.category??definition.category,transactionId:matches.at(-1)?.id??"",payments,lastDate:last?.date??"",lastAmount:last?.amount??0,expected,monthlyEquivalent,annualCost,frequency,active,archived,enabled,source:matches.some(transaction=>/direct debit/i.test(transaction.transactionType??""))?"Monzo Direct Debit":"Recurring pattern"};
    }).filter(row=>row.payments.length).sort((a,b)=>Number(a.archived)-Number(b.archived)||Number(b.active)-Number(a.active)||b.monthlyEquivalent-a.monthlyEquivalent);
  },[resolvedTransactions,store.directDebitSettings,legacyCurrentThrough]);
  const activeDirectDebits=directDebitRows.filter(row=>row.enabled);const monthlyDirectDebitTotal=activeDirectDebits.reduce((sum,row)=>sum+row.monthlyEquivalent,0);const annualDirectDebitTotal=activeDirectDebits.reduce((sum,row)=>sum+row.annualCost,0);
  const nonMonthlyDirectDebits=activeDirectDebits.filter(row=>row.frequency==="quarterly"||row.frequency==="annual");
  const nonMonthlyDirectDebitReserve=nonMonthlyDirectDebits.reduce((sum,row)=>sum+row.monthlyEquivalent,0);
  const tvLicenceDirectDebit=directDebitRows.find(row=>row.key==="tv licensing");
  const archivedDirectDebitCount=directDebitRows.filter(row=>row.archived).length;const displayedDirectDebitRows=directDebitRows.filter(row=>!row.archived||showArchivedDirectDebits);
  const rentalMortgageCommitment=directDebitRows.find(row=>row.key===store.profile?.propertyConfig?.rentalMortgageMerchantKey);
  const latestRelevantDate=[...accountCoverage.required,...accountCoverage.optional].map(account=>account.to).filter(Boolean).sort().at(-1)??"";
  const latestDataCycleKey=latestRelevantDate?payCycleKey(latestRelevantDate,payday,salaryDates):"";
  const selectedPeriodCycleKey=period==="Current pay cycle"?currentCycleKey:period==="Last completed pay cycle"?lastCompletedCycleKey:["Latest imported pay cycle","Latest pay cycle"].includes(period)?latestDataCycleKey:period.startsWith("cycle:")?period.slice(6):"";
  const selectedPeriodLabel=selectedPeriodCycleKey?cycleLabel(selectedPeriodCycleKey,payday,salaryDates):period;
  const cycleKeys=useMemo(()=>[...new Set([...store.transactions.map(t=>transactionCycleKey(t,payday,salaryDates)),...(store.payslips??[]).map(payslip=>payslip.payDate.slice(0,7))])].sort().reverse(),[store.transactions,store.payslips,payday,salaryDates]);
  const historicalDirectDebitKeys=new Set(directDebitRows.map(row=>row.key));
  const directDebitHistory=cycleKeys.slice(0,6).reverse().map(key=>({key,total:store.transactions.filter(transaction=>transaction.account==="Monzo"&&transaction.amount<0&&historicalDirectDebitKeys.has(merchantRuleKey(transaction.merchant))&&payCycleKey(transaction.date,payday,salaryDates)===key).reduce((sum,transaction)=>sum-transaction.amount,0)}));
  const maxDirectDebitHistory=Math.max(...directDebitHistory.map(item=>item.total),1);
  const periodTransactions=resolvedTransactions.filter(t=>{
    if(period==="All data")return true;
    if(["Current pay cycle","Last completed pay cycle","Latest imported pay cycle","Latest pay cycle"].includes(period))return transactionCycleKey(t,payday,salaryDates)===selectedPeriodCycleKey;
    if(period.startsWith("cycle:"))return transactionCycleKey(t,payday,salaryDates)===period.slice(6);
    const months=Number(period.split(" ")[0]);
    const anchor=new Date(`${coverage.to||new Date().toISOString().slice(0,10)}T12:00:00`);anchor.setMonth(anchor.getMonth()-months);
    return new Date(`${t.date}T12:00:00`)>=anchor;
  });
  const filtered = periodTransactions.filter(t => {
    const matches=`${t.merchant} ${t.account}`.toLowerCase().includes(query.toLowerCase())&&(accountFilter==="All accounts"||t.account===accountFilter)&&(["All","All categories"].includes(category)||t.category===category)&&(subcategoryFilter==="All subcategories"||(t.subcategory||inferSubcategory(t.category,t.merchant))===subcategoryFilter);
    if(!matches)return false;
    if(txView==="Income")return t.amount>0;
    if(txView==="Savings")return isPayYourselfFirstMovement(t);
    if(txView==="Work expenses")return isBusinessExpenseActivity(t);
    if(txView==="Spending")return t.amount<0&&!isExcludedFromSpending(t);
    return true;
  });

  const categorySpend = Object.entries(periodTransactions.filter(t => t.amount < 0 && !isExcludedFromSpending(t)).reduce<Record<string, number>>((a, t) => { a[t.category] = (a[t.category] || 0) + -t.amount; return a; }, {})).sort((a,b) => b[1]-a[1]);
  const subcategorySpend = Object.entries(periodTransactions.filter(t => t.amount < 0 && !isExcludedFromSpending(t) && (category==="All categories"||t.category===category)).reduce<Record<string, number>>((a, t) => { const name=t.subcategory||inferSubcategory(t.category,t.merchant);a[name]=(a[name]||0)+-t.amount;return a; }, {})).sort((a,b)=>b[1]-a[1]);
  const breakdownSpend=category==="All categories"?categorySpend:subcategorySpend;
  const spending = categorySpend.reduce((s, [,v]) => s + v, 0);
  const income = periodTransactions.filter(t => t.amount > 0 && t.categoryGroup === "income").reduce((s,t) => s+t.amount, 0);
  const maxCategory = Math.max(...breakdownSpend.map(([,v]) => v), 1);
  const displayedTransactions=[...filtered].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,txLimit);
  const uncategorised=periodTransactions.filter(t=>t.amount<0&&needsReview(t)).length;
  const selectedBusinessExpenses=businessExpensePosition(periodTransactions);
  const allBusinessExpenses=useMemo(()=>businessExpensePosition(resolvedTransactions),[resolvedTransactions]);
  const payrollFallbacks=useMemo(()=>payrollFallbackEntries(store.payslips??[],store.transactions,payday,salaryDates,incomeSources),[store.payslips,store.transactions,payday,salaryDates,incomeSources]);
  const monthly = useMemo(() => {
    const map: Record<string, { income: number; spend: number; payslipFallback:number }> = {};
    resolvedTransactions.forEach(t => { if(!participatesInOverview(t,accountCoverage,store.imports))return;const k=transactionCycleKey(t,payday,salaryDates); map[k] ||= {income:0,spend:0,payslipFallback:0}; if(t.categoryGroup==="income"&&t.amount>0){map[k].income+=t.amount} else if(t.amount<0&&!isExcludedFromSpending(t)) map[k].spend+=-t.amount; });
    payrollFallbacks.forEach(({cycleKey,amount})=>{map[cycleKey] ||= {income:0,spend:0,payslipFallback:0};map[cycleKey].income+=amount;map[cycleKey].payslipFallback+=amount});
    // Keep a visual slot for every payroll month even when a handover payment
    // arrived just before the new salary-cycle boundary.
    (store.payslips??[]).forEach(payslip=>{const key=payslip.payDate.slice(0,7);map[key] ||= {income:0,spend:0,payslipFallback:0}});
    return Object.entries(map).sort().slice(-6).map(([key,value])=>[key,{...value,salaryIncome:salaryIncomeForMonth(resolvedTransactions,key,store.payslips??[],incomeSources),savingsUsed:savingsFundingUsed(resolvedTransactions.filter(transaction=>transactionCycleKey(transaction,payday,salaryDates)===key))}] as const);
  }, [resolvedTransactions,store.imports,store.payslips,accountCoverage,payday,salaryDates,payrollFallbacks,incomeSources]);
  const maxMonth = Math.max(...monthly.flatMap(([,v]) => [v.income+v.savingsUsed,v.salaryIncome,v.spend]),1);
  const latestMonth = monthly.at(-1)?.[1] ?? { income: 0, spend: 0 };
  const latestCycleKey=monthly.at(-1)?.[0]??payCycleKey(new Date().toISOString().slice(0,10),payday,salaryDates);
  const latestCycleTransactions=useMemo(()=>resolvedTransactions.filter(t=>transactionCycleKey(t,payday,salaryDates)===latestCycleKey),[resolvedTransactions,payday,salaryDates,latestCycleKey]);
  const latestCategorySpend=latestCycleTransactions.filter(t=>participatesInOverview(t,accountCoverage,store.imports)&&t.amount<0&&!isExcludedFromSpending(t)&&!(store.profile?.propertyConfig?.rentalMortgageMerchantKey&&merchantRuleKey(t.merchant)===store.profile.propertyConfig.rentalMortgageMerchantKey)).reduce<Record<string,number>>((a,t)=>{a[t.category]=(a[t.category]||0)-t.amount;return a},{});
  const savingsChallengeTransactions=useMemo(()=>store.transactions.filter(isSavingsChallengeTransfer),[store.transactions]);
  const currentSavingsChallenge=useMemo(()=>savingsChallengeTransactions.filter(transaction=>transaction.date.startsWith("2026-")&&transaction.amount<0),[savingsChallengeTransactions]);
  const savingsChallengeTotal=currentSavingsChallenge.reduce((sum,transaction)=>sum-transaction.amount,0);
  const savingsChallengeLatestCycle=currentSavingsChallenge.filter(transaction=>transactionCycleKey(transaction,payday,salaryDates)===latestCycleKey).reduce((sum,transaction)=>sum-transaction.amount,0);
  const latestSavingsChallengeTransfer=[...currentSavingsChallenge].sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
  const savingsChallengeDailyAmount=latestSavingsChallengeTransfer?Math.abs(latestSavingsChallengeTransfer.amount):0;
  const savingsChallengeNextDaily=savingsChallengeDailyAmount+.04;
  const savingsChallengeNext31=31/2*(2*savingsChallengeNextDaily+30*.04);
  const savingsChallengeDaysRemaining=latestSavingsChallengeTransfer?Math.max(0,Math.round((new Date("2026-12-31T12:00:00").getTime()-new Date(`${latestSavingsChallengeTransfer.date}T12:00:00`).getTime())/86400000)):0;
  const savingsChallengeProjectedYear=savingsChallengeTotal+savingsChallengeDaysRemaining/2*(2*savingsChallengeNextDaily+Math.max(0,savingsChallengeDaysRemaining-1)*.04);
  const savingsChallengeHistory=cycleKeys.slice(0,6).reverse().map(key=>({key,total:currentSavingsChallenge.filter(transaction=>transactionCycleKey(transaction,payday,salaryDates)===key).reduce((sum,transaction)=>sum-transaction.amount,0)}));
  const maxSavingsChallengeHistory=Math.max(...savingsChallengeHistory.map(item=>item.total),1);
  const savingsChallengeTracking=store.savingsChallengeTracking??baselineSavingsChallengeTracking;
  const savingsChallengeBalance=savingsChallengeTracking.balance;
  const savingsChallengeReconciliation=savingsChallengeBalance-savingsChallengeTotal;
  const planningIncome=store.profile?.planning?.income??0;
  const activeEmployerAnnualSalary=store.profile?.planning?.annualSalary??0;
  const activeEmployeePensionRate=store.profile?.planning?.employeePensionRate??0;
  const activeEmployerPensionRate=store.profile?.planning?.employerPensionRate??0;
  const employeePensionEstimate=activeEmployerAnnualSalary*activeEmployeePensionRate/12;
  const employerPension=activeEmployerAnnualSalary*activeEmployerPensionRate/12;
  const essentialCategories=store.profile?.categories?.filter(item=>item.enabled&&item.group==="essential").map(item=>item.name)??[];
  const lifestyleCategories=store.profile?.categories?.filter(item=>item.enabled&&item.group==="lifestyle").map(item=>item.name)??[];
  const rentalCategoryId=categoryFor(store.profile,store.profile?.propertyConfig?.rentalCategory??"")?.id;
  const isRentalCategory=useCallback((transaction:Tx)=>transaction.categoryGroup==="property"||Boolean(rentalCategoryId&&transaction.categoryId===rentalCategoryId),[rentalCategoryId]);
  const isMaintenance=(transaction:Tx)=>hasRole(transaction,"maintenance");
  const sensibleBudgetPlan:Record<string,number>=store.profile?.planning?.seedPlan??{};
  const coverageForCycle=(key:string)=>{const status=cycleCoverageStatus(key,payday,salaryDates,accountCoverage,store.imports,store.cardCoverageConfirmations,store.accountCoverageConfirmations);return {...status,hasMonzoGap:accountCoverage.currentGaps.some(gap=>gap.from<=status.bounds.end&&gap.to>=status.bounds.start),monzoComplete:status.currentComplete,cardComplete:status.creditComplete,cardHistoryStarted:status.creditHistoryStarted,confirmedCardThrough:status.confirmedCreditThrough,effectiveCardTo:status.effectiveCreditTo};};
  const cycleHasFullCoverage=(key:string)=>coverageForCycle(key).complete;
  const overviewCycleKey=overviewCycle==="latest"?currentCycleKey:overviewCycle;
  const overviewCycleTransactions=resolvedTransactions.filter(transaction=>transactionCycleKey(transaction,payday,salaryDates)===overviewCycleKey);
  const overviewSpendTransactions=overviewCycleTransactions.filter(transaction=>participatesInOverview(transaction,accountCoverage,store.imports)&&transaction.amount<0&&!isExcludedFromSpending(transaction));
  const overviewSpending=overviewSpendTransactions.reduce((sum,transaction)=>sum-transaction.amount,0);
  const overviewSpendingTreatments=spendingTreatmentSummary(overviewCycleTransactions);
  const overviewOneOffs=overviewSpendingTreatments["Planned one-off"]+overviewSpendingTreatments["Unplanned one-off"];
  const overviewUnderlyingSpending=overviewSpending-overviewOneOffs;
  const overviewIncome=monthly.find(([key])=>key===overviewCycleKey)?.[1].income??overviewCycleTransactions.filter(transaction=>participatesInOverview(transaction,accountCoverage,store.imports)&&transaction.categoryGroup==="income"&&transaction.amount>0).reduce((sum,transaction)=>sum+transaction.amount,0);
  const overviewSavingsTransactions=overviewCycleTransactions.filter(isPayYourselfFirstMovement);
  const netSavingsMovement=(transactions:Tx[])=>transactions.reduce((sum,transaction)=>sum-transaction.amount,0);
  const overviewSavings=netSavingsMovement(overviewSavingsTransactions);
  const overviewSavingsBreakdown=savingsMovementBreakdown(overviewCycleTransactions);
  const overviewMustPayTransactions=overviewSpendTransactions.filter(transaction=>historicalDirectDebitKeys.has(merchantRuleKey(transaction.merchant))||isMaintenance(transaction));
  const overviewMustPay=overviewMustPayTransactions.reduce((sum,transaction)=>sum-transaction.amount,0);
  const overviewFlexibleSpend=Math.max(0,overviewSpending-overviewMustPay);
  const overviewUnallocated=overviewIncome-overviewSpending-overviewSavings;
  const overviewSavingsRate=overviewIncome?overviewSavings/overviewIncome*100:0;
  const overviewExcludedMovements=overviewCycleTransactions.filter(transaction=>transaction.amount<0&&isExcludedFromSpending(transaction)).length;
  const overviewNeedsReview=overviewSpendTransactions.filter(needsReview).length;
  const overviewCategorySpend=Object.entries(overviewSpendTransactions.reduce<Record<string,number>>((result,transaction)=>{result[transaction.category]=(result[transaction.category]||0)-transaction.amount;return result},{})).sort(([,a],[,b])=>b-a);
  const overviewMaxCategory=Math.max(...overviewCategorySpend.map(([,amount])=>amount),1);
  const overviewComplete=cycleHasFullCoverage(overviewCycleKey);
  const overviewBankTransactions=overviewCycleTransactions.filter(transaction=>isCoveredTransaction(transaction,accountCoverage,store.imports));
  const overviewDataState: "complete"|"partial"|"awaiting"=overviewComplete?"complete":overviewBankTransactions.length?"partial":"awaiting";
  const overviewFlowReady=overviewDataState!=="awaiting";
  const formatCoverageDate=(date:string)=>date?regional.formatDate(date,{day:"numeric",month:"short"}):"Not loaded";
  const currentCycleTransactions=resolvedTransactions.filter(transaction=>transactionCycleKey(transaction,payday,salaryDates)===currentCycleKey);
  const currentCycleBankTransactions=currentCycleTransactions.filter(transaction=>isCoveredTransaction(transaction,accountCoverage,store.imports));
  const currentCycleComplete=cycleHasFullCoverage(currentCycleKey);
  const currentCycleDataState: "complete"|"partial"|"awaiting"=currentCycleComplete?"complete":currentCycleBankTransactions.length?"partial":"awaiting";
  const cycleAnnotations=store.cycleAnnotations??baselineCycleAnnotations;
  const completedCycleKeys=baselineEligibleCycles(monthly.map(([key])=>key),currentCycleKey,cycleHasFullCoverage,cycleAnnotations);
  const baselineCycleCount=Math.max(completedCycleKeys.length,1);
  const isRentalMortgage=useCallback((transaction:Tx)=>Boolean(store.profile?.propertyConfig?.rentalMortgageMerchantKey)&&merchantRuleKey(transaction.merchant)===store.profile?.propertyConfig?.rentalMortgageMerchantKey,[store.profile?.propertyConfig?.rentalMortgageMerchantKey]);
  const baselineCategorySpend=resolvedTransactions.filter(t=>participatesInOverview(t,accountCoverage,store.imports)&&completedCycleKeys.includes(payCycleKey(t.date,payday,salaryDates))&&t.amount<0&&!isExcludedFromSpending(t)&&!isRentalMortgage(t)&&!isRentalCategory(t)).reduce<Record<string,number>>((a,t)=>{a[t.category]=(a[t.category]||0)-t.amount;return a},{});
  const averageFor=(categoryName:string)=>Math.round(((baselineCategorySpend[categoryName]||0)/baselineCycleCount)/10)*10;
  const roundTo25=(value:number)=>Math.max(0,Math.round(value/25)*25);
  const rentalIncomeTransactions=store.transactions.filter(rentalIncomeTransaction).sort((a,b)=>a.date.localeCompare(b.date));
  const recentRentalIncome=rentalIncomeTransactions.slice(-6).map(transaction=>transaction.amount).sort((a,b)=>a-b);
  const typicalRentalIncome=recentRentalIncome.length?recentRentalIncome[Math.floor(recentRentalIncome.length/2)]:0;
  const typicalRentalMortgage=rentalMortgageCommitment?.monthlyEquivalent??0;
  const rentalPropertySurplus=typicalRentalIncome-typicalRentalMortgage;
  const rentalPropertyReserve=Math.min(100,Math.max(0,roundTo25(rentalPropertySurplus)));
  const recommendedCore:Record<string,number>=Object.fromEntries([...essentialCategories,...lifestyleCategories].map(name=>[name,store.profile?.planning?.seedPlan?.[name]??averageFor(name)]));
  for(const name of ["ISA habit","Annual-cost sinking funds"])recommendedCore[name]=store.profile?.planning?.seedPlan?.[name]??0;
  const recommendedBeforeEmergency=Object.values(recommendedCore).reduce((sum,value)=>sum+value,0);
  const recommendedEmergency=Math.max(300,Math.floor(Math.max(0,planningIncome-recommendedBeforeEmergency)/25)*25);
  const recommendedBudgetPlan:Record<string,number>={...recommendedCore,"Emergency fund":recommendedEmergency};
  const plannedFor=(name:string,fallback:number)=>Math.max(0,store.profile?.planning?.budgetPlan?.[name]??fallback);
  const lastPlanCycleKey=selectLastCompletedCycle(currentCycleKey,cycleKeys,cycleHasFullCoverage);
  const lastPlanCycleBounds=lastPlanCycleKey?cycleBounds(lastPlanCycleKey,payday,salaryDates):{start:"",end:""};
  const planningCycleBounds=cycleBounds(currentCycleKey,payday,salaryDates);
  const lastPlanCycleTransactions=resolvedTransactions.filter(transaction=>participatesInOverview(transaction,accountCoverage,store.imports)&&transactionCycleKey(transaction,payday,salaryDates)===lastPlanCycleKey);
  const lastPlanCycleSpend=lastPlanCycleTransactions.filter(transaction=>transaction.amount<0&&!isExcludedFromSpending(transaction)&&!isRentalMortgage(transaction)&&!isRentalCategory(transaction)).reduce<Record<string,number>>((result,transaction)=>{result[transaction.category]=(result[transaction.category]??0)-transaction.amount;return result},{});
  const planningMaintenanceHistory=resolvedTransactions.filter(transaction=>transaction.amount<0&&isMaintenance(transaction)).sort((a,b)=>a.date.localeCompare(b.date));
  const planningMaintenanceAmounts=planningMaintenanceHistory.slice(-3).map(transaction=>-transaction.amount).sort((a,b)=>a-b);
  const planningMaintenance=planningMaintenanceAmounts.length?planningMaintenanceAmounts[Math.floor(planningMaintenanceAmounts.length/2)]:0;
  const directDebitCommitmentDefinitions:RecurringCommitmentDefinition[]=detectedDirectDebitDefinitions(currentAccountRows,currentAccountRows.map(row=>row.date).sort().at(-1)??"");
  const explicitCommitmentDefinitions=explicitRecurringCommitments(resolvedTransactions,[],store.profile?.propertyConfig?.rentalCategory,store.profile);
  const maintenanceCommitmentDefinitions:RecurringCommitmentDefinition[]=planningMaintenance?[{key:"child-maintenance",label:"Child maintenance",category:planningMaintenanceHistory.at(-1)?.category??"Other",expected:planningMaintenance,scheduledAmount:planningMaintenance,frequency:"monthly",lastDate:planningMaintenanceHistory.at(-1)?.date??"",source:"Monthly · recurring transfer",payments:planningMaintenanceHistory.map(transaction=>({date:transaction.date,amount:-transaction.amount}))}]:[];
  const recurringEvidence=commitmentEvidence(store.transactions,directDebitCommitmentDefinitions,explicitCommitmentDefinitions,maintenanceCommitmentDefinitions);
  const recurringCommitmentRecords=reconcileRecurringCommitments(store.recurringCommitments,recurringEvidence,store.directDebitSettings);
  useEffect(()=>{setStore(current=>{const migrated=migrateRecurringCommitments(current,recurringEvidence);if(migrated!==current&&undoCommitted.current===current)undoCommitted.current=migrated;return migrated})},[store.transactions,store.directDebitSettings,store.recurringCommitments,recurringEvidence,setStore]);
  const recurringCommitmentDefinitions=activeCommitmentDefinitions(recurringCommitmentRecords,resolvedTransactions,dedupeRecurringCommitments(directDebitCommitmentDefinitions,explicitCommitmentDefinitions,maintenanceCommitmentDefinitions),store.profile?.propertyConfig,store.profile);
  const planningCommitmentDetails=recurringCommitmentDefinitions.map(row=>({
    key:row.id??row.key,label:row.label,category:categoryFor(store.profile,row.category)?.name??row.category,
    amount:expectedPlanCommitmentAmount({frequency:row.frequency,expected:row.expected,scheduledAmount:row.scheduledAmount,lastDate:row.lastDate,payments:row.payments,planningStart:planningCycleBounds.start,planningEnd:planningCycleBounds.end,lastCycleStart:lastPlanCycleBounds.start,lastCycleEnd:lastPlanCycleBounds.end}),
    source:row.source,
  })).filter(commitment=>commitment.amount>0);
  const essentialPlan=buildPlanRows({categories:essentialCategories,lastCycleSpend:lastPlanCycleSpend,commitments:planningCommitmentDetails,storedPlan:store.profile?.planning?.budgetPlan}).map(row=>({...row,actual:row.lastCycleActual,recommended:row.plannedAmount,amount:row.plannedAmount}));
  const lifestylePlan=buildPlanRows({categories:lifestyleCategories,lastCycleSpend:lastPlanCycleSpend,commitments:planningCommitmentDetails,storedPlan:store.profile?.planning?.budgetPlan}).map(row=>({...row,actual:row.lastCycleActual,recommended:row.plannedAmount,amount:row.plannedAmount}));
  const essentialsTotal=essentialPlan.reduce((sum,item)=>sum+item.amount,0);
  const lifestyleTotal=lifestylePlan.reduce((sum,item)=>sum+item.amount,0);
  const futurePlan=[{name:"Emergency fund",recommended:recommendedBudgetPlan["Emergency fund"],amount:plannedFor("Emergency fund",sensibleBudgetPlan["Emergency fund"]??0)},{name:"ISA habit",recommended:recommendedBudgetPlan["ISA habit"],amount:plannedFor("ISA habit",sensibleBudgetPlan["ISA habit"]??0)},{name:"Annual-cost sinking funds",recommended:recommendedBudgetPlan["Annual-cost sinking funds"],amount:plannedFor("Annual-cost sinking funds",sensibleBudgetPlan["Annual-cost sinking funds"]??0)}];
  const emergencyContribution=futurePlan[0].amount;
  const futureTotal=futurePlan.reduce((sum,item)=>sum+item.amount,0);const nextCyclePlanSummary=summarizeNextCyclePlan({planningIncome,essentials:essentialPlan,lifestyle:lifestylePlan,futureTotal});const flexibleBuffer=nextCyclePlanSummary.unallocated;const threeMonthFund=essentialsTotal*3;const liquidForEmergency=Math.max(0,totals.netLiquid);const emergencyGap=Math.max(0,threeMonthFund-liquidForEmergency);const emergencyMonths=emergencyContribution>0?Math.ceil(emergencyGap/emergencyContribution):0;
  const selectedBudgetCycle=budgetCycle==="latest"?latestCycleKey:budgetCycle;
  const selectedCycleCoverage=coverageForCycle(selectedBudgetCycle);
  const selectedBudgetComplete=cycleHasFullCoverage(selectedBudgetCycle);
  const selectedBudgetTransactions=useMemo(()=>resolvedTransactions.filter(t=>transactionCycleKey(t,payday,salaryDates)===selectedBudgetCycle),[resolvedTransactions,payday,salaryDates,selectedBudgetCycle]);
  const selectedBudgetBankTransactions=selectedBudgetTransactions.filter(transaction=>isCoveredTransaction(transaction,accountCoverage,store.imports));
  const selectedBudgetDataState: "complete"|"partial"|"awaiting"=selectedBudgetComplete?"complete":selectedBudgetBankTransactions.length?"partial":"awaiting";
  const selectedPayYourselfFirstTransactions=useMemo(()=>selectedBudgetTransactions.filter(isPayYourselfFirstMovement),[selectedBudgetTransactions]);
  const selectedPayYourselfFirst=netSavingsMovement(selectedPayYourselfFirstTransactions);
  const selectedCyclePayslip=(store.payslips??[]).find(payslip=>payslip.payDate.slice(0,7)===selectedBudgetCycle);
  const commitmentTransactionIds=new Map(groupCommitmentTransactions(resolvedTransactions).map(group=>[group.id,new Set(group.transactions.map(transaction=>transaction.id))]));
  const fixedCommitments=recurringCommitmentDefinitions.map(row=>{const ids=commitmentTransactionIds.get(row.evidenceId??row.id??`merchant:${row.key}`);const paid=selectedBudgetTransactions.filter(transaction=>transaction.amount<0&&(row.key==="child-maintenance"?isMaintenance(transaction):ids?.has(transaction.id))).reduce((sum,transaction)=>sum-transaction.amount,0);return {...row,paid}}).sort((a,b)=>b.expected-a.expected);
  const fixedCommitmentExpected=fixedCommitments.reduce((sum,row)=>sum+row.expected,0);
  const fixedCommitmentPaid=fixedCommitments.reduce((sum,row)=>sum+row.paid,0);
  const fixedCommitmentBudgetCovered=fixedCommitments.reduce((sum,row)=>sum+Math.min(row.paid,row.expected),0);
  const fixedCommitmentReserved=Math.max(0,fixedCommitmentExpected-fixedCommitmentBudgetCovered);
  const selectedNonMonthlyCollections=selectedBudgetTransactions.filter(transaction=>transaction.amount<0&&nonMonthlyDirectDebits.some(row=>row.key===merchantRuleKey(transaction.merchant))).reduce((sum,transaction)=>sum-transaction.amount,0);
  const selectedTvLicenceSpend=selectedBudgetTransactions.filter(transaction=>transaction.amount<0&&merchantRuleKey(transaction.merchant)==="tv licensing").reduce((sum,transaction)=>sum-transaction.amount,0);
  const selectedRentalOperatingSpend=selectedBudgetTransactions.filter(transaction=>transaction.amount<0&&!isExcludedFromSpending(transaction)&&isRentalCategory(transaction)).reduce((sum,transaction)=>sum-transaction.amount,0);
  const selectedBudgetCategorySpend=useMemo(()=>selectedBudgetTransactions.filter(t=>participatesInOverview(t,accountCoverage,store.imports)&&t.amount<0&&!isExcludedFromSpending(t)&&!isRentalMortgage(t)&&!isRentalCategory(t)).reduce<Record<string,number>>((a,t)=>{a[t.category]=(a[t.category]||0)-t.amount;return a},{}),[selectedBudgetTransactions,accountCoverage,store.imports,isRentalCategory,isRentalMortgage]);
  const selectedBudgetSpend=Object.values(selectedBudgetCategorySpend).reduce((sum,value)=>sum+value,0);
  const selectedLifestyleSpend=lifestyleCategories.reduce((sum,name)=>sum+(selectedBudgetCategorySpend[name]||0),0);
  const selectedEssentialSpend=essentialCategories.reduce((sum,name)=>sum+(selectedBudgetCategorySpend[name]||0),0);
  const lifestyleRemaining=lifestyleTotal-selectedLifestyleSpend;
  const lifestyleUsed=lifestyleTotal?selectedLifestyleSpend/lifestyleTotal*100:0;
  const selectedRentalMortgageSpend=selectedBudgetTransactions.filter(transaction=>transaction.amount<0&&isRentalMortgage(transaction)).reduce((sum,transaction)=>sum-transaction.amount,0);
  const selectedPrimaryMortgageSpend=selectedBudgetTransactions.filter(transaction=>transaction.amount<0&&spendingAccountIds.includes(transactionAccountId(transaction,store.imports??[],spendingAccountIds)??"")&&merchantRuleKey(transaction.merchant)===store.profile?.propertyConfig?.homeMortgageMerchantKey).reduce((sum,transaction)=>sum-transaction.amount,0);
  const selectedHousingSpend=(selectedBudgetCategorySpend[categoryFor(store.profile,"Housing")?.name??"Housing"]||0)+selectedRentalMortgageSpend;
  const selectedOtherHousingSpend=Math.max(0,selectedHousingSpend-selectedPrimaryMortgageSpend-selectedRentalMortgageSpend);
  const selectedTotalCashOut=selectedBudgetSpend+selectedRentalMortgageSpend+selectedRentalOperatingSpend;
  const selectedBudgetIncome=monthly.find(([key])=>key===selectedBudgetCycle)?.[1].income??selectedBudgetTransactions.filter(t=>participatesInOverview(t,accountCoverage,store.imports)&&t.amount>0&&t.categoryGroup==="income").reduce((sum,t)=>sum+t.amount,0);
  const selectedCycleRentIncome=selectedBudgetTransactions.filter(rentalIncomeTransaction).reduce((sum,transaction)=>sum+transaction.amount,0);
  // The card's total is cash-flow-cycle based. Salary itself is explicitly
  // reported by payroll month, so an employer handover cannot distort it.
  const selectedCycleSalaryIncome=salaryIncomeForMonth(store.transactions,selectedBudgetCycle,store.payslips??[]);
  const selectedCycleCashFlow=selectedBudgetIncome-selectedTotalCashOut;
  const selectedMustPayOut=fixedCommitmentPaid+selectedRentalMortgageSpend+selectedRentalOperatingSpend;
  const selectedFlexibleCashOut=Math.max(0,selectedBudgetSpend-fixedCommitmentPaid);
  const selectedEveryPoundRemaining=selectedBudgetIncome-selectedMustPayOut-selectedFlexibleCashOut-selectedPayYourselfFirst;
  const selectedEveryPoundAllocated=selectedMustPayOut+selectedFlexibleCashOut+selectedPayYourselfFirst;
  const selectedPayYourselfFirstProgress=futureTotal?Math.max(0,selectedPayYourselfFirst/futureTotal*100):0;
  const selectedCycleLatestDate=selectedBudgetTransactions.map(transaction=>transaction.date).filter(Boolean).sort().at(-1)??"";
  const selectedCycleIsLive=selectedBudgetCycle===currentCycleKey;
  const selectedCycleDataLabel=selectedCycleLatestDate?regional.formatDate(selectedCycleLatestDate,{day:"numeric",month:"short",year:"numeric"}):"No transactions imported";
  const spendingPlan=essentialsTotal+lifestyleTotal;
  const budgetRemaining=spendingPlan-selectedBudgetSpend;
  const budgetUsed=spendingPlan?selectedBudgetSpend/spendingPlan*100:0;
  const planRows=[...essentialPlan,...lifestylePlan];
  const baselineMonthlyActual=planRows.reduce((sum,item)=>sum+item.actual,0);const housingEvidence=averageFor(categoryFor(store.profile,"Housing")?.name??"Housing");
  const personalDirectDebitTotal=Math.max(0,monthlyDirectDebitTotal-typicalRentalMortgage);
  const variableMonthlyActual=Math.max(0,baselineMonthlyActual-personalDirectDebitTotal);
  const recommendedPlanTotal=Object.values(recommendedBudgetPlan).reduce((sum,value)=>sum+value,0);
  const recommendedPlanBuffer=planningIncome-recommendedPlanTotal;
  const completedCycleReview=completedCycleKeys.map(key=>{const transactions=resolvedTransactions.filter(transaction=>payCycleKey(transaction.date,payday,salaryDates)===key);const personalSpend=transactions.filter(transaction=>transaction.amount<0&&!isExcludedFromSpending(transaction)&&!isRentalMortgage(transaction)&&!isRentalCategory(transaction)).reduce((sum,transaction)=>sum-transaction.amount,0);const salary=salaryIncomeForMonth(resolvedTransactions,key,store.payslips??[],incomeSources);const rent=transactions.filter(rentalIncomeTransaction).reduce((sum,transaction)=>sum+transaction.amount,0);return {key,personalSpend,salary,rent}});
  const maxCompletedSpend=Math.max(...completedCycleReview.map(item=>item.personalSpend),1);
  const travelCategoryName=categoryFor(store.profile,"Travel")?.name??"Travel";
  const travelEvidenceByCycle=completedCycleKeys.map(key=>resolvedTransactions.filter(transaction=>payCycleKey(transaction.date,payday,salaryDates)===key&&transaction.amount<0&&transaction.categoryId==="category:travel").reduce((sum,transaction)=>sum-transaction.amount,0));const travelPlan=lifestylePlan.find(item=>item.name===travelCategoryName)?.amount??0;
  const categoryOverages=planRows.filter(item=>(selectedBudgetCategorySpend[item.name]||0)>item.amount&&item.amount>0).sort((a,b)=>((selectedBudgetCategorySpend[b.name]||0)-b.amount)-((selectedBudgetCategorySpend[a.name]||0)-a.amount));
  const essentialOverBudgetCategories=categoryOverages.filter(item=>essentialCategories.includes(item.name));
  const lifestyleOverBudgetCategories=categoryOverages.filter(item=>lifestyleCategories.includes(item.name));
  const flexCoveredCategories=lifestyleRemaining>=0?lifestyleOverBudgetCategories:[];
  const overBudgetCategories=[...essentialOverBudgetCategories,...(lifestyleRemaining<0?lifestyleOverBudgetCategories:[])];
  const selectedUnreviewed=selectedBudgetTransactions.filter(t=>participatesInOverview(t,accountCoverage,store.imports)&&t.amount<0&&needsReview(t)).length;
  const cycleCloseouts=useMemo(()=>[...(store.cycleCloseouts??[])].sort((a,b)=>b.closedAt.localeCompare(a.closedAt)),[store.cycleCloseouts]);
  const selectedCloseout=cycleCloseouts.find(closeout=>closeout.cycle===selectedBudgetCycle);
  const selectedCloseoutNote=closeoutNotes[selectedBudgetCycle]??selectedCloseout?.note??"";
  const balanceReconciliations=useMemo(()=>[...(store.balanceReconciliations??[])].sort((a,b)=>b.reconciledAt.localeCompare(a.reconciledAt)),[store.balanceReconciliations]);
  const latestBalanceReconciliation=balanceReconciliations[0];
  const reconcileActual=reconcileBalance.trim()===""?null:Number(reconcileBalance);
  const reconcileDifference=reconcileActual===null||!Number.isFinite(reconcileActual)?null:reconcileActual-legacyCurrentBalance;
  const latestRepeatedSmallGroups=Object.values(latestCycleTransactions.filter(transaction=>transaction.amount<0&&!isCardRepayment(transaction)&&-transaction.amount<=15&&transaction.categoryGroup==="lifestyle").reduce<Record<string,{label:string;count:number;total:number}>>((groups,transaction)=>{const key=merchantRuleKey(transaction.merchant)||transaction.merchant.toLowerCase();groups[key]??={label:transaction.merchant,count:0,total:0};groups[key].count+=1;groups[key].total-=transaction.amount;return groups},{})).filter(group=>group.count>=3).sort((a,b)=>b.total-a.total);
  const latestRepeatedSmallSpend=latestRepeatedSmallGroups.reduce((sum,group)=>sum+group.total,0);
  const latestNeedsReview=latestCycleTransactions.filter(transaction=>participatesInOverview(transaction,accountCoverage,store.imports)&&transaction.amount<0&&needsReview(transaction)).length;
  const focusableCategories=[...essentialCategories,...lifestyleCategories];
  const latestLifestyleSpend=lifestyleCategories.reduce((sum,name)=>sum+(latestCategorySpend[name]||0),0);
  const latestLifestyleCovered=latestLifestyleSpend<=lifestyleTotal;
  const latestOverPlan=planRows.filter(item=>focusableCategories.includes(item.name)&&item.amount>0&&(latestCategorySpend[item.name]||0)>item.amount&&(!lifestyleCategories.includes(item.name)||!latestLifestyleCovered)).sort((a,b)=>((latestCategorySpend[b.name]||0)-b.amount)-((latestCategorySpend[a.name]||0)-a.amount));
  const topFocusCategory=latestOverPlan[0];
  const monthlyFocus=latestRepeatedSmallSpend>=50&&latestRepeatedSmallGroups.reduce((sum,group)=>sum+group.count,0)>=5
    ?{kind:"small",title:"Small spending is adding up.",copy:`${gbp.format(latestRepeatedSmallSpend)} has gone across ${latestRepeatedSmallGroups.reduce((sum,group)=>sum+group.count,0)} repeat small payments this cycle. Review the merchants and keep only what is genuinely useful.`,progress:Math.min(100,latestRepeatedSmallSpend/150*100),metric:`${gbp.format(latestRepeatedSmallSpend)} flagged`}
    :topFocusCategory
      ?{kind:"category",title:`${topFocusCategory.name} is over its plan.`,copy:`You have spent ${gbp.format(latestCategorySpend[topFocusCategory.name]||0)} against a ${gbp.format(topFocusCategory.amount)} cycle plan. Check whether this is a one-off or a pattern worth tightening.`,progress:Math.min(100,(latestCategorySpend[topFocusCategory.name]||0)/topFocusCategory.amount*100),metric:`${gbp.format((latestCategorySpend[topFocusCategory.name]||0)-topFocusCategory.amount)} over`}
      :latestNeedsReview>=5
        ?{kind:"review",title:"Clean up the unclear spending.",copy:`${latestNeedsReview} outgoing transactions still need a reliable category. Classifying them will make the budget and leakage recommendations more accurate.`,progress:Math.min(100,latestNeedsReview/15*100),metric:`${latestNeedsReview} to review`}
        :{kind:"cash",title:"Build the cushion first.",copy:`Your retirement position is strong. The clearest next move is growing accessible cash from ${gbp.format(liquidForEmergency)} toward ${gbp.format(threeMonthFund)}.`,progress:threeMonthFund?Math.min(100,liquidForEmergency/threeMonthFund*100):0,metric:`${gbp.format(emergencyGap)} to go`};
  const latestImportedCycleTransactions=resolvedTransactions.filter(transaction=>transactionCycleKey(transaction,payday,salaryDates)===latestDataCycleKey);
  const latestImportedNeedsReview=latestImportedCycleTransactions.filter(transaction=>participatesInOverview(transaction,accountCoverage,store.imports)&&transaction.amount<0&&!isExcludedFromSpending(transaction)&&needsReview(transaction));
  const latestImportedNeedsReviewSpend=latestImportedNeedsReview.reduce((sum,transaction)=>sum-transaction.amount,0);
  const currentActivityStale=!accountCoverage.current.length||accountCoverage.current.some(account=>!accountFreshness(account,todayIso));
  const creditActivityStale=accountCoverage.credit.some(account=>!accountFreshness(account,todayIso));
  const cfoAttentionItems=[
    ...(currentActivityStale?[{key:"data",tone:"amber",title:accountCoverage.current.some(account=>account.to)?"Current-account activity is more than a week behind":"Current-account activity has not been imported",copy:"The live cycle remains open while spending arrives. Import the latest transactions for each required current account.",action:"Update data"}]:[]),
    ...(liquidForEmergency<threeMonthFund?[{key:"liquidity",tone:"red",title:"Accessible cash remains the main constraint",copy:`${gbp.format(liquidForEmergency)} is available after card debt, equal to ${(liquidForEmergency/essentialsTotal).toFixed(1)} months of planned essentials.`,action:"Open cash plan"}]:[]),
    ...(latestImportedNeedsReview.length?[{key:"review",tone:"amber",title:`${latestImportedNeedsReview.length} outgoing${latestImportedNeedsReview.length===1?" needs":"s need"} a reliable category`,copy:`${gbp.format(latestImportedNeedsReviewSpend)} in the latest imported cycle can still distort where your money went.`,action:"Review transactions"}]:[]),
    ...(travelPlan>0&&averageFor(travelCategoryName)>travelPlan*2?[{key:"travel",tone:"blue",title:"The travel plan is below your real pattern",copy:`Complete cycles average ${gbp.format(averageFor(travelCategoryName))}, while the repeatable plan is ${gbp.format(travelPlan)}. Treat this as an annual choice, not a monthly failure.`,action:"Review budget"}]:[]),
  ].slice(0,4);
  const latestMonzoImport=(store.imports??[]).filter(item=>(item.source??"Monzo")==="Monzo").sort((a,b)=>b.importedAt.localeCompare(a.importedAt))[0];
  const latestCardImport=(store.imports??[]).filter(item=>item.source==="Barclaycard").sort((a,b)=>b.importedAt.localeCompare(a.importedAt))[0];
  const currentMonthKey=new Date().toISOString().slice(0,7);
  const hasCurrentSnapshot=(store.snapshots??[]).some(snapshot=>snapshot.date.startsWith(currentMonthKey));
  const reconciliationAligned=Boolean(latestBalanceReconciliation&&latestBalanceReconciliation.transactionsThrough===legacyCurrentThrough&&Math.abs(latestBalanceReconciliation.difference)<.01);
  const latestSnapshotDate=[...(store.snapshots??[])].sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.date??"";
  const balanceFreshness=requiredBalanceFreshness(accountCoverage,store.balances,todayIso,latestSnapshotDate);
  const balanceDataStale=!latestSnapshotDate||shiftIsoDate(latestSnapshotDate,35)<todayIso||!balanceFreshness.fresh;
  const freshnessState:"complete"|"partial"|"awaiting"=!accountCoverage.required.some(account=>account.to)?"awaiting":currentActivityStale||creditActivityStale||balanceDataStale?"partial":"complete";
  const freshnessTitle=freshnessState==="complete"?"Your dashboard is current":freshnessState==="awaiting"?"Import activity to begin":"Some information needs refreshing";
  const lastBackupAge=backupAgeInDays(store.lastBackupAt,todayIso);
  const backupDue=lastBackupAge===null||lastBackupAge>30;
  const backupStatusLabel=lastBackupAge===null?"No safety backup recorded yet":lastBackupAge===0?"Safety backup downloaded today":`Last safety backup ${lastBackupAge} day${lastBackupAge===1?"":"s"} ago`;
  const currentCyclePayslip=payslipForCycle(store.payslips??[],currentCycleKey);
  const reconciliationPayslip=currentCyclePayslip??latestPayslipRecord(store.payslips??[]);
  const dataHealthChecks=[
    {key:"monzo",label:"Current-account activity",value:accountCoverage.current.length?accountCoverage.current.every(account=>account.to)?`Through ${formatCoverageDate(accountCoverage.currentTo)}`:"Not fully imported":"Not configured",status:accountCoverage.current.length&&!currentActivityStale?"good":"attention",action:"Import CSV"},
    {key:"card",label:"Credit-card activity",value:accountCoverage.credit.length?accountCoverage.credit.every(account=>account.to)?`Through ${formatCoverageDate(accountCoverage.creditTo)}`:"Not fully imported":"Not required",status:creditActivityStale?"attention":"good",action:"Import statement"},
    {key:"pay",label:"Latest payslip",value:reconciliationPayslip?`${regional.formatDate(reconciliationPayslip.payDate,{month:"short",year:"numeric"})}${currentCyclePayslip?" · recorded":" · previous cycle"}`:"Not recorded",status:currentCyclePayslip?"good":"neutral",action:"Upload payslip"},
    {key:"review",label:"Categorisation",value:latestImportedNeedsReview.length?`${latestImportedNeedsReview.length} need review`:"All clear",status:latestImportedNeedsReview.length?"attention":"good",action:"Review"},
    {key:"balance",label:"Current-account balance",value:balanceFreshness.asOf?`As of ${formatCoverageDate(balanceFreshness.asOf)}`:"Not dated",status:balanceFreshness.fresh?"good":"attention",action:"Reconcile"},
    {key:"snapshot",label:"Net-worth snapshot",value:hasCurrentSnapshot?"Saved this month":"Not saved this month",status:hasCurrentSnapshot?"good":"neutral",action:"Save snapshot"},
    {key:"backup",label:"Safety backup",value:backupStatusLabel,status:backupDue?"attention":"good",action:"Download"},
  ] as const;
  const dataHealthReady=dataHealthChecks.filter(check=>check.status==="good").length;
  const paydayAllocationsMoved=store.paydayAllocationsMoved?.[selectedBudgetCycle]??false;
  const variableSpendingPlan=Math.max(0,spendingPlan-fixedCommitmentExpected);
  const variableSpendSoFar=Math.max(0,selectedBudgetSpend-fixedCommitmentPaid);
  const remainingVariablePlan=Math.max(0,variableSpendingPlan-variableSpendSoFar);
  const variablePlanMargin=planningCash.current-remainingVariablePlan;
  const currentBalanceKnown=planningCash.currentAccounts.some(account=>Boolean(account.asOf)||account.value!==0);
  const legacyPotPlanning=store.profile?.origin==="legacy"&&store.balances.some(account=>account.id==="monzo-current");
  const spendableBalanceReady=currentBalanceKnown&&(!legacyPotPlanning||paydayAllocationsMoved);
  const genuineSpend=selectedBudgetTransactions.filter(transaction=>transaction.amount<0&&!isExcludedFromSpending(transaction));
  const repeatedSmallGroups=Object.values(genuineSpend.filter(transaction=>-transaction.amount<=15&&transaction.categoryGroup==="lifestyle").reduce<Record<string,{key:string;label:string;count:number;total:number;transactions:Tx[]}>>((groups,transaction)=>{const key=merchantRuleKey(transaction.merchant)||transaction.merchant.toLowerCase();groups[key]??={key,label:transaction.merchant,count:0,total:0,transactions:[]};groups[key].count+=1;groups[key].total-=transaction.amount;groups[key].transactions.push(transaction);return groups},{})).filter(group=>group.count>=3).sort((a,b)=>b.total-a.total);
  const feeTransactions=genuineSpend.filter(transaction=>/fee|interest|overdraft|late payment|cash advance/i.test(transaction.merchant));
  const subscriptionTransactions=genuineSpend.filter(transaction=>(transaction.subcategory||inferSubcategory(transaction.category,transaction.merchant))==="Subscriptions"||/netflix|spotify|audible|amazon prime|openai|subscription/i.test(transaction.merchant));
  const reviewTransactions=genuineSpend.filter(needsReview);
  const duplicateGroups=Object.values(genuineSpend.reduce<Record<string,{key:string;label:string;count:number;total:number;transactions:Tx[]}>>((groups,transaction)=>{const key=transactionKey(transaction);groups[key]??={key,label:transaction.merchant,count:0,total:0,transactions:[]};groups[key].count+=1;groups[key].total-=transaction.amount;groups[key].transactions.push(transaction);return groups},{})).filter(group=>group.count>1);
  const increasedDirectDebits=activeDirectDebits.filter(row=>row.expected>0&&row.lastAmount>row.expected*1.1&&row.lastAmount-row.expected>=2);
  const flaggedTransactions=new Map<string,Tx>();[...feeTransactions,...reviewTransactions,...repeatedSmallGroups.flatMap(group=>group.transactions),...duplicateGroups.flatMap(group=>group.transactions)].forEach(transaction=>flaggedTransactions.set(transaction.id,transaction));
  const reviewableSpend=[...flaggedTransactions.values()].reduce((sum,transaction)=>sum-transaction.amount,0);
  const repeatedSmallSpend=repeatedSmallGroups.reduce((sum,group)=>sum+group.total,0);
  const subscriptionSpend=subscriptionTransactions.reduce((sum,transaction)=>sum-transaction.amount,0);
  const leakageRate=selectedBudgetSpend?reviewableSpend/selectedBudgetSpend*100:0;
  const scoreCycleKey=completedCycleKeys.at(-1)??latestCycleKey;
  const scoreMonth=monthly.find(([key])=>key===scoreCycleKey)?.[1]??latestMonth;
  const scoreCashFlow=scoreMonth.income-scoreMonth.spend;
  const scoreCycleTransactions=resolvedTransactions.filter(transaction=>transactionCycleKey(transaction,payday,salaryDates)===scoreCycleKey);
  const scorePayYourselfFirst=scoreCycleTransactions.filter(isPayYourselfFirstMovement).reduce((sum,transaction)=>sum-transaction.amount,0);
  const savingsRate = scoreMonth.income > 0 ? Math.max(0, scorePayYourselfFirst/scoreMonth.income*100) : 0;
  const cashFlowMargin = scoreMonth.income > 0 ? scoreCashFlow/scoreMonth.income*100 : 0;
  const scoreCycleNote=`Most recent complete cycle · ${cycleLabel(scoreCycleKey,payday,salaryDates)}`;
  const emergencyGoal = goals.find(g=>g.id==="ef") ?? {id:"ef",name:"Emergency fund",target:0,current:0,colour:"#167c63"};
  const cashProgress = emergencyGoal.target>0?Math.min(liquidForEmergency/emergencyGoal.target*100,100):0;
  const debtRatio = totals.assets ? totals.debt/totals.assets*100 : 0;
  const snapshots = useMemo(()=>store.snapshots ?? initialStore.snapshots ?? [],[store.snapshots]);
  const currentHealthInputs:HealthInputs={cashProgress,savingsRate,cashFlowMargin,debtRatio};
  const hasRecordedBalance=(balance:Balance)=>Boolean(balance.asOf)||balance.value!==0;
  const healthReadiness=assessHealthReadiness({
    hasAssetBalance:store.balances.some(balance=>balance.group==="asset"&&hasRecordedBalance(balance)),
    hasCashBalance:store.balances.some(balance=>isCashAccount(balance)&&hasRecordedBalance(balance)),
    hasDebtBalance:store.balances.some(balance=>balance.group==="liability"&&hasRecordedBalance(balance)),
    completeCycles:completedCycleKeys.length,
  });
  const healthScore=calculateHealthScore(currentHealthInputs);
  const activeSection=parentSection(tab);
  const reviewCycleOptions=cycleKeys.filter(key=>key<currentCycleKey).slice(0,12);
  const reviewCycleKey=reviewCycleSelection==="latest"?lastCompletedCycleKey:reviewCycleSelection;
  const reviewCycleTransactions=resolvedTransactions.filter(transaction=>transactionCycleKey(transaction,payday,salaryDates)===reviewCycleKey);
  const reviewCycleSummary=monthly.find(([key])=>key===reviewCycleKey)?.[1]??{income:0,spend:0,payslipFallback:0};
  const reviewSpendingTreatments=spendingTreatmentSummary(reviewCycleTransactions);
  const reviewPlannedOneOffs=reviewSpendingTreatments["Planned one-off"];
  const reviewUnplannedOneOffs=reviewSpendingTreatments["Unplanned one-off"];
  const reviewUnderlyingSpending=reviewSpendingTreatments.Recurring+reviewSpendingTreatments["Normal variable"];
  const reviewCycleAnnotation=cycleAnnotations[reviewCycleKey]??{kind:"Normal" as const,excludeFromBaseline:false};
  const reviewSaved=netSavingsMovement(reviewCycleTransactions.filter(isPayYourselfFirstMovement));
  const reviewCategorySpend=Object.entries(reviewCycleTransactions.filter(transaction=>participatesInOverview(transaction,accountCoverage,store.imports)&&transaction.amount<0&&!isExcludedFromSpending(transaction)).reduce<Record<string,number>>((result,transaction)=>{result[transaction.category]=(result[transaction.category]||0)-transaction.amount;return result},{})).sort(([,a],[,b])=>b-a);
  const reviewTopCategory=reviewCategorySpend[0];
  const reviewNeedsReview=reviewCycleTransactions.filter(transaction=>participatesInOverview(transaction,accountCoverage,store.imports)&&transaction.amount<0&&!isExcludedFromSpending(transaction)&&needsReview(transaction)).length;
  const reviewCycleCoverage=coverageForCycle(reviewCycleKey);const reviewCycleComplete=cycleHasFullCoverage(reviewCycleKey);const reviewCloseout=(store.cycleCloseouts??[]).find(closeout=>closeout.cycle===reviewCycleKey);const reviewCloseoutNote=closeoutNotes[reviewCycleKey]??reviewCloseout?.note??"";
  const reviewPayslip=payslipForCycle(store.payslips??[],reviewCycleKey);
  const reviewChecks=reviewReadiness({coverageComplete:reviewCycleCoverage.complete,missingAccounts:reviewCycleCoverage.accounts.filter(account=>!account.complete).map(account=>account.name),payslipRecorded:Boolean(reviewPayslip),unreviewed:reviewNeedsReview});
  const reviewChanged=closeoutHasChanged(reviewCloseout,reviewCycleSummary.income,reviewCycleSummary.spend,reviewSaved);
  const reviewDataHealthChecks=[
    {key:"monzo",label:"Current-account activity",value:reviewCycleCoverage.currentComplete?`Complete through ${formatCoverageDate(reviewCycleCoverage.bounds.end)}`:`Through ${formatCoverageDate(accountCoverage.currentTo)}`,status:reviewCycleCoverage.currentComplete?"good":"attention",action:"Import CSV"},
    {key:"card",label:"Credit-card activity",value:reviewCycleCoverage.creditComplete?accountCoverage.credit.length?`Reviewed through ${formatCoverageDate(reviewCycleCoverage.bounds.end)}`:"Not required":`Through ${formatCoverageDate(reviewCycleCoverage.effectiveCreditTo)}`,status:reviewCycleCoverage.creditComplete?"good":"attention",action:"Review card"},
    {key:"pay",label:"Payslip",value:reviewPayslip?regional.formatDate(reviewPayslip.payDate,{month:"short",year:"numeric"}):"Not recorded",status:reviewPayslip?"good":"neutral",action:"Upload payslip"},
    {key:"review",label:"Categorisation",value:reviewNeedsReview?`${reviewNeedsReview} need review`:"All clear",status:reviewNeedsReview?"attention":"good",action:"Review"},
    {key:"balance",label:"Current-account balance",value:balanceFreshness.asOf?`As of ${formatCoverageDate(balanceFreshness.asOf)}`:"Not dated",status:balanceFreshness.fresh?"good":"neutral",action:"Reconcile"},
    {key:"snapshot",label:"Closeout snapshot",value:reviewCloseout?"Saved with closeout":"Saved when cycle closes",status:reviewCloseout?"good":"neutral",action:"Close cycle"},
    {key:"backup",label:"Safety backup",value:backupStatusLabel,status:backupDue?"attention":"good",action:"Download"},
  ] as const;
  const reviewDataHealthReady=reviewDataHealthChecks.filter(check=>check.status==="good").length;
  const priorReviewCycle=monthly.map(([key])=>key).filter(key=>key<reviewCycleKey&&cycleHasFullCoverage(key)&&!cycleAnnotations[key]?.excludeFromBaseline).at(-1)??"";
  const priorReviewSummary=monthly.find(([key])=>key===priorReviewCycle)?.[1];
  const reviewSpendChange=priorReviewSummary?reviewCycleSummary.spend-priorReviewSummary.spend:0;
  const snapshotCashChange=cashChange(snapshots);
  const reviewComparisonLabel=priorReviewSummary?`Compared with ${cycleLabel(priorReviewCycle,payday,salaryDates)}`:"First comparable cycle";
  const reviewSpendSentence=!priorReviewSummary?`${gbp.format(reviewCycleSummary.spend)} of spending is recorded for this cycle.`:reviewSpendChange===0?"Spending was unchanged from the last normal cycle.":`Spending was ${gbp.format(Math.abs(reviewSpendChange))} ${reviewSpendChange>0?"higher":"lower"} than the last normal cycle.`;
  const reviewMonthlyNarrative=[
    reviewSpendSentence,
    reviewSaved>0?`${gbp.format(reviewSaved)} was paid to savings and investments.`:reviewSaved<0?`${gbp.format(Math.abs(reviewSaved))} was drawn back from savings.`:"No pay-yourself-first movement is recorded.",
    snapshotCashChange?`The latest cash snapshot is ${gbp.format(Math.abs(snapshotCashChange))} ${snapshotCashChange>0?"higher":"lower"}.`:"Another balance snapshot will establish the cash trend.",
    reviewTopCategory?`${reviewTopCategory[0]} was the largest category at ${gbp.format(reviewTopCategory[1])}.`:"",
  ].filter(Boolean).join(" ");
  const reviewActionTitle=reviewNeedsReview?"Finish the unclear transactions.":liquidForEmergency<threeMonthFund?"Keep building accessible cash.":"Confirm the month and stay consistent.";
  const reviewActionCopy=reviewNeedsReview?`${reviewNeedsReview} item${reviewNeedsReview===1?"":"s"} can still distort the budget.`:`Emergency cash after card debt is ${gbp.format(liquidForEmergency)} against a ${gbp.format(threeMonthFund)} three-month target.`;
  const overviewPriorComparableCycle=monthly.map(([key])=>key).filter(key=>key<overviewCycleKey&&cycleHasFullCoverage(key)&&!cycleAnnotations[key]?.excludeFromBaseline).at(-1)??"";
  const overviewPriorSummary=monthly.find(([key])=>key===overviewPriorComparableCycle)?.[1];
  const overviewSpendChange=overviewPriorSummary?overviewSpending-overviewPriorSummary.spend:0;
  const overviewSavingsPhrase=overviewSavings>0?`${gbp.format(overviewSavings)} has gone to savings and investments.`:overviewSavings<0?`${gbp.format(Math.abs(overviewSavings))} has been drawn back from savings.`:"No pay-yourself-first movement is recorded yet.";
  const overviewComparisonSentence=!overviewPriorSummary?`${gbp.format(overviewSpending)} was spent.`:overviewSpendChange===0?"Spending was unchanged from the last normal cycle.":`Spending was ${gbp.format(Math.abs(overviewSpendChange))} ${overviewSpendChange>0?"higher":"lower"} than the last normal cycle.`;
  const homeChangeSummary=!overviewFlowReady?"Import current-account activity to start this cycle’s story.":overviewDataState==="partial"?`${gbp.format(overviewSpending)} has been spent so far. ${overviewSavingsPhrase}`:`${overviewComparisonSentence} ${overviewSavingsPhrase}`;
  const healthHistory=useMemo(()=>snapshots.filter(snapshot=>comparableCash(snapshot)!==undefined).map(snapshot=>{
    const assets=snapshot.netWorth+snapshot.debt;const historicalDebtRatio=assets?snapshot.debt/assets*100:0;const historicalCashProgress=snapshot.healthInputs?.cashProgress??(emergencyGoal.target>0?Math.min(Math.max(0,snapshot.cash)/emergencyGoal.target*100,100):0);const cycleKey=payCycleKey(snapshot.date,payday,salaryDates);const cycle=monthly.find(([key])=>key===cycleKey)?.[1];const historicalSavingsRate=snapshot.healthInputs?.savingsRate??(cycle?.income?Math.max(0,(cycle.income-cycle.spend)/cycle.income*100):0);const historicalInputs={cashProgress:historicalCashProgress,savingsRate:historicalSavingsRate,cashFlowMargin:snapshot.healthInputs?.cashFlowMargin??historicalSavingsRate,debtRatio:snapshot.healthInputs?.debtRatio??historicalDebtRatio};const version=snapshot.healthScoreVersion??1;const score=snapshot.healthScore??calculateHealthScore(historicalInputs,version);return {date:snapshot.date,score,version,estimated:snapshot.healthScore===undefined,inputs:historicalInputs}
  }),[snapshots,emergencyGoal.target,payday,salaryDates,monthly]);
  const previousHealthInputs=[...snapshots].reverse().find(snapshot=>snapshot.cashBasis==="net-cash-v2"&&snapshot.healthScoreVersion===HEALTH_SCORE_VERSION&&snapshot.healthInputs)?.healthInputs;
  const healthMovement=explainHealthMovement(currentHealthInputs,previousHealthInputs);
  const hasHealthComparison=Boolean(previousHealthInputs);
  const liveScoreDate=new Date().toISOString().slice(0,10);
  const historicalHealthPoints=healthHistory.map(point=>({...point,live:false}));
  const healthHistoryDisplay=historicalHealthPoints.some(point=>point.date.slice(0,7)===liveScoreDate.slice(0,7)&&point.version===HEALTH_SCORE_VERSION)
    ?historicalHealthPoints.map(point=>point.date.slice(0,7)===liveScoreDate.slice(0,7)&&point.version===HEALTH_SCORE_VERSION?{...point,score:healthScore,live:true}:point)
    :[...historicalHealthPoints,{date:liveScoreDate,score:healthScore,version:HEALTH_SCORE_VERSION,estimated:false,live:true}];
  const netGrowth = totals.net-(snapshots[0]?.netWorth??totals.net);
  const kpis = [
    { name:"Cash flow", value:scoreCashFlow>=0?`${gbp.format(scoreCashFlow)} surplus`:`${gbp.format(Math.abs(scoreCashFlow))} deficit`, target:scoreCycleNote, status:scoreCashFlow>=0?"green":"orange" },
    { name:"Cash-flow margin", value:`${cashFlowMargin.toFixed(0)}%`, target:`Income left after true spending · ${cycleLabel(scoreCycleKey,payday,salaryDates)}`, status:cashFlowMargin>=20?"green":cashFlowMargin>=10?"amber":"orange" },
    { name:"Emergency fund", value:`${cashProgress.toFixed(0)}% funded`, target:`${gbp.format(liquidForEmergency)} net of card debt`, status:cashProgress>=75?"green":cashProgress>=40?"amber":"orange" },
    { name:"Net worth growth", value:`${netGrowth>=0?"+":""}${gbp.format(netGrowth)}`, target:"Measured from first snapshot", status:netGrowth>0?"green":netGrowth===0?"amber":"orange" },
    { name:"Debt ratio", value:`${debtRatio.toFixed(0)}%`, target:"Target: below 50% of assets", status:debtRatio<=50?"green":debtRatio<=60?"amber":"orange" },
  ];
  const payslips=useMemo(()=>[...(store.payslips??[])].sort((a,b)=>b.payDate.localeCompare(a.payDate)),[store.payslips]);
  const payrollMonths=useMemo(()=>groupPayslipsByMonth(payslips),[payslips]);
  const latestPayslip=payslips[0];const latestPayrollMonth=payrollMonths[0];const selectedPayslip=payslips.find(p=>p.id===selectedPayslipId)||latestPayslip;const maxPayslip=Math.max(...payrollMonths.map(month=>month.netPay),1);
  function setDetailKey(key:DetailKey|null){setDetailKeyState(key)}
  const detailMap:Record<DetailKey,{eyebrow:string;title:string;description:string;rows:{label:string;value:string;note?:string}[]}>={
    health:{eyebrow:"FINANCIAL HEALTH · V3",title:healthReadiness.ready?`${healthScore}/100 — ${healthMovement.direction}`:"—",description:healthReadiness.ready?"A directional indicator: emergency cash earns 35 points, cash flow and saving behaviour range from −15 to +25, and debt position earns up to 40. It is not an objective measure of wellbeing.":healthReadiness.message,rows:!healthReadiness.ready?[{label:"Data confidence",value:healthReadiness.confidence,note:healthReadiness.message},{label:"Still needed",value:healthReadiness.missing.join(", ")||"Nothing",note:"The score will appear once these inputs are available."}]:hasHealthComparison?[...healthMovement.movements.map(item=>({label:item.label,value:`${item.change>=0?"+":"−"}${Math.abs(item.change)} point${Math.abs(item.change)===1?"":"s"}`,note:item.key==="cash"?`${cashProgress.toFixed(0)}% of emergency target`:item.key==="savings"?`${savingsRate.toFixed(0)}% of income moved to savings/investments`:item.key==="cashflow"?`${cashFlowMargin.toFixed(0)}% cash-flow margin · ${savingsRate.toFixed(0)}% saved`: `${debtRatio.toFixed(1)}% debt to assets`})),{label:"Overall movement",value:`${healthMovement.change>=0?"+":"−"}${Math.abs(healthMovement.change)} points`,note:`Versus the previous V3 snapshot · ${healthMovement.direction}`}]:[{label:"Data confidence",value:"Complete",note:"Balances and a completed pay cycle are available."},{label:"Emergency reserve",value:`${cashProgress.toFixed(0)}%`,note:"Up to 35 points · progress stays linear to your target"},{label:"Cash flow & saving",value:`${cashFlowMargin.toFixed(0)}% / ${savingsRate.toFixed(0)}%`,note:"−15 to +25 points · ${scoreCycleNote}"},{label:"Debt position",value:`${debtRatio.toFixed(1)}%`,note:"Up to 40 points · debt as a share of tracked assets"}]},
    cashflow:{eyebrow:"LATEST PAY CYCLE",title:gbp.format(latestMonth.income-latestMonth.spend),description:cycleLabel(latestCycleKey,payday,salaryDates),rows:[{label:"Income",value:gbp.format(latestMonth.income)},{label:"True spending",value:gbp.format(latestMonth.spend)},{label:"Transactions",value:String(latestCycleTransactions.length),note:"Transfers and card repayments excluded from spending"}]},
    growth:{eyebrow:"NET-WORTH GROWTH",title:`${netGrowth>=0?"+":""}${gbp.format(netGrowth)}`,description:"Change from your first saved snapshot to the current balance sheet.",rows:[{label:"Starting snapshot",value:gbp.format(snapshots[0]?.netWorth??totals.net)},{label:"Current net worth",value:gbp.format(totals.net)},{label:"Snapshots saved",value:String(snapshots.length)}]},
    assets:{eyebrow:"TOTAL ASSETS",title:gbp.format(totals.assets),description:"Every tracked asset before liabilities.",rows:store.balances.filter(b=>b.group==="asset").sort((a,b)=>b.value-a.value).map(b=>({label:b.name,value:gbp.format(b.value),note:b.type}))},
    debt:{eyebrow:"TOTAL DEBT",title:gbp.format(totals.debt),description:"Outstanding tracked liabilities.",rows:store.balances.filter(b=>b.group==="liability").sort((a,b)=>b.value-a.value).map(b=>({label:b.name,value:gbp.format(b.value),note:b.type}))},
    accessible:{eyebrow:"CASH AFTER CARD DEBT",title:gbp.format(totals.netLiquid),description:"All tracked current accounts, cash savings and Cash ISAs, less tracked credit-card debt. Import or update each account to keep this current.",rows:[...store.balances.filter(b=>b.group==="asset"&&isCashAccount(b)).map(b=>({label:b.name,value:gbp.format(b.value),note:accountKind(b)==="current"?b.asOf?`As of ${formatCoverageDate(b.asOf)}`:"Balance not dated":"Cash savings"})),{label:"Less: credit-card debt",value:`−${gbp.format(totals.cardDebt)}`,note:"Latest recorded card account balances"},{label:"Trading 212 / ISA",value:gbp.format(totals.isa),note:"Stocks & Shares ISAs · excluded from emergency cash"}]},
    savings:{eyebrow:"NET SAVINGS MOVEMENT",title:`${overviewSavings>=0?"+":"−"}${gbp.format(Math.abs(overviewSavings))}`,description:`Net transfers during ${cycleLabel(overviewCycleKey,payday,salaryDates)}. This is a flow for the selected salary cycle—not the balance of your savings accounts. Bills-pot funding is excluded.`,rows:[{label:"Added to savings and investments",value:gbpExact.format(savingsTotals(overviewCycleTransactions).added)},{label:"Withdrawn to current account",value:gbpExact.format(savingsTotals(overviewCycleTransactions).withdrawn)},...overviewSavingsBreakdown.map(([label,value])=>({label,value:`${value>=0?"+":"−"}${gbpExact.format(Math.abs(value))}`,note:value>=0?"Added during this cycle":"Returned to current account"})),{label:"Included transactions",value:String(overviewSavingsTransactions.length),note:"Cash savings, 1p challenge and investments only"}]},
    pensions:{eyebrow:"PENSIONS",title:gbp.format(totals.pension),description:"Current pension balances plus the latest recorded workplace contributions.",rows:[...store.balances.filter(b=>accountKind(b)==="pension").map(b=>({label:b.name,value:gbp.format(b.value),note:"Current balance"})),...(latestPayslip?[{label:"Latest employee contribution",value:gbpExact.format(latestPayslip.employeePension),note:regional.formatDate(latestPayslip.payDate,{month:"long",year:"numeric"})},{label:"Latest employer contribution",value:gbpExact.format(latestPayslip.employerPension),note:"Paid on top of salary"}]:[])]},
    equity:{eyebrow:"PROPERTY EQUITY",title:gbp.format(propertyEquity(store.balances)),description:"Property valuations less the two tracked mortgages.",rows:[{label:store.balances.find(b=>b.id==="home")?.name??"Home",value:gbp.format((store.balances.find(b=>b.id==="home")?.value??0)-(store.balances.find(b=>b.id==="mortgage")?.value??0))},{label:store.balances.find(b=>b.id==="rental")?.name??"Rental property",value:gbp.format((store.balances.find(b=>b.id==="rental")?.value??0)-(store.balances.find(b=>b.id==="rental-mortgage")?.value??0))},{label:"Combined mortgages",value:gbp.format(mortgageDebtBalance(store.balances))}]},
    runway:{eyebrow:"EMERGENCY RUNWAY",title:`${(liquidForEmergency/essentialsTotal).toFixed(1)} months`,description:"Cash after card debt, divided by your planned monthly essentials. Stocks & Shares ISAs are excluded; Cash ISAs are included.",rows:[{label:"Cash",value:gbp.format(totals.cash)},{label:"Less card debt",value:`−${gbp.format(totals.cardDebt)}`},{label:"Emergency cash",value:gbp.format(liquidForEmergency)},{label:"ISA (shown separately)",value:gbp.format(totals.isa),note:"Not counted in runway"},{label:"Planned essentials",value:gbp.format(essentialsTotal)},{label:"Three-month target",value:gbp.format(threeMonthFund)}]},
    payslip:{eyebrow:"PAYSLIP BREAKDOWN",title:selectedPayslip?gbpExact.format(selectedPayslip.netPay):"No payslip",description:selectedPayslip?`${selectedPayslip.employer?`${selectedPayslip.employer} · `:""}${regional.formatDate(selectedPayslip.payDate,{day:"numeric",month:"long",year:"numeric"})}${isFeaturePackEnabled(store.profile,"uk-tax")?` · Tax code ${selectedPayslip.taxCode}`:""}`:"Upload a payslip to begin",rows:selectedPayslip?[{label:"Gross salary",value:gbpExact.format(selectedPayslip.salary)},{label:"Total earnings",value:gbpExact.format(selectedPayslip.cashEarnings)},...(selectedPayslip.annualLeavePayout?[{label:"Annual leave payout",value:gbpExact.format(selectedPayslip.annualLeavePayout),note:"One-off final-pay item"}]:[]),{label:"Salary sacrifice pension",value:gbpExact.format(selectedPayslip.employeePension)},{label:"Employer pension",value:gbpExact.format(selectedPayslip.employerPension),note:"Paid on top of salary"},{label:isFeaturePackEnabled(store.profile,"uk-tax")?"PAYE tax":"Tax deducted",value:gbpExact.format(selectedPayslip.tax)},{label:"National Insurance",value:gbpExact.format(selectedPayslip.ni)},{label:"Net pay",value:gbpExact.format(selectedPayslip.netPay),note:selectedPayslip.fileName}]:[]},
  };
  const assetMix = useMemo(() => {
    const grouped=store.balances.filter(b=>b.group==="asset").reduce<Record<string,number>>((a,b)=>{const k=b.type==="Property"?"Property":b.type==="Pension"?"Pensions":b.type==="VCT"?"VCTs":"Accessible";a[k]=(a[k]||0)+b.value;return a},{});
    return ["Property","Pensions","VCTs","Accessible"].filter(name=>grouped[name]).map(name=>({name,value:grouped[name],pct:grouped[name]/totals.assets*100}));
  },[store.balances,totals.assets]);
  const mixColours=["#167c63","#3768b0","#8d5d9f","#d8aa62"];
  let mixCursor=0;
  const allocationGradient=`conic-gradient(${assetMix.map((a,i)=>{const start=mixCursor;mixCursor+=a.pct;return `${mixColours[i]} ${start}% ${mixCursor}%`}).join(",")})`;
  const maxSnapshot = Math.max(...snapshots.map(s=>s.netWorth),1);
  function updateBalance(id: string, value: number) {
    setStore(s => {
      const nextBalances=s.balances.map(b=>b.id===id?{...b,value,asOf:new Date().toISOString().slice(0,10)}:b);
      const date=new Date().toISOString().slice(0,10);
      const snapshot=createBalanceSnapshot(nextBalances,date);
      return {...s,balances:nextBalances,goals:syncGoalsWithBalances(s.goals,nextBalances),cardStatement:id==="barclaycard-debt"&&s.cardStatement?{...s.cardStatement,balance:value}:s.cardStatement,snapshots:[...(s.snapshots??[]).filter(item=>item.date!==date),snapshot].sort((a,b)=>a.date.localeCompare(b.date)),updatedAt:date};
    });
  }
  function reconcileMonzoCurrentAccount(){
    if(reconcileActual===null||!Number.isFinite(reconcileActual)||reconcileActual<0){setNotice("Enter the exact balance currently shown in Monzo.");setTimeout(()=>setNotice(""),4000);return}
    const now=new Date();const reconciledAt=now.toISOString();const date=reconciledAt.slice(0,10);const difference=reconcileActual-legacyCurrentBalance;
    const record:BalanceReconciliation={id:`current-account-reconciliation-${reconciledAt}`,reconciledAt,transactionsThrough:legacyCurrentThrough,trackedBalance:legacyCurrentBalance,actualBalance:reconcileActual,difference,reason:reconcileReason};
    setStore(s=>{
      const balances=s.balances.map(balance=>balance.id==="monzo-current"?{...balance,value:reconcileActual,asOf:date}:balance);
      const snapshot=createBalanceSnapshot(balances,date);
      return {...s,balances,balanceReconciliations:[record,...(s.balanceReconciliations??[])],monzoBalanceTracking:legacyCurrentThrough?{enabled:true,syncedThrough:legacyCurrentThrough,updatedAt:reconciledAt}:s.monzoBalanceTracking,snapshots:[...(s.snapshots??[]).filter(item=>item.date!==date),snapshot].sort((a,b)=>a.date.localeCompare(b.date)),updatedAt:date};
    });
    setReconcileBalance("");setNotice(Math.abs(difference)<.005?"Monzo balance confirmed. The automatic tracker now has a trusted starting point.":`Monzo reconciled by ${difference>=0?"+":"−"}${gbpExact.format(Math.abs(difference))}. The correction is recorded in history.`);setTimeout(()=>setNotice(""),6000)
  }
  function closeCycle(key:string){
    if(key===currentCycleKey){setNotice("The live cycle can be reviewed now, but it closes only after the next salary arrives.");setTimeout(()=>setNotice(""),4500);return}
    if(!cycleHasFullCoverage(key)){setNotice("Import or confirm activity for each required account before closing this cycle.");setTimeout(()=>setNotice(""),5000);return}
    const transactions=resolvedTransactions.filter(transaction=>transactionCycleKey(transaction,payday,salaryDates)===key);const personalSpend=transactions.filter(transaction=>transaction.amount<0&&!isExcludedFromSpending(transaction)&&!isRentalMortgage(transaction)&&!isRentalCategory(transaction)).reduce((sum,transaction)=>sum-transaction.amount,0);const rentalMortgage=transactions.filter(transaction=>transaction.amount<0&&isRentalMortgage(transaction)).reduce((sum,transaction)=>sum-transaction.amount,0);const rentalIncome=transactions.filter(rentalIncomeTransaction).reduce((sum,transaction)=>sum+transaction.amount,0);
    const income=monthly.find(([cycle])=>cycle===key)?.[1].income??transactions.filter(transaction=>transaction.amount>0&&transaction.categoryGroup==="income").reduce((sum,transaction)=>sum+transaction.amount,0);const payYourselfFirst=netSavingsMovement(transactions.filter(isPayYourselfFirstMovement));const cashFlow=income-personalSpend-rentalMortgage;const unallocated=cashFlow-payYourselfFirst;const unreviewed=transactions.filter(transaction=>transaction.amount<0&&!isExcludedFromSpending(transaction)&&needsReview(transaction)).length;
    const cycleCoverage=coverageForCycle(key);const checks=reviewReadiness({coverageComplete:cycleCoverage.complete,missingAccounts:cycleCoverage.accounts.filter(account=>!account.complete).map(account=>account.name),payslipRecorded:Boolean(payslipForCycle(store.payslips??[],key)),unreviewed});
    if(!checks.ready){setNotice(`Before closing: ${checks.missing.join(", ")}.`);return;}
    const existing=(store.cycleCloseouts??[]).find(item=>item.cycle===key);const note=(closeoutNotes[key]??existing?.note??"").trim();const now=new Date().toISOString();const date=now.slice(0,10);
    const closeout:CycleCloseout={cycle:key,closedAt:now,income,personalSpend,rentalIncome,rentalMortgage,cashFlow,payYourselfFirst,unallocated,spendingPlan,planVariance:spendingPlan-personalSpend,unreviewed,note,currentAccount:totals.currentAccount,netWorth:totals.net};const snapshot:Snapshot={...createBalanceSnapshot(store.balances,date),...(healthReadiness.ready?{healthScore,healthScoreVersion:HEALTH_SCORE_VERSION,healthInputs:currentHealthInputs}:{})};
    const next=storeWithBackupTimestamp({...store,cycleCloseouts:[closeout,...(store.cycleCloseouts??[]).filter(item=>item.cycle!==key)].sort((a,b)=>b.closedAt.localeCompare(a.closedAt)),snapshots:[...(store.snapshots??[]).filter(item=>item.date!==date||item.healthScoreVersion!==HEALTH_SCORE_VERSION),snapshot].sort((a,b)=>a.date.localeCompare(b.date)),updatedAt:date},now);
    setStore(next);downloadStoreBackup(next,`personal-cfo-${key}-closeout.json`);
    setNotice(`${cycleLabel(key,payday,salaryDates)} ${existing?"closeout refreshed":"closed"}. The summary, net-worth snapshot and safety backup are saved.`);setTimeout(()=>setNotice(""),6000)
  }
  function closeSelectedCycle(){closeCycle(selectedBudgetCycle)}function closeReviewCycle(){closeCycle(reviewCycleKey)}
  function reopenReviewCycle(){if(!reviewCloseout||!confirm(`Reopen ${cycleLabel(reviewCycleKey,payday,salaryDates)}? The saved closeout will be removed, but transactions and snapshots will remain.`))return;setStore(s=>({...s,cycleCloseouts:(s.cycleCloseouts??[]).filter(item=>item.cycle!==reviewCycleKey),updatedAt:new Date().toISOString().slice(0,10)}));setNotice(`${cycleLabel(reviewCycleKey,payday,salaryDates)} reopened. Its transactions and snapshot are unchanged.`);setTimeout(()=>setNotice(""),4500)}
  function confirmCardCoverageThrough(key:string){const through=cycleBounds(key,payday,salaryDates).end;const confirmedAt=new Date().toISOString();setStore(s=>{const credit=configuredAccountCoverage(s).credit;return {...s,accountCoverageConfirmations:{...(s.accountCoverageConfirmations??{}),[key]:Object.fromEntries(credit.map(account=>[account.accountId,{through,confirmedAt}]))},updatedAt:confirmedAt.slice(0,10)}});setNotice(`Credit-card activity confirmed through ${formatCoverageDate(through)}. The raw transactions remain unchanged.`);setTimeout(()=>setNotice(""),5000)}function updateMortgagePlanner(field:keyof MortgagePlanner,value:number){setStore(s=>({...s,mortgagePlanner:{...(s.mortgagePlanner??baselineMortgagePlanner),[field]:Math.max(0,value)},updatedAt:new Date().toISOString().slice(0,10)}))}
  async function prepareMortgageStatement(file:File){
    try{
      if(!file.name.toLowerCase().endsWith(".csv"))throw new Error("Choose a CSV mortgage statement.");
      const draft=mortgageImporter.normalise(await mortgageImporter.preview({text:await file.text(),mortgageId:mortgageImportTarget,fileName:file.name},undefined));
      const matching=(store.mortgageStatements??[]).find(record=>record.mortgageId===draft.mortgageId&&record.statementDate===draft.statementDate&&Math.abs(record.balance-draft.balance)<.01);const duplicate=Boolean(matching&&(draft.interestRate===undefined||matching.interestRate===draft.interestRate));
      setImportError("");setMortgageImportDraft({...draft,duplicate});
    }catch(error){setMortgageImportDraft(null);setImportError(error instanceof Error?error.message:"I could not read that mortgage statement.")}
    finally{if(mortgageStatementRef.current)mortgageStatementRef.current.value=""}
  }
  function confirmMortgageStatement(){
    if(!mortgageImportDraft||mortgageImportDraft.duplicate)return;
    try{
      const draft=mortgageImportDraft,now=new Date().toISOString();
      const {effects,record}=mortgageImportEffects(store,draft,now);
      const applied=applyImportEffects(store,effects);
      const existing=store.mortgageStatements??[];
      const priorRecords=existing.filter(item=>!(item.mortgageId===draft.mortgageId&&item.statementDate===draft.statementDate&&Math.abs(item.balance-draft.balance)<.01));
      const snapshotDate=now.slice(0,10);
      const next:Store={...applied.store,mortgageStatements:[record,...priorRecords].sort((a,b)=>b.statementDate.localeCompare(a.statementDate)),snapshots:applied.applied.length?[...(store.snapshots??[]).filter(item=>item.date!==snapshotDate),createBalanceSnapshot(applied.store.balances,snapshotDate)].sort((a,b)=>a.date.localeCompare(b.date)):store.snapshots,updatedAt:snapshotDate};
      setUndoStore(store);undoCommitted.current=next;setStore(next);setMortgageImportDraft(null);
      setNotice(draft.lender+" statement saved. Balance: "+gbpExact.format(draft.balance)+(draft.interestRate!==undefined?" · rate: "+draft.interestRate.toFixed(2)+"%":"")+".");setTimeout(()=>setNotice(""),6000);
    }catch(error){setImportError(error instanceof Error?error.message:"Mortgage import failed safely; no data changed.")}
  }
  function togglePaydayAllocations(cycle:string){setStore(s=>({...s,paydayAllocationsMoved:{...(s.paydayAllocationsMoved??{}),[cycle]:!(s.paydayAllocationsMoved?.[cycle]??false)},updatedAt:new Date().toISOString().slice(0,10)}))}
  function anchorMonzoBalance(){
    if(legacyCurrentBalance<=0){setNotice("Enter the exact Monzo current-account balance before starting automatic tracking.");setTimeout(()=>setNotice(""),4500);return}
    const syncedThrough=legacyCurrentThrough;
    if(!syncedThrough){setNotice("Import your latest Monzo CSV before starting automatic balance tracking.");setTimeout(()=>setNotice(""),4500);return}
    setStore(s=>({...s,monzoBalanceTracking:{enabled:true,syncedThrough,updatedAt:new Date().toISOString()},updatedAt:new Date().toISOString().slice(0,10)}));
    setNotice(`Automatic Monzo balance tracking anchored at ${gbpExact.format(legacyCurrentBalance)} through ${regional.formatDate(syncedThrough,{day:"numeric",month:"short",year:"numeric"})}.`);
    setTimeout(()=>setNotice(""),6000)
  }
  function pauseMonzoBalanceTracking(){setStore(s=>({...s,monzoBalanceTracking:{enabled:false,syncedThrough:s.monzoBalanceTracking?.syncedThrough??legacyCurrentThrough,updatedAt:new Date().toISOString()},updatedAt:new Date().toISOString().slice(0,10)}));setNotice("Automatic Monzo balance tracking paused. Transactions will still import normally.");setTimeout(()=>setNotice(""),4500)}
  function updateSinkingFund(id:string,field:"current"|"target"|"monthly",value:number){setStore(s=>({...s,sinkingFunds:(s.sinkingFunds??baselineSinkingFunds).map(fund=>fund.id===id?{...fund,[field]:Math.max(0,value)}:fund),updatedAt:new Date().toISOString().slice(0,10)}))}
  function applyMerchantClassification(id:string,nextCategory:string,nextSubcategory?:string){
    const selected=store.transactions.find(transaction=>transaction.id===id);if(!selected)return;
    if(isInternalPotTransfer(selected)&&categoryGroupFor(store.profile,nextCategory)!=="future"){setNotice("Pot transfers stay in a Future/Savings category so they never count as spending.");setTimeout(()=>setNotice(""),5000);return}
    const chosenSubcategory=nextSubcategory||inferSubcategory(nextCategory,selected.merchant);
    if(selected.category===nextCategory&&(selected.subcategory||inferSubcategory(selected.category,selected.merchant))===chosenSubcategory)return;
    const nextRole=categoryFor(store.profile,nextCategory)?.subcategories.find(item=>item.name===chosenSubcategory)?.role??selected.role??"none";
    setClassificationDialog({transactionId:id,nextCategory,nextSubcategory:chosenSubcategory,nextRole});
  }
  function commitMerchantClassification(scope:ClassificationScope){
    if(!classificationDialog)return;const selected=store.transactions.find(transaction=>transaction.id===classificationDialog.transactionId);if(!selected){setClassificationDialog(null);return}
    const {nextCategory,nextSubcategory,nextRole}=classificationDialog;const key=merchantRuleKey(selected.merchant);const now=new Date().toISOString();
    const applies=(transaction:Tx)=>merchantRuleKey(transaction.merchant)===key&&(scope==="all"||(scope==="forward"&&transaction.date>=selected.date)||(scope==="one"&&transaction.id===selected.id));
    const affected=store.transactions.filter(applies).length;
    const targetCategory=categoryFor(store.profile,nextCategory);
    const targetSubcategory=targetCategory?.subcategories.find(item=>item.name===nextSubcategory);
    const rule:MerchantRule={key,label:selected.merchant,category:nextCategory,categoryId:targetCategory?.id,subcategory:nextSubcategory,subcategoryId:targetSubcategory?.id,role:nextRole,updatedAt:now,...(scope==="forward"?{effectiveFrom:selected.date}:{})};
    setStore(s=>{
      const existing=s.merchantRules??[];
      const merchantRules=scope==="one"?existing:scope==="all"?[rule,...existing.filter(item=>item.key!==key)]:[rule,...existing.filter(item=>!(item.key===key&&item.effectiveFrom===selected.date))];
      return {...s,transactions:s.transactions.map(transaction=>applies(transaction)?{...transaction,category:nextCategory,categoryId:targetCategory?.id,subcategory:nextSubcategory,subcategoryId:targetSubcategory?.id,role:nextRole,classificationOverride:scope==="one"?true:undefined}:transaction),merchantRules,updatedAt:now.slice(0,10)};
    });
    const scopeCopy=scope==="one"?"This transaction was updated only.":scope==="forward"?`This and ${Math.max(0,affected-1)} later matching transaction${affected-1===1?"":"s"} were updated; future imports from ${regional.formatDate(selected.date)} will follow the rule.`:`All ${affected} matching transactions were updated and future imports will follow the rule.`;
    setClassificationDialog(null);setNotice(`${selected.merchant}: ${scopeCopy}`);setTimeout(()=>setNotice(""),5500);
  }
  function createCustomSubcategory(){
    if(!subcategoryDialog)return;const name=newSubcategory.trim().replace(/\s+/g," ");if(!name){setNotice("Enter a subcategory name.");setTimeout(()=>setNotice(""),3000);return}
    const {category,transactionId}=subcategoryDialog;const exists=availableSubcategories[category]?.some(item=>item.toLowerCase()===name.toLowerCase());if(exists){setNotice(`${name} already exists under ${category}.`);setTimeout(()=>setNotice(""),3500);return}
    const selected=transactionId?store.transactions.find(transaction=>transaction.id===transactionId):undefined;
    setStore(s=>({...s,profile:s.profile?{...s.profile,categories:addSubcategory(s.profile.categories??[],categoryFor(s.profile,category)?.id??"",name)}:s.profile,updatedAt:new Date().toISOString().slice(0,10)}));
    if(category===subcategoryDialog.category)setSubcategoryFilter(name);setSubcategoryDialog(null);setNewSubcategory("");
    if(selected)setClassificationDialog({transactionId:selected.id,nextCategory:category,nextSubcategory:name,nextRole:selected.role??"none"});
    else {setNotice(`${name} added under ${category}.`);setTimeout(()=>setNotice(""),3500)}
  }
  function updateBudgetPlan(name:string,value:number){setStore(s=>({...s,budgetPlan:{...(s.budgetPlan??{}),[name]:Math.max(0,value)},budgetVersion:5,updatedAt:new Date().toISOString().slice(0,10)}))}
  function updateDirectDebitSetting(key:string,patch:Partial<DirectDebitSetting>){setStore(s=>{const prior=(s.recurringCommitments??[]).filter(item=>item.key===key);const row=directDebitRows.find(item=>item.key===key);const fallback=row?{id:`merchant:${key}`,key,label:row.label,category:row.category,scheduledAmount:row.lastAmount||row.expected,frequency:row.frequency,lastDate:row.lastDate,paymentMethod:"direct-debit" as const,status:"detected" as const,source:row.source}:undefined;const targets=prior.length?prior:fallback?[fallback]:[];return {...s,directDebitSettings:{...(s.directDebitSettings??{}),[key]:{frequency:s.directDebitSettings?.[key]?.frequency??row?.frequency??"monthly",...(s.directDebitSettings?.[key]??{}),...patch}},recurringCommitments:targets.length?[...(s.recurringCommitments??[]).filter(item=>item.key!==key),...targets.map(item=>({...item,...patch,status:"user-overridden" as const}))]:s.recurringCommitments,updatedAt:new Date().toISOString().slice(0,10)}})}
  function updateCycleAnnotation(cycle:string,patch:Partial<CycleAnnotation>){setStore(s=>({...s,cycleAnnotations:{...(s.cycleAnnotations??baselineCycleAnnotations),[cycle]:{kind:s.cycleAnnotations?.[cycle]?.kind??"Normal",...(s.cycleAnnotations?.[cycle]??{}),...patch}},updatedAt:new Date().toISOString().slice(0,10)}))}
  function updateSpendingTreatment(id:string,treatment:SpendingTreatment){setStore(s=>{const transactions=s.transactions.map(transaction=>transaction.id===id?{...transaction,spendingTreatment:treatment}:transaction);const group=groupCommitmentTransactions(transactions).find(item=>item.transactions.some(transaction=>transaction.id===id));const stillConfirmed=group?.transactions.some(transaction=>transaction.spendingTreatment==="Recurring");return {...s,transactions,recurringCommitments:group&&treatment!=="Recurring"&&!stillConfirmed?(s.recurringCommitments??[]).filter(row=>row.id!==group.id||row.status==="user-overridden"):s.recurringCommitments,updatedAt:new Date().toISOString().slice(0,10)}})}
  function archiveDirectDebit(key:string,label:string){updateDirectDebitSetting(key,{archived:true});setNotice(`${label} retired from future budgets. Its past payments remain in history.`);setTimeout(()=>setNotice(""),4500)}
  function saveSavingsChallengeBalance(){const balance=Number(challengeBalanceInput);if(!Number.isFinite(balance)||balance<0||!challengeBalanceDate){setNotice("Enter a valid challenge-pot balance and as-of date.");setTimeout(()=>setNotice(""),4000);return}const updatedAt=new Date().toISOString();setStore(s=>({...s,savingsChallengeTracking:{balance,syncedThrough:challengeBalanceDate,updatedAt},updatedAt:challengeBalanceDate}));setNotice(`Savings challenge anchored at ${gbpExact.format(balance)} as of ${regional.formatDate(challengeBalanceDate,{day:"numeric",month:"long",year:"numeric"})}. Newer Monzo imports will roll it forward.`);setTimeout(()=>setNotice(""),5500)}
  function resetBudgetPlan(){setStore(s=>({...s,budgetPlan:{},budgetVersion:5,updatedAt:new Date().toISOString().slice(0,10)}));setNotice("Plan reset to the last completed pay cycle and known fixed commitments.");setTimeout(()=>setNotice(""),3500)}
  function applyRecommendedBudget(){setStore(s=>({...s,budgetPlan:recommendedBudgetPlan,budgetVersion:5,updatedAt:new Date().toISOString().slice(0,10)}));setNotice(`Recommended plan applied. ${gbp.format(recommendedBudgetPlan["Emergency fund"])} now goes to accessible cash each payday.`);setTimeout(()=>setNotice(""),4500)}
  function prepareImport(draft:NormalisedImportDraft,file:File){
    const result=previewTransactionImport(store,draft,new Date().toISOString());
    setImportError("");
    setPendingImport({needsReview:result.fresh.filter(needsReview).length,file,...draft,added:result.fresh.length,skipped:result.skipped,reconciled:result.reconciled,preview:result.fresh.slice(0,8),warnings:result.effects.warnings,effectPreview:result.effects.preview});
  }
  function confirmPendingImport(){
    if(!pendingImport)return;
    const draft:NormalisedImportDraft={importerId:pendingImport.importerId as NormalisedImportDraft["importerId"],source:pendingImport.source,accountId:pendingImport.accountId,mappingId:pendingImport.mappingId,providerMetadata:pendingImport.providerMetadata,transactions:pendingImport.transactions,rejected:pendingImport.rejected,issues:pendingImport.issues};
    try{
      const result=commitTransactionImport(store,draft,pendingImport.file.name,new Date().toISOString());
      downloadStoreBackup(store,"personal-cfo-before-import-"+new Date().toISOString().slice(0,10)+".json");
      setUndoStore(store);undoCommitted.current=result.store;setStore(result.store);setPendingImport(null);setImportError("");
      const notice=draft.source+": "+result.record.added+" new added, "+result.record.skipped+" duplicates skipped"+(result.preview.reconciled?", "+result.preview.reconciled+" manual entries reconciled":"")+(result.preview.effects.notices.length?"; "+result.preview.effects.notices.join("; "):"")+".";
      setNotice(notice);setTimeout(()=>setNotice(""),6000);
    }catch(error){setImportError(error instanceof Error?error.message:"Import failed safely; no data changed.")}
  }
  function undoLastImport(){if(!undoStore||!canUndoImport(store,undoCommitted.current)){setNotice("Later edits have been made. Use the backup saved before import to restore that earlier version.");return;}undoCommitted.current=null;setStore(undoStore);setUndoStore(null);setNotice("The last import has been undone.");setTimeout(()=>setNotice(""),4000)}
  function createImportAccount(name:string,kind:AccountKind){
    const id=`account-${crypto.randomUUID()}`;
    const legacyType:Record<AccountKind,string>={current:"Current account",savings:"Cash","cash-isa":"Cash ISA","investment-isa":"Stocks & Shares ISA",investment:"Investment","credit-card":"Credit card",mortgage:"Mortgage",loan:"Loan",pension:"Pension",property:"Property",other:"Other"};
    setStore(s=>({...s,profile:s.profile?{...s.profile,accounts:[...s.profile.accounts,{id,name,kind,coverage:kind==="current"||kind==="credit-card"?"required":"excluded"}]}:s.profile,balances:[...s.balances,{id,name,group:["credit-card","mortgage","loan"].includes(kind)?"liability":"asset",type:legacyType[kind],value:0}],updatedAt:new Date().toISOString().slice(0,10)}));
    return id;
  }
  async function importGenericCsv(file:File,mapping:CsvImportMapping,saveMapping:boolean,applyBalance:boolean){
    setImportBusy(true);
    try{
      if(!store.profile?.accounts.some(account=>account.id===mapping.accountId))throw new Error("Choose an account before importing.");
      const parsed=genericCsvImporter.normalise(await genericCsvImporter.preview(await file.text(),mapping));
      if(saveMapping)setStore(s=>({...s,profile:s.profile?{...s.profile,csvMappings:[...(s.profile.csvMappings??[]).filter(item=>item.id!==mapping.id),mapping]}:s.profile}));
      prepareImport(normaliseGenericCsvImport(parsed,mapping,store.profile,applyBalance),file);
    }catch(error){setImportError(error instanceof Error?error.message:"Could not read this CSV.");setPendingImport(null)}finally{setImportBusy(false)}
  }
  async function importCsv(file: File, accountId?: string) {
    setImportBusy(true);
    try {
      const parsed=monzoImporter.normalise(await monzoImporter.preview(await file.text(),undefined));
      const eligible=store.profile?.accounts.filter(account=>account.kind==="current")??[];
      const destination=accountId??(store.profile?.origin==="fresh"&&eligible.length===1?eligible[0].id:store.profile?.origin==="fresh"?undefined:"monzo-current");
      if(!destination||store.profile?.origin==="fresh"&&!store.profile.accounts.some(account=>account.id===destination&&account.kind==="current"))throw new Error("Choose a current account for this import.");
      const draft=normaliseMonzoImport(parsed,store.profile,destination);
      if(!draft.transactions.length)throw new Error(parsed.issues.join("\n")||"No valid Monzo transactions found. Check the date, description and amount columns.");
      prepareImport(draft,file);
    }catch(error){setImportError(error instanceof Error?error.message:"Could not read this Monzo CSV.");setPendingImport(null)}
    finally{setImportBusy(false)}
  }
  async function importBarclaycard(file:File,accountId?:string){setImportBusy(true);try{const parsed=barclaycardImporter.normalise(await barclaycardImporter.preview(file,undefined));if(!parsed.transactions.length)throw new Error("No transactions found");const eligible=store.profile?.accounts.filter(account=>account.kind==="credit-card")??[];const destination=accountId??(store.profile?.origin==="fresh"&&eligible.length===1?eligible[0].id:store.profile?.origin==="fresh"?undefined:"barclaycard-debt");if(!destination||store.profile?.origin==="fresh"&&!eligible.some(account=>account.id===destination))throw new Error("Choose a credit-card account for this import.");prepareImport(normaliseBarclaycardImport(parsed,file.name,store.profile,destination),file)}catch(error){const detail=error instanceof Error?error.message:"Unknown statement error";const pdfHelp=file.name.toLowerCase().endsWith(".pdf")?" Restart the background app once if the private PDF reader is unavailable.":" Use the original Barclaycard CSV; both headed and headerless exports are supported.";setImportError(`I could not read that Barclaycard statement (${detail}).${pdfHelp}`);setPendingImport(null)}finally{setImportBusy(false)}}
  function emptyPayslipDraft(fileName="Manual payslip"):PayslipDraft{return {fileName,payDate:"",salary:"",cashEarnings:"",tax:"",ni:"",netPay:"",employeePension:"",employerPension:"",espp:"",esppRefund:"",annualLeavePayout:"",rsuGain:"",rsuTaxCredit:"",taxCode:""}}
  function filenamePayDate(fileName:string){return fileName.match(/\b(20\d{2})[-_](\d{2})[-_](\d{2})\b/)?.slice(1,4).join("-")??""}
  function saveManualPayslip(){
    if(!payslipDraft)return;
    const number=(value:string)=>Math.abs(statementMoney(value)||0);
    const salary=number(payslipDraft.salary);const netPay=number(payslipDraft.netPay);
    if(!payslipDraft.payDate||!salary||!netPay){setNotice("Enter the pay date, gross salary and net pay before saving.");setTimeout(()=>setNotice(""),4500);return}
    const employeePension=number(payslipDraft.employeePension);
    let taxEvidence:Partial<PayslipRecord>;try{taxEvidence=manualPayslipTaxEvidence(payslipDraft,store.profile?.taxEmployers)}catch(error){setNotice(error instanceof Error?error.message:"Check tax fields");return}
    const payslip:PayslipRecord={...taxEvidence,id:`payslip-${payslipDraft.payDate}`,fileName:payslipDraft.fileName||"Manual payslip",payDate:payslipDraft.payDate,salary,cashEarnings:number(payslipDraft.cashEarnings)||(salary-employeePension),tax:taxEvidence.tax??number(payslipDraft.tax),ni:number(payslipDraft.ni),netPay,employeePension,employerPension:number(payslipDraft.employerPension),espp:number(payslipDraft.espp),esppRefund:number(payslipDraft.esppRefund)||undefined,annualLeavePayout:number(payslipDraft.annualLeavePayout)||undefined,rsuGain:number(payslipDraft.rsuGain),rsuTaxCredit:number(payslipDraft.rsuTaxCredit),taxCode:payslipDraft.taxCode.trim()||"Unknown"};
    setStore(s=>({...s,payslips:mergeImportedPayslip(s.payslips??[],payslip,s.profile?.taxEmployers),updatedAt:new Date().toISOString().slice(0,10)}));
    setPayslipDraft(null);setNotice(`Payslip for ${regional.formatDate(payslip.payDate,{month:"long",year:"numeric"})} saved locally.`);setTimeout(()=>setNotice(""),4500)
  }
  async function importPayslip(file:File){try{const parsed=await parsePayslip(file);const payslip={...parsed,employerId:taxEmployer(parsed.employer,parsed.id,store.profile?.taxEmployers).id};setStore(s=>({...s,payslips:mergeImportedPayslip(s.payslips??[],payslip,s.profile?.taxEmployers),updatedAt:new Date().toISOString().slice(0,10)}));setPayslipDraft(null);setNotice(`Payslip for ${regional.formatDate(payslip.payDate,{month:"long",year:"numeric"})} added.`);setTimeout(()=>setNotice(""),4500)}catch(error){console.error("Payslip import failed",error);setPayslipDraft({...emptyPayslipDraft(file.name),payDate:filenamePayDate(file.name)});navigateToTab("Update");setNotice("This PDF uses a layout the automatic reader could not decode. Enter the figures in the payslip form below; nothing has been added yet.");setTimeout(()=>setNotice(""),7500)}}
  function downloadStoreBackup(source:Store,fileName:string){const blob=new Blob([serialiseBackup(source)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=fileName;a.click();URL.revokeObjectURL(a.href)}
  function exportData() { const now=new Date().toISOString();const next=storeWithBackupTimestamp(store,now);setStore(next);downloadStoreBackup(next,`personal-cfo-backup-${now.slice(0,10)}.json`);setNotice("Safety backup downloaded and recorded.");setTimeout(()=>setNotice(""),3500) }
  async function resetWithBackup(){if(!confirm("For safety, the app will download a backup before resetting. Continue?"))return;exportData();if(confirm("Backup downloaded. Reset all local data to the baseline now?")){try{await deleteFinanceDatabase();localStorage.removeItem(LOCAL_STORE_KEY);location.reload()}catch(error){setStorageError(error instanceof Error?error.message:"The local database could not be reset.")}}}
  async function restoreBackup(file:File){try{let restored=migrateUserProfile(migrateBalanceHistory(parseBackup(await file.text())));if(isFeaturePackEnabled(restored.profile,"uk-tax"))restored=migrateTaxStore(restored);restored=applyUserProfile(restored);downloadStoreBackup(store,`personal-cfo-before-restore-${new Date().toISOString().slice(0,10)}.json`);setStore({...restored,goals:syncGoalsWithBalances(restored.goals,restored.balances)});setSetupOpen(false);setSetupDismissed(false);setNotice("Backup restored successfully.");}catch{setNotice("That backup could not be read.");}setTimeout(()=>setNotice(""),4000)}
  function saveSnapshot(){const next:Snapshot={...createBalanceSnapshot(store.balances,new Date().toISOString().slice(0,10)),...(healthReadiness.ready?{healthScore,healthScoreVersion:HEALTH_SCORE_VERSION,healthInputs:currentHealthInputs}:{})};setStore(s=>({...s,snapshots:[...(s.snapshots??[]).filter(x=>x.date!==next.date||x.healthScoreVersion!==HEALTH_SCORE_VERSION),next].sort((a,b)=>a.date.localeCompare(b.date)),updatedAt:next.date}));setNotice(healthReadiness.ready?`Monthly snapshot saved with Financial Health Score v${HEALTH_SCORE_VERSION}: ${healthScore}/100.`:"Monthly snapshot saved. Add balances and complete one pay cycle before Financial Health is calculated.");setTimeout(()=>setNotice(""),3500)}
  function addManualTransaction(){const amount=Number(manual.amount);if(!manual.merchant.trim()||!manual.date||!Number.isFinite(amount)||amount===0){setNotice("Enter a date, description and non-zero amount.");setTimeout(()=>setNotice(""),3500);return}const broadKey=`${manual.date}|${amount.toFixed(2)}|${manual.category}`;if(store.transactions.some(transaction=>`${transaction.date}|${transaction.amount.toFixed(2)}|${transaction.category}`===broadKey)){setNotice("That date, amount and category already exist, so nothing was added.");setTimeout(()=>setNotice(""),4000);return}const raw:Tx={id:`manual-${manual.date}-${manual.merchant.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${amount.toFixed(2)}-${store.transactions.length}`,date:manual.date,merchant:manual.merchant.trim(),amount,category:manual.category,subcategory:manual.subcategory,account:manual.account||"Manual"};const tx=classifyWithRules(raw,store.profile?.merchantRules??[],store.profile?.incomeSources,store.profile?.merchantSubcategoryHints,store.profile);setStore(s=>({...s,transactions:[tx,...s.transactions],updatedAt:new Date().toISOString().slice(0,10)}));setManual(m=>({...m,merchant:"",amount:""}));setNotice("Transaction added.");setTimeout(()=>setNotice(""),3000)}

  const loadDemoProfile=()=>{setStore(createDemoStore(regional.region));setSetupOpen(false);setSetupDismissed(true);setTab("Overview");setNotice("Fictional demo data loaded using your regional settings.");setTimeout(()=>setNotice(""),5200)};
  const leaveDemoProfile=()=>{const next=createFreshStore();if(next.profile)next.profile.region=regional.region;setStore(next);setTab("Overview");setSetupDismissed(false);setSetupEditStep("welcome");setSetupOpen(true);setNotice("")};

  const homeScreenProps = { cycleHasFullCoverage, overviewCycleTransactions, balancesAsOf:store.balances.every(b=>b.asOf)?store.balances.map(b=>b.asOf!).sort()[0]:"", allocationGradient, assetMix, cashProgress, cfoAttentionItems, currentCycleDataState, currentCycleKey, cycleAnnotations, cycleBounds, cycleKeys, cycleLabel, gbp, healthHistoryDisplay, healthMovement, healthReadiness, healthScore, homeChangeSummary, kpis, latestCategorySpend, latestCycleKey, latestDataCycleKey, latestNeedsReview, latestOverPlan, latestRepeatedSmallSpend, liquidForEmergency, maxMonth, maxSnapshot, mixColours, monthly, monthlyFocus, netGrowth, overviewCategorySpend, overviewCycle, overviewCycleKey, overviewDataState, overviewExcludedMovements, overviewFlexibleSpend, overviewFlowReady, overviewIncome, overviewMaxCategory, overviewMustPay, overviewMustPayTransactions, overviewNeedsReview, overviewSavings, overviewSavingsBreakdown, overviewSavingsRate, overviewSpending, overviewSpendingTreatments, overviewUnderlyingSpending, overviewUnallocated, payday, planRows, salaryDates, setBudgetCycle, setCategory, setDetailKey, setOverviewCycle, setPeriod, setQuery, setSubcategoryFilter, setTab:navigateToTab, setTxView, snapshots, tab, topFocusCategory, totals };
  const monthlyReviewProps = { reviewChecks, reviewChanged, reviewPayslip, reviewCycleTransactions, backupStatusLabel, cardRef, closeReviewCycle, confirmCardCoverageThrough, coverage, currentCycleDataState, currentCycleKey, cycleHasFullCoverage, cycleLabel, dataHealthChecks:reviewDataHealthChecks, dataHealthReady:reviewDataHealthReady, fileRef, formatCoverageDate, gbp, latestCardImport, latestMonzoImport, payday, payslipRef, priorReviewSummary, reconciliationAligned, reopenReviewCycle, reviewActionCopy, reviewActionTitle, reviewCloseout, reviewCloseoutNote, reviewComparisonLabel, reviewCycleAnnotation, reviewCycleComplete, reviewCycleCoverage, reviewCycleKey, reviewCycleOptions, reviewCycleSelection, reviewCycleSummary, reviewMonthlyNarrative, reviewNeedsReview, reviewPlannedOneOffs, reviewSaved, reviewSpendChange, reviewUnderlyingSpending, reviewUnplannedOneOffs, salaryDates, setBudgetCycle, setCategory, setCloseoutNotes, setPeriod, setReviewCycleSelection, setSubcategoryFilter, setTab:navigateToTab, setTxView, store, tab, updateCycleAnnotation };
  const transactionsScreenProps = { accountFilter, allBusinessExpenses, applyMerchantClassification, availableSubcategories, breakdownSpend, categories, category, coverage, currentCycleKey, cycleAnnotations, cycleBounds, cycleKeys, cycleLabel, displayedTransactions, filtered, gbp, gbpExact, income, inferSubcategory, isInternalPotTransfer, latestDataCycleKey, maxCategory, maxMonth, monthly, payday, period, periodTransactions, query, salaryDates, selectedBusinessExpenses, selectedPeriodLabel, setAccountFilter, setCategory, setNewSubcategory, setPeriod, setQuery, setSubcategoryDialog, setSubcategoryFilter, setTab:navigateToTab, setTxLimit, setTxView, spending, spendingTreatmentFor, store:displayStore, subcategoryFilter, subcategorySpend, tab, txLimit, txView, uncategorised, updateSpendingTreatment };
  const planScreenProps = { applyRecommendedBudget, averageFor, balanceReconciliations, baseMortgage, baselineMonthlyActual, baselineSinkingFunds, budgetCycle, budgetRemaining, budgetUsed, cashProgress, challengeBalanceDate, challengeBalanceInput, closeSelectedCycle, completedCycleKeys, completedCycleReview, confirmCardCoverageThrough, coverage, currentBalanceKnown, currentSavingsChallenge, cycleCloseouts, cycleKeys, cycleLabel, duplicateGroups, emergencyContribution, emergencyGap, emergencyGoal, emergencyMonths, employeePensionEstimate, employerPension, essentialCategories, essentialPlan, essentialsTotal, feeTransactions, fixedCommitmentExpected, fixedCommitmentPaid, fixedCommitmentReserved, fixedCommitments, flexCoveredCategories, flexibleBuffer, formatCoverageDate, futurePlan, futureTotal, gbp, gbpExact, housingEvidence, importError, increasedDirectDebits, investedAfterEarlyPayoff, investedAlternative, investmentContributions, investmentGrowth, isRentalMortgage, isExcludedFromSpending, lastCompletedCycleKey, lastPlanCycleKey, latestBalanceReconciliation, latestMortgageStatement, latestSavingsChallengeTransfer, leakageRate, lifestyleCategories, lifestylePlan, lifestyleRemaining, lifestyleTotal, lifestyleUsed, liquidForEmergency, maxCompletedSpend, maxSavingsChallengeHistory, monzoBalanceTracking, mortgageChartYears, mortgageDate, mortgageImportTarget, mortgageInterestSaved, mortgageMonthsSaved, mortgageSettings, mortgageStatementRef, nextCyclePlanSummary, nonMonthlyDirectDebitReserve, nonMonthlyDirectDebits, ordinalDay, overBudgetCategories, payday, paydayAllocationsMoved, personalDirectDebitTotal, planRows, plannedMortgage, planningIncome, prepareMortgageStatement, recommendedBudgetPlan, recommendedEmergency, recommendedPlanBuffer, recommendedPlanTotal, reconcileActual, reconcileBalance, reconcileDifference, reconcileMonzoCurrentAccount, reconcileReason, remainingVariablePlan, rentalPropertyReserve, rentalPropertySurplus, repeatedSmallGroups, repeatedSmallSpend, resetBudgetPlan, reviewTransactions, reviewableSpend, salaryDates, saveSavingsChallengeBalance, savingsChallengeBalance, savingsChallengeDailyAmount, savingsChallengeHistory, savingsChallengeLatestCycle, savingsChallengeNext31, savingsChallengeNextDaily, savingsChallengeProjectedYear, savingsChallengeReconciliation, savingsChallengeTotal, savingsChallengeTracking, selectedBudgetCategorySpend, selectedBudgetComplete, selectedBudgetCycle, selectedBudgetDataState, selectedBudgetIncome, selectedBudgetSpend, selectedBudgetTransactions, selectedPrimaryMortgageSpend, selectedCloseout, selectedCloseoutNote, selectedCycleCashFlow, selectedCycleCoverage, selectedCycleDataLabel, selectedCycleIsLive, selectedCycleLatestDate, selectedCyclePayslip, selectedCycleRentIncome, selectedCycleSalaryIncome, selectedRentalMortgageSpend, selectedRentalOperatingSpend, selectedEssentialSpend, selectedEveryPoundAllocated, selectedEveryPoundRemaining, selectedFlexibleCashOut, selectedHousingSpend, selectedLifestyleSpend, selectedMortgageHistory, selectedMustPayOut, selectedNonMonthlyCollections, selectedOtherHousingSpend, selectedPayYourselfFirst, selectedPayYourselfFirstProgress, selectedTotalCashOut, selectedTvLicenceSpend, selectedUnreviewed, setBudgetCycle, setCategory, setChallengeBalanceDate, setChallengeBalanceInput, setCloseoutNotes, setMortgageImportTarget, setPeriod, setQuery, setReconcileBalance, setReconcileReason, setStore, setSubcategoryFilter, setTab:navigateToTab, setTxView, spendableBalanceReady, spendingPlan, store, subscriptionSpend, subscriptionTransactions, tab, threeMonthFund, togglePaydayAllocations, totals:legacyAccountTotals, travelEvidenceByCycle, travelPlan, tvLicenceDirectDebit, typicalRentalMortgage, typicalRentalIncome, updateBalance, updateBudgetPlan, updateMortgagePlanner, updateSinkingFund, variableMonthlyActual, variablePlanMargin, variableSpendSoFar, variableSpendingPlan };
  const settingsScreenProps = { activeDirectDebits, addManualTransaction, anchorMonzoBalance, annualDirectDebitTotal, applyMerchantClassification, archiveDirectDebit, archivedDirectDebitCount, availableSubcategories, backupDue, backupRef, backupStatusLabel, cardRef, cashProgress, categories, cycleLabel, dataHealthChecks, dataHealthReady, defaultSubcategories, directDebitHistory, directDebitRows, displayedDirectDebitRows, dragging, rentalMortgageCommitment, emptyPayslipDraft, exportData, fileRef, gbp, gbpExact, activeEmployerAnnualSalary, activeEmployeePensionRate, activeEmployerPensionRate, importCsv, importGenericCsv, importBarclaycard, createImportAccount, latestCardImport, latestMonzoImport, latestPayslip, latestPayrollMonth, manual, maxDirectDebitHistory, maxPayslip, monthlyDirectDebitTotal, monzoBalanceTracking, pauseMonzoBalanceTracking, payCycleKey, payday, payslipDraft, payslipRef, payslips, payrollMonths, persistenceMode, resetWithBackup, salaryDates, saveManualPayslip, saveSnapshot, setBudgetCycle, setCategory, setDetailKey, setDragging, setManual, setPayslipDraft, setPeriod, setSelectedPayslipId, setShowArchivedDirectDebits, setStore, setSubcategoryFilter, setTab:navigateToTab, setTxView, showArchivedDirectDebits, store, tab, totals:legacyAccountTotals, updateBalance, updateDirectDebitSetting };
  const showGuide=setupOpen||(!setupDismissed&&shouldShowOnboarding(store));
  const ukTaxEnabled=isFeaturePackEnabled(store.profile,"uk-tax");
  const toggleUkTax=(enabled:boolean)=>{if(!enabled&&tab==="Tax")navigateToTab("Overview");setStore(current=>{if(!current.profile)return current;const profile=enabled?enableFeaturePack(current.profile,"uk-tax"):disableFeaturePack(current.profile,"uk-tax");return enabled?migrateTaxStore({...current,profile}):{...current,profile}})};
  const emptyFreshView=store.profile?.origin==="fresh"&&!store.balances.some(balance=>balance.asOf)&&!store.transactions.length&&!store.taxDocuments?.length&&!store.taxFacts?.length;
  const setupStep=!store.onboarding||store.onboarding.status==="completed"?setupEditStep:store.onboarding.step;
  const changeSetupStep=(step:import("../lib/types").OnboardingStep)=>{if(!store.onboarding||store.onboarding.status==="completed")setSetupEditStep(step);else setStore(current=>setOnboardingStep(current,step))};
  if(!hydrated&&storageError)return <div className="app-loading" role="alert"><h1>Saved data needs attention</h1><p>{storageError}</p><button onClick={()=>location.reload()}>Try again</button><button onClick={()=>{const raw=localStorage.getItem(INDEXED_DB_MIGRATION_BACKUP_KEY)??discoverLocalFinanceStore(localStorage)?.raw;if(raw){const url=URL.createObjectURL(new Blob([raw],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="personal-cfo-recovery.json";a.click();URL.revokeObjectURL(url)}}}>Download saved data</button></div>;
  if(!hydrated)return <div className="app-loading" role="status" aria-live="polite">
<div className="brand-mark">P</div>
<strong>Personal CFO</strong>
<span>PERSONAL FINANCIAL OPERATING SYSTEM</span>
<span>Loading your Financial Health Score and private local data…</span>
<small>Private by design</small>
</div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand">
<div className="brand-mark">P</div>
<div>
<strong>Personal CFO</strong>
<span>Private by design</span>
</div>
</div>
      <nav className="primary-navigation" aria-label="Primary navigation">{visibleNavigation(primaryNavigation,store.profile).map(item=><button key={item.label} className={activeSection===item.label?"active":""} aria-current={activeSection===item.label?"page":undefined} onClick={()=>navigateToTab(item.target)}>
<span aria-hidden="true" className={`nav-icon icon-${item.label.toLowerCase().replace(" ","-")}`}/>{item.label}</button>)}</nav>
      <div className="sidebar-foot">
<div className="privacy-dot"/>
<div>
<strong>Private by design</strong>
<span>Data stays in this browser</span>
</div>
</div>
    </aside>

    <main>
      {storageError&&<div className="import-error" role="alert"><strong>{storageError}</strong><button onClick={exportData}>Download backup</button></div>}
      {importBusy&&<div className="import-loading" role="status">Reading your statement…</div>}
      <div className="save-status" role="status">Version {appVersion} · {persistenceMode==="indexeddb"?"IndexedDB protected":persistenceMode==="localstorage"?"Legacy browser storage":"Opening database"} · {savedAt?`Saved at ${regional.formatDate(new Date(savedAt),{hour:"2-digit",minute:"2-digit"})}`:"Saving…"} · {backupStatusLabel}</div>
      <header>
<div>
<p className="eyebrow">PERSONAL FINANCIAL OPERATING SYSTEM</p>
<h1>{showGuide?"Setup guide":tab==="Overview"?"Home":tab==="Income"?"Payroll & Pension":tab}</h1>
</div>
<div className="header-actions">
<button className="theme-toggle" aria-label={`Switch to ${theme==="dark"?"light":"dark"} theme`} onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}>
<span>{theme==="dark"?"☀":"☾"}</span>{theme==="dark"?"Light":"Dark"}</button>
<button className="primary" onClick={()=>navigateToTab("Monthly Review")}>＋ Monthly update</button>
<input ref={fileRef} aria-label="Choose a Monzo CSV statement" type="file" accept=".csv,text/csv" hidden onChange={e=>{const file=e.target.files?.[0];if(file)importCsv(file);e.target.value=""}}/>
<input ref={cardRef} aria-label="Choose a Barclaycard statement" type="file" accept=".csv,.pdf,text/csv,application/pdf" hidden onChange={e=>{const file=e.target.files?.[0];if(file)importBarclaycard(file);e.target.value=""}}/>
<input ref={payslipRef} aria-label="Choose an employer payslip PDF" type="file" accept=".pdf,application/pdf" hidden onChange={e=>{const file=e.target.files?.[0];if(file)importPayslip(file);e.target.value=""}}/>
<input ref={backupRef} aria-label="Choose a finance dashboard backup" type="file" accept=".json,application/json" hidden onChange={e=>{const file=e.target.files?.[0];if(file)restoreBackup(file);e.target.value=""}}/>
</div>
</header>
      {store.demoMode&&<div className="notice" role="status"><span><strong>Fictional demo profile.</strong> Amounts are illustrative and displayed in {regional.region.currency}.</span><button className="ghost" onClick={leaveDemoProfile}>Start with my data</button></div>}
      {showGuide&&<Onboarding store={store} setStore={setStore} step={setupStep} onStep={changeSetupStep} onFinish={()=>{setStore(current=>finishOnboarding(current));setSetupOpen(false);setSetupDismissed(true);setTab("Overview")}} onLeave={()=>{setSetupOpen(false);setSetupDismissed(true)}} onRestore={()=>backupRef.current?.click()} onDemo={loadDemoProfile} onGeneric={importGenericCsv} onMonzo={importCsv} onBarclaycard={importBarclaycard} onCreateAccount={createImportAccount} importError={importError} notice={notice}/>}
      {!showGuide&&emptyFreshView&&activeSection!=="Settings"&&activeSection!=="Tax"&&<article className="panel empty-state"><h2>No dated financial data yet</h2><p>Add a dated account balance or import a statement to begin. Until then, balances and trends are unavailable—not zero.</p><button className="primary" onClick={()=>setSetupOpen(true)}>Continue setup</button></article>}
      {!showGuide&&<section className={`data-freshness-banner state-${freshnessState}`} aria-label="Dashboard data freshness">
<div className="freshness-state" aria-hidden="true">{freshnessState==="complete"?"✓":freshnessState==="partial"?"!":"·"}</div>
<div className="freshness-copy"><strong>{freshnessTitle}</strong><span>These dates show exactly how far each part of the dashboard can be trusted.</span></div>
<div className="freshness-source"><span>Current accounts</span><strong>{formatCoverageDate(accountCoverage.currentTo)}</strong></div>
<div className="freshness-source"><span>Credit cards</span><strong>{accountCoverage.credit.length?formatCoverageDate(accountCoverage.creditTo):"Not required"}</strong></div>
<div className="freshness-source"><span>Balances</span><strong>{formatCoverageDate(latestSnapshotDate)}</strong></div>
<button className="text-button" onClick={()=>navigateToTab("Update")}>Update →</button>
</section>}
      {!showGuide&&activeSection==="Plan"&&<nav className="section-tabs" aria-label="Plan sections">
{[["Plan","Plan overview"],["Budget","Budget"],["Goals","Goals"],["Mortgage","Mortgage"],["Leakage","Insights"]].map(([target,label])=><button key={target} className={tab===target?"active":""} aria-current={tab===target?"page":undefined} onClick={()=>navigateToTab(target)}>{label}</button>)}
</nav>}
      {!showGuide&&activeSection==="Settings"&&<nav className="section-tabs" aria-label="Settings sections">
{[["Settings","Overview"],["Update","Data & backup"],["Accounts","Accounts"],["Income","Payroll & pension"],["Direct Debits","Direct Debits"]].map(([target,label])=><button key={target} className={tab===target?"active":""} aria-current={tab===target?"page":undefined} onClick={()=>navigateToTab(target)}>{label}</button>)}
</nav>}
      {notice&&<div className="notice" role="status">
<span>{notice}</span></div>}
      {undoStore&&<div className="import-receipt" role="status"><span>Import saved. A backup was downloaded before the change.</span><button className="ghost" onClick={undoLastImport}>Undo last import</button><small>Undo remains available until your next edit. Afterwards, use the downloaded backup.</small></div>}
      {importError&&<div className="error-state" role="alert">
<strong>Import needs attention</strong>
<span>{importError}</span>
<button onClick={()=>{setImportError("");navigateToTab("Update")}}>Review update options</button>
</div>}

      {!showGuide&&!emptyFreshView&&tab==="Monthly Review"&&<MonthlyReview {...monthlyReviewProps} store={displayStore} />}
      {!showGuide&&!emptyFreshView&&activeSection==="Plan"&&<Plan {...planScreenProps} store={displayStore} goals={goals} />}
      {!showGuide&&ukTaxEnabled&&tab==="Tax"&&<Tax store={store} setStore={setStore} gbp={gbp}/>}
      {!showGuide&&activeSection==="Settings"&&<Settings {...settingsScreenProps} ukTaxEnabled={ukTaxEnabled} onToggleUkTax={toggleUkTax} onOpenSetup={()=>{setSetupEditStep("review");setSetupOpen(true)}} automaticBackup={{status:automaticBackupStatus,folder:automaticBackupFolder,savedAt:automaticBackupSavedAt,error:automaticBackupError}} enableAutomaticBackups={enableAutomaticBackups} reconnectAutomaticBackups={reconnectAutomaticBackups} disableAutomaticBackups={disableAutomaticBackups} saveAutomaticBackupNow={()=>writeRecoveryPoint(store,true)} />}
      {!showGuide&&!emptyFreshView&&tab==="Overview"&&<HomeScreen {...homeScreenProps} categoryLabels={{review:categoryFor(store.profile,"Other")?.name??"Other",reviewSubcategory:categoryFor(store.profile,"Other")?.subcategories.find(item=>item.id==="category:other/subcategory:needs-review")?.name??"Needs review"}} goals={goals} />}
      {!showGuide&&!emptyFreshView&&tab==="Transactions"&&<TransactionsScreen {...transactionsScreenProps} />}
      {mortgageImportDraft&&<div className="detail-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setMortgageImportDraft(null)}}><section className="import-preview-dialog mortgage-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="mortgage-preview-title">
<button className="detail-close" aria-label="Cancel mortgage statement import" onClick={()=>setMortgageImportDraft(null)}>×</button>
<span className="insight-label">CHECK BEFORE UPDATING</span>
<h2 id="mortgage-preview-title">{mortgageImportDraft.lender} statement</h2>
<p>{mortgageImportDraft.fileName}</p>
<div className="mortgage-preview-balance"><span>Detected outstanding balance</span><strong>{gbpExact.format(mortgageImportDraft.balance)}</strong><small>As at {regional.formatDate(mortgageImportDraft.statementDate,{day:"numeric",month:"long",year:"numeric"})}</small></div>
{mortgageImportDraft.interestRate!==undefined&&<div className="mortgage-preview-rate"><span>Interest rate from statement</span><strong>{mortgageImportDraft.interestRate.toFixed(2)}%</strong><small>{mortgageImportDraft.interestRateDate?`Effective ${regional.formatDate(mortgageImportDraft.interestRateDate,{day:"numeric",month:"long",year:"numeric"})}`:"Latest rate shown in the statement"}</small></div>}
<div className="import-preview-summary">
<div><span>Statement rows</span><strong>{mortgageImportDraft.rows}</strong></div>
<div><span>Previous balance in file</span><strong>{mortgageImportDraft.previousBalance===undefined?"—":gbpExact.format(mortgageImportDraft.previousBalance)}</strong></div>
<div><span>Payments detected</span><strong>{mortgageImportDraft.payments===undefined?"—":gbpExact.format(mortgageImportDraft.payments)}</strong></div>
<div><span>Interest detected</span><strong>{mortgageImportDraft.interestPaid===undefined?"—":gbpExact.format(mortgageImportDraft.interestPaid)}</strong></div>
</div>
{mortgageImportDraft.duplicate&&<div className="import-inline-error" role="status"><strong>Already imported</strong><span>A statement with this date and balance is already in the history. Nothing will be duplicated.</span></div>}
{mortgageImportDraft.warnings.map(warning=><div className="import-warning" key={warning}>{warning}</div>)}
<p className="privacy-note">Confirming updates the selected mortgage liability, the dated net-worth snapshot and—only for the main home—the overpayment planner balance.</p>
<div className="dialog-actions"><button className="ghost" onClick={()=>setMortgageImportDraft(null)}>Cancel</button><button className="primary" disabled={mortgageImportDraft.duplicate} onClick={confirmMortgageStatement}>{mortgageImportDraft.duplicate?"Already imported":"Update mortgage"}</button></div>
</section></div>}
      {pendingImport&&<ImportPreview region={regional.region} pendingImport={pendingImport} onCancel={()=>setPendingImport(null)} onConfirm={confirmPendingImport}/>}
      {detailKey&&<div className="detail-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDetailKey(null)}}>
<aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={detailMap[detailKey].eyebrow}>
<button className="detail-close" aria-label="Close details" onClick={()=>setDetailKey(null)}>×</button>
<span className="insight-label">{detailMap[detailKey].eyebrow}</span>
<h2>{detailMap[detailKey].title}</h2>
<p>{detailMap[detailKey].description}</p>
<div className="detail-rows">{detailMap[detailKey].rows.map((row,i)=>
<div key={`${row.label}-${i}`}>
<span>
<strong>{row.label}</strong>{row.note&&<small>{row.note}</small>}</span>
<b>{row.value}</b>
</div>)}</div>{detailKey==="pensions"&&<button className="primary detail-action" onClick={()=>{setDetailKey(null);navigateToTab("Income")}}>View income history</button>}{detailKey==="savings"&&<button className="primary detail-action" onClick={()=>{setDetailKey(null);setQuery("");setCategory(categoryFor(store.profile,"Savings")?.name??"Savings");setSubcategoryFilter("All subcategories");setPeriod(`cycle:${overviewCycleKey}`);setTxView("Savings");navigateToTab("Transactions")}}>View contributing transactions</button>}</aside>
</div>}
      {classificationDialog&&classificationTarget&&<div className="detail-backdrop classification-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setClassificationDialog(null)}}>
<section className="classification-dialog" role="dialog" aria-modal="true" aria-labelledby="classification-dialog-title" aria-describedby="classification-dialog-description">
<button className="detail-close" aria-label="Cancel category change" onClick={()=>setClassificationDialog(null)}>×</button>
<span className="insight-label">CHOOSE THE REACH OF THIS CHANGE</span>
<h2 id="classification-dialog-title">Update {classificationTarget.merchant}</h2>
<p id="classification-dialog-description">You are changing <b>{classificationTarget.category} › {classificationTarget.subcategory||inferSubcategory(classificationTarget.category,classificationTarget.merchant)}</b> to <b>{classificationDialog.nextCategory} › {classificationDialog.nextSubcategory}</b>.</p>
<label>Financial role <select aria-label="Financial role for this classification" value={classificationDialog.nextRole} onChange={event=>setClassificationDialog(current=>current?{...current,nextRole:event.target.value as typeof current.nextRole}:current)}>{["none","salary","rental-income","maintenance","savings-contribution","savings-challenge","bills-reserve","debt-repayment","transfer"].map(role=><option key={role} value={role}>{role}</option>)}</select></label>
<div className="classification-date"><span>Selected transaction</span><strong>{regional.formatDate(classificationTarget.date,{day:"numeric",month:"long",year:"numeric"})}</strong></div>
<div className="classification-scope-options">
<button onClick={()=>commitMerchantClassification("one")}><span><b>Just this transaction</b><small>Best when this purchase is an exception.</small></span><strong>1 record</strong></button>
<button onClick={()=>commitMerchantClassification("forward")}><span><b>This and going forward</b><small>Leaves earlier history unchanged. Matching transactions from this date and future imports follow the new rule.</small></span><strong>{classificationForwardMatches.length} now + future</strong></button>
<button className="recommended" onClick={()=>commitMerchantClassification("all")}><span><b>Past and future</b><small>Updates every matching merchant transaction already loaded and all future imports.</small></span><strong>{classificationMerchantMatches.length} now + future</strong><i>Best for a consistently used merchant</i></button>
</div>
<button className="ghost classification-cancel" onClick={()=>setClassificationDialog(null)}>Cancel—keep the current category</button>
</section>
</div>}
      {subcategoryDialog&&<div className="detail-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setSubcategoryDialog(null)}}>
<section className="subcategory-dialog" role="dialog" aria-modal="true" aria-labelledby="subcategory-dialog-title">
<button className="detail-close" aria-label="Close" onClick={()=>setSubcategoryDialog(null)}>×</button>
<span className="insight-label">MORE GRANULAR REPORTING</span>
<h2 id="subcategory-dialog-title">Add under {subcategoryDialog.category}</h2>
<p>Create a reusable subcategory. If opened from a transaction, you will choose whether it applies once, going forward, or across past and future records.</p>
<label>Subcategory name<input autoFocus placeholder="e.g. Your own label" value={newSubcategory} onChange={event=>setNewSubcategory(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")createCustomSubcategory()}}/>
</label>
<div>
<button className="ghost" onClick={()=>setSubcategoryDialog(null)}>Cancel</button>
<button className="primary" onClick={createCustomSubcategory}>Create subcategory</button>
</div>
</section>
</div>}
    </main>
  </div>
}

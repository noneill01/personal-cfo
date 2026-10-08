import type { MortgageAccountId, MortgageImportDraft, ParsedCardFile, PayslipRecord, Tx } from "./types.ts";
import { enrichPayslipTaxEvidence } from "./tax/payslip-evidence.ts";

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') { field += '"'; index++; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(field); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  return rows;
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  const headerTerms = new Set(["date", "created", "transaction date", "date of transaction", "posting date", "processed date", "merchant", "merchant name", "name", "description", "transaction description", "transactions", "details", "amount", "amount gbp", "transaction amount", "debit amount", "credit amount", "account", "balance", "running balance", "statement balance", "outstanding balance", "paid out", "paid in"]);
  const canonicalHeader = (value: string) => value.trim().toLowerCase().replace(/^\uFEFF/, "").replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const detectedHeaderIndex = rows.findIndex(candidate => candidate.map(canonicalHeader).filter(header => headerTerms.has(header)).length >= 2);
  const headerIndex = detectedHeaderIndex >= 0 ? detectedHeaderIndex : 0;
  const headers = (rows[headerIndex] ?? []).map(header => header.trim().toLowerCase().replace(/^\uFEFF/, ""));
  return rows.slice(headerIndex + 1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}


export function parseMonzoCsv(text: string): { transactions: Tx[]; rejected: number; issues: string[] } {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const transactions: Tx[] = [], issues: string[] = [];
  rows.forEach((row, index) => {
    const pick = (...keys: string[]) => keys.map(k => row[k]).find(v => v?.trim())?.trim() ?? "";
    const merchant = pick("name", "merchant", "description", "transaction name", "merchant name");
    const date = normaliseDate(pick("date", "created", "transaction date", "date of transaction"));
    const raw = pick("amount", "amount (gbp)", "value", "transaction amount");
    const allowed = (value: string) => /^[+\-£€$\d\s.,()]+$/.test(value);
    let amount = raw && allowed(raw) ? statementMoney(raw) : Number.NaN;
    if (!raw) {
      const debit = pick("debit", "debit amount", "paid out"), credit = pick("credit", "credit amount", "paid in");
      if ((debit || credit) && (!debit || allowed(debit)) && (!credit || allowed(credit)))
        amount = (credit ? Math.abs(statementMoney(credit)) : 0) - (debit ? Math.abs(statementMoney(debit)) : 0);
    }
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date+"T12:00:00Z")) && new Date(date+"T12:00:00Z").toISOString().slice(0,10) === date;
    if (!validDate || !merchant || !Number.isFinite(amount) || amount === 0) {
      issues.push(`Data row ${index+1}: ${!validDate ? "invalid date" : !merchant ? "missing description" : "invalid or zero amount"} (${raw || "no amount"}).`);
      return;
    }
    const sourceId = pick("transaction id", "transactionid", "id");
    const transactionTime = pick("time", "transaction time");
    const importedCategory = pick("category");
    const fingerprint = [date,transactionTime,merchant,amount.toFixed(2)].join("|");
    transactions.push({id:sourceId ? `monzo-${sourceId}` : `monzo-${fingerprint}-${index}`,sourceId:sourceId||undefined,
      date,transactionTime:transactionTime||undefined,merchant,originalDescription:merchant,importedCategory,
      fingerprint:sourceId||fingerprint,category:importedCategory||"Other",amount,account:"Monzo",
      reference:pick("notes and #tags","notes","reference")||undefined,transactionType:pick("type","transaction type")||undefined});
  });
  return {transactions,rejected:issues.length,issues};
}

export function normaliseDate(raw: string) {
  const value = raw.trim();
  const uk = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (uk) return `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  const shortUk = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (shortUk) return `20${shortUk[3]}-${shortUk[2].padStart(2, "0")}-${shortUk[1].padStart(2, "0")}`;
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const named = value.match(/^(\d{1,2})[\s-]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s-]+(\d{2}|\d{4})$/i);
  if (named) {
    const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const year = named[3].length === 2 ? `20${named[3]}` : named[3];
    return `${year}-${months[named[2].toLowerCase().slice(0, 3)]}-${named[1].padStart(2, "0")}`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

export function statementMoney(raw: string) {
  const cleaned = raw.trim().replace(/\s/g, "").replace(/(?:CR|DR)$/i, "").replace(/[^0-9,.()\-]/g, "");
  if (!cleaned) return Number.NaN;
  const negative = /^\(.*\)$/.test(cleaned) || cleaned.endsWith("-");
  let numberText = cleaned.replace(/[()]/g, "").replace(/-$/g, "");
  const comma = numberText.lastIndexOf(",");
  const dot = numberText.lastIndexOf(".");
  if (comma > dot && /^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(numberText)) numberText = numberText.replace(/\./g, "").replace(",", ".");
  else numberText = numberText.replace(/,/g, "");
  const value = Number(numberText);
  return Number.isFinite(value) ? (negative ? -value : value) : Number.NaN;
}

export function parseMortgageStatementCsv(text: string, mortgageId: MortgageAccountId, fileName: string): MortgageImportDraft {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("The file has no statement rows.");
  const canonical = (value: string) => value.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const pick = (row: Record<string, string>, keys: string[]) => { for (const key of keys) if (row[key]?.trim()) return row[key].trim(); const aliases = new Set(keys.map(canonical)); return Object.entries(row).find(([header, value]) => value?.trim() && aliases.has(canonical(header)))?.[1]?.trim() ?? ""; };
  const dateKeys = ["date", "transaction date", "posting date", "value date", "statement date", "payment date"];
  const descriptionKeys = ["description", "transactions", "transaction", "details", "narrative", "type"];
  const balanceKeys = ["outstanding balance", "mortgage balance", "closing balance", "current balance", "principal balance", "capital balance", "running balance", "balance"];
  const parsed = rows.map((row, index) => {
    const date = normaliseDate(pick(row, dateKeys));
    const balance = statementMoney(pick(row, balanceKeys));
    const description = pick(row, descriptionKeys);
    const paidOut = statementMoney(pick(row, ["paid out", "debit", "debits"]));
    const paidIn = statementMoney(pick(row, ["paid in", "credit", "credits"]));
    const explicitInterest = statementMoney(pick(row, ["interest", "interest charged", "interest amount"]));
    const explicitPayment = statementMoney(pick(row, ["payment", "payment amount", "amount paid", "repayment", "transaction amount", "amount"]));
    const interest = Number.isFinite(explicitInterest) ? explicitInterest : /interest/i.test(description) ? paidOut : Number.NaN;
    const capital = statementMoney(pick(row, ["capital", "capital paid", "principal", "principal paid", "capital repayment"]));
    const payment = Number.isFinite(explicitPayment) ? explicitPayment : /payment received|repayment/i.test(description) ? paidIn : Number.NaN;
    return { index, date, balance: Number.isFinite(balance) ? Math.abs(balance) : Number.NaN, interest, capital, payment };
  });
  const validBalances = parsed.filter(row => Number.isFinite(row.balance));
  if (!validBalances.length) throw new Error(`No mortgage balance was found. Include one of these columns: ${balanceKeys.join(", ")}.`);
  const datedBalances = validBalances.filter(row => row.date).sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
  const latest = (datedBalances.length ? datedBalances : validBalances).at(-1)!;
  const earliest = (datedBalances.length ? datedBalances : validBalances)[0];
  const warnings: string[] = [];
  if (!latest.date) warnings.push("No recognised statement date was found; today's date will be used for the balance snapshot.");
  const skippedBalanceRows = rows.length - validBalances.length;
  if (skippedBalanceRows) warnings.push(`${skippedBalanceRows} row${skippedBalanceRows === 1 ? "" : "s"} had no usable balance and were ignored when choosing the latest balance.`);
  const sum = (field: "interest" | "capital" | "payment") => parsed.reduce((total, row) => total + (Number.isFinite(row[field]) ? Math.abs(row[field]) : 0), 0);
  const rateMarker = rows.findIndex(row => Object.values(row).some(value => /interest rate history/i.test(value)));
  const rateRow = rateMarker >= 0 ? rows.slice(rateMarker + 1).find(row => { const values = Object.values(row).filter(value => value.trim()); return Boolean(normaliseDate(values[0] ?? "") && values.slice(1).some(value => Number.isFinite(statementMoney(value)))); }) : undefined;
  const rateValues = rateRow ? Object.values(rateRow).filter(value => value.trim()) : [];
  const interestRateRaw = rateValues.slice(1).find(value => Number.isFinite(statementMoney(value)));
  const interestRate = interestRateRaw === undefined ? undefined : Math.abs(statementMoney(interestRateRaw));
  const interestRateDate = rateRow ? normaliseDate(rateValues[0] ?? "") : undefined;
  return { fileName, mortgageId, lender: mortgageId === "mortgage" ? "Primary mortgage" : "Rental-property mortgage", statementDate: latest.date || new Date().toISOString().slice(0, 10), balance: latest.balance, previousBalance: earliest !== latest ? earliest.balance : undefined, rows: rows.length, interestPaid: sum("interest") || undefined, interestRate, interestRateDate: interestRateDate || undefined, capitalPaid: sum("capital") || undefined, payments: sum("payment") || undefined, duplicate: false, warnings };
}

function decodePdfString(value: string) { const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" }; return value.replace(/\\([nrtbf()\\])/g, (_match: string, character: string) => escapes[character] || character).replace(/\\(\d{1,3})/g, (_match: string, number: string) => String.fromCharCode(parseInt(number, 8))); }

export async function extractPdfText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);
  const chunks = [raw];
  const stream = /<<(.*?)>>\s*stream\r?\n/gs;
  let match: RegExpExecArray | null;
  while ((match = stream.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    if (match[1].includes("FlateDecode")) {
      try { let data = bytes.slice(start, end); while (data.at(-1) === 10 || data.at(-1) === 13) data = data.slice(0, -1); const inflated = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer(); chunks.push(decoder.decode(inflated)); } catch { }
    }
  }
  const items: string[] = [];
  for (const chunk of chunks) {
    const operators = /\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:.|\n)*?)\]\s*TJ/g;
    let operator: RegExpExecArray | null;
    while ((operator = operators.exec(chunk))) {
      if (operator[1] !== undefined) items.push(decodePdfString(operator[1]));
      else { const parts = [...operator[2].matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map(part => decodePdfString(part[1])); if (parts.length) items.push(parts.join("")); }
    }
  }
  return items.join("\n");
}

async function extractPdfTextLocally(file: File) {
  const response = await fetch("http://127.0.0.1:4318/extract", { method: "POST", headers: { "Content-Type": "application/pdf", "X-File-Name": file.name }, body: file });
  const result = await response.json() as { text?: string; error?: string };
  if (!response.ok || !result.text) throw new Error(result.error || "The local PDF reader is unavailable.");
  return result.text;
}

/** Uses the private local reader when available, then the browser-safe fallback. */
export async function extractPdfTextFromFile(file: File) {
  try { return await extractPdfTextLocally(file); }
  catch { return extractPdfText(file); }
}

function pdfMoney(text: string, pattern: RegExp, last = false) { const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))]; const match = last ? matches.at(-1) : matches[0]; return match ? Math.abs(Number(match[1].replace(/,/g, ""))) : 0; }

export function parsePayslipText(raw: string, fileName = "Employer payslip"): PayslipRecord {
  const text = raw.replace(/\s+/g, " ");
  const numberList = (value: string) => [...value.matchAll(/-?[\d,]+\.\d{2}/g)].map(match => Number(match[0].replace(/,/g, "")));
  const payDay = text.match(/Pay\s*Day\s+(\d{1,2}[\/]\d{1,2}[\/]\d{4})/i)?.[1] || text.match(/Pay\s*Date\s+(\d{1,2}[\/]\d{1,2}[\/]\d{4})/i)?.[1] || text.match(/\b(\d{1,2}[\/]\d{1,2}[\/]\d{4})\b/)?.[1] || "";
  const payDate = normaliseDate(payDay);
  const legalName = raw.split(/\r?\n/).map(line=>line.trim()).find(line=>line.length<100&&/\b(?:Limited|Ltd|LLP|PLC)\.?$/i.test(line));
  const employer = text.match(/(?:Employer|Company)\s*:?\s*([A-Z][A-Za-z0-9 &'’.\-]{2,80}?)(?=\s+(?:Employee|Payslip|Pay\s+(?:Day|Date)|Tax\s+Code))/i)?.[1]?.trim() ?? legalName;
  // Some payroll PDFs group current-period values after the Basic Pay, Tax,
  // NI and workplace-pension headings. Detect the layout, not an employer.
  const groupedCurrentPeriod = /Basic\s+Pay\s+Tax\s+Paid\s+EE\s+NI\s+Contribution\s+(?:Employee\s+|Workplace\s+)?Pension\b/i.test(text);
  if (groupedCurrentPeriod) {
    const currentPeriodBlock = text.match(/Basic\s+Pay\s+Tax\s+Paid\s+EE\s+NI\s+Contribution\s+(?:Employee\s+|Workplace\s+)?Pension\s+((?:-?[\d,]+\.\d{2}\s*){4})/i);
    const currentPeriodValues = currentPeriodBlock ? numberList(currentPeriodBlock[1]) : [];
    const salary = Math.abs(currentPeriodValues[0] || pdfMoney(text, /\bBasic\s+Pay\s+([\d,]+\.\d{2})/i));
    const tax = currentPeriodValues[1] ?? pdfMoney(text, /\bTax\s+Paid\s+([\d,]+\.\d{2})/i);
    const ni = Math.abs(currentPeriodValues[2] || pdfMoney(text, /\bEE\s+NI\s+Contribution\s+([\d,]+\.\d{2})/i));
    const employeePension = Math.abs(currentPeriodValues[3] || pdfMoney(text, /\b(?:Employee\s+|Workplace\s+)?Pension\s+([\d,]+\.\d{2})/i));
    const employerPension = pdfMoney(text, /ER['’]s\s+Pension\s+([\d,]+\.\d{2})/i);
    const netPay = Number((salary - tax - ni - employeePension).toFixed(2));
    const taxCode = text.match(/\b(\d{3,4}[A-Z](?:\s+(?:W1\/M1|M1|W1))?)/i)?.[1]?.trim() || "Unknown";
    if (!payDate || !salary || !netPay || netPay < 0) throw new Error("Missing required grouped payslip fields");
    return enrichPayslipTaxEvidence({ id: `payslip-${payDate}`, fileName, employer, payDate, salary, cashEarnings: salary, tax, ni, netPay, employeePension, employerPension, espp: 0, rsuGain: 0, rsuTaxCredit: 0, taxCode }, raw, currentPeriodValues[1] !== undefined || /\bTax\s+Paid\s+-?[\d,]+\.\d{2}/i.test(text));
  }
  // Some final ADP statements expose labels first and their values as a
  // separate ordered block. This happens on leaving statements containing
  // annual-leave pay and an ESPP refund.
  const finalEarningsBlock = text.match(/Salary\s+SALARY\s+SACRIFICE\s+\*CI\s+BIK\s+\*PMI\s+BIK\s+\*Travel\s+BIK\s+\*Cash\s+Plan\s+BIK\s+Annual\s+Leave\s+Payout\s+Days\s+((?:-?[\d,]+\.\d{2}\s*){7})/i);
  const finalEarningValues = finalEarningsBlock ? numberList(finalEarningsBlock[1]) : [];
  const finalDeductionBlock = text.match(/Tax\s*\(Code\s+[^\)]+\)\s+ESPP\s+Refund\s+NI\s*\(Category\s+[A-Z]\)\s+((?:-?[\d,]+\.\d{2}\s*){3})/i);
  const finalDeductionValues = finalDeductionBlock ? numberList(finalDeductionBlock[1]) : [];
  const amountPaidBlock = text.match(/Earnings\s+Deductions\s+Net\s+pay\s+B\/forward\s+Amount\s+paid\s+C\/forward\s+Payment\s+method\s+((?:-?[\d,]+\.\d{2}\s*){4})/i);
  const amountPaidValues = amountPaidBlock ? numberList(amountPaidBlock[1]) : [];
  const employerContributionBlock = text.match(/Employer'?s\s+Contributions\s+NI\s*\(Category\s+[A-Z]\)\s+SS-Employee\s+Pension\s+ER-Employer\s+Pension\s+((?:-?[\d,]+\.\d{2}\s*){3})/i);
  const employerContributionValues = employerContributionBlock ? numberList(employerContributionBlock[1]) : [];
  const adpEarnings = text.match(/SALARY\s+SACRIFICE\s+((?:-?[\d,]+\.\d{2}\s*){7})/i);
  const earningValues = adpEarnings ? numberList(adpEarnings[1]) : [];
  const salary = Math.abs(finalEarningValues[0] || earningValues[0] || 0) || pdfMoney(text, /\bSalary\s+([\d,]+\.\d{2})/i);
  const sacrifice = Math.abs(finalEarningValues[1] || earningValues[6] || 0) || pdfMoney(text, /SALARY\s+SACRIFICE\s+-?([\d,]+\.\d{2})/i);
  const annualLeavePayout = Math.abs(finalEarningValues[6] || 0);
  const rsuGain = Math.abs(earningValues[3] || 0) || pdfMoney(text, /\*?RSU\s+Gain\s+([\d,]+\.\d{2})/i);
  const taxCode = text.match(/Tax\s*\(Code\s+([^\)]+)\)/i)?.[1]?.trim() || "Unknown";
  const deductionBlock = text.match(/NI\s*\(Category\s+[A-Z]\)\s+((?:-?[\d,]+\.\d{2}\s*){4})/i);
  const deductions = deductionBlock ? numberList(deductionBlock[1]) : [];
  const explicitTax = text.match(/Tax\s*\(Code\s+[^\)]+\)\s+(-?[\d,]+\.\d{2})/i)?.[1];
  const tax = finalDeductionValues[0] ?? deductions[0] ?? (explicitTax === undefined ? 0 : Number(explicitTax.replace(/,/g, "")));
  const esppRefund = Math.abs(finalDeductionValues[1] || 0);
  const espp = esppRefund ? 0 : Math.abs(deductions[1] || 0) || pdfMoney(text, /ESPP\s+Plan\s+1\s+([\d,]+\.\d{2})/i);
  const rsuTax = Math.abs(deductions[2] || 0) || pdfMoney(text, /RSU\s+Gains\s+tax\s+-?([\d,]+\.\d{2})/i);
  const ni = Math.abs(finalDeductionValues[2] || deductions[3] || 0) || pdfMoney(text, /NI\s*\(Category\s+[A-Z]\)\s+([\d,]+\.\d{2})/i);
  const pensionTail = text.match(/Previous\s+Employment\s+SS-Employee\s+Pension\s+ER-Employer\s+Pension\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+Taxable\s+Pay\s+([\d,]+\.\d{2})/i);
  const employeePension = sacrifice || Math.abs(employerContributionValues[1] || Number(pensionTail?.[1]?.replace(/,/g, "") || 0));
  const employerPension = Math.abs(employerContributionValues[2] || Number(pensionTail?.[2]?.replace(/,/g, "") || 0)) || pdfMoney(text, /ER-Employer\s+Pension\s+([\d,]+\.\d{2})/i, true);
  const cashEarnings = Math.abs(amountPaidValues[0] || 0) || pdfMoney(text, /Total\s+Earnings\s+([\d,]+\.\d{2})/i) || (salary - employeePension);
  const calculatedNet = cashEarnings - (tax + ni + espp - rsuTax);
  const netPay = Math.abs(amountPaidValues[2] || 0) || pdfMoney(text, /Net\s+pay\s+([\d,]+\.\d{2})/i) || calculatedNet;
  if (!payDate || !salary || !netPay || netPay < 0) throw new Error("Missing required payslip fields");
  return enrichPayslipTaxEvidence({ id: `payslip-${payDate}`, fileName, employer, payDate, salary, cashEarnings, tax, ni, netPay, employeePension, employerPension, espp, esppRefund: esppRefund || undefined, annualLeavePayout: annualLeavePayout || undefined, rsuGain, rsuTaxCredit: rsuTax, taxCode }, raw, finalDeductionValues[0] !== undefined || deductions[0] !== undefined || /Tax\s*\(Code\s+[^)]+\)\s*-?[\d,]+\.\d{2}/i.test(text));
}

export async function parsePayslip(file: File): Promise<PayslipRecord> {
  return parsePayslipText(await extractPdfTextFromFile(file), file.name);
}

const canonicalStatementHeader = (value: string) => value.toLowerCase().replace(/^\uFEFF/, "").replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const cardPaymentPattern = /(?:payment,?\s*thank you|payment received|payments towards|direct debit payment|card payment)/i;

export function parseBarclaycardCsv(text: string, fileName = "Barclaycard.csv"): ParsedCardFile {
  const rawRows = parseCsvRows(text);
  if (!rawRows.length) throw new Error("The CSV contains no data rows.");
  const positionalRows = Boolean(normaliseDate((rawRows[0]?.[0] ?? "").replace(/^\uFEFF/, "")) && rawRows[0].length >= 3 && Number.isFinite(statementMoney(rawRows[0].at(-1) ?? "")));
  if (positionalRows) {
    const issues: string[] = [];
    let rejected = 0;
    const transactions: ParsedCardFile["transactions"] = [];
    rawRows.forEach((values, index) => {
      const date = normaliseDate((values[0] ?? "").replace(/^\uFEFF/, ""));
      const merchant = (values[1] || values[2] || "").replace(/\s+/g, " ").trim();
      const detail = values.slice(1, -1).join(" ").replace(/\s+/g, " ").trim();
      const sourceCategory = values.length >= 7 ? values.at(-2)?.trim() : "";
      const rawAmount = values.at(-1)?.trim() ?? "";
      const value = statementMoney(rawAmount);
      const isCredit = /\b(?:cr|credit|refund|reversal)\b/i.test(`${rawAmount} ${detail}`);
      const amount = Number.isFinite(value) && value !== 0 ? (isCredit ? Math.abs(value) : -Math.abs(value)) : Number.NaN;
      if (cardPaymentPattern.test(detail)) return;
      if (!date || !merchant || !Number.isFinite(amount)) {
        rejected++;
        if (issues.length < 8) issues.push(`Row ${index + 1}: missing or invalid date, description or amount`);
        return;
      }
      transactions.push({ date, merchant: merchant.slice(0, 120), amount, ...(sourceCategory ? { sourceCategory } : {}) });
    });
    if (!transactions.length) throw new Error("No purchase rows were recognised in the headerless Barclaycard CSV.");
    return { transactions, format: "CSV", rejected, issues };
  }

  const rows = parseCsv(text);
  if (!rows.length) throw new Error("The CSV contains no transaction rows after its header.");
  const pick = (row: Record<string, string>, aliases: string[]) => {
    const wanted = new Set(aliases.map(canonicalStatementHeader));
    return Object.entries(row).find(([header, value]) => value?.trim() && wanted.has(canonicalStatementHeader(header)))?.[1]?.trim() ?? "";
  };
  const dateAliases = ["date", "transaction date", "date of transaction", "posting date", "processed date", "value date"];
  const merchantAliases = ["description", "transaction description", "merchant", "merchant name", "name", "details", "transaction", "reference"];
  const amountAliases = ["amount", "amount gbp", "transaction amount", "value"];
  const debitAliases = ["debit", "debits", "debit amount", "money out", "paid out", "charge"];
  const creditAliases = ["credit", "credits", "credit amount", "money in", "paid in", "refund"];
  const issues: string[] = [];
  let rejected = 0;
  const transactions: ParsedCardFile["transactions"] = [];

  rows.forEach((row, index) => {
    const date = normaliseDate(pick(row, dateAliases));
    const merchant = pick(row, merchantAliases).replace(/\s+/g, " ").trim();
    const rawAmount = pick(row, amountAliases);
    const rawDebit = pick(row, debitAliases);
    const rawCredit = pick(row, creditAliases);
    const direction = pick(row, ["type", "transaction type", "debit credit", "debit or credit", "indicator"]);
    const debit = statementMoney(rawDebit);
    const credit = statementMoney(rawCredit);
    const singleAmount = statementMoney(rawAmount);
    let amount = Number.NaN;
    if (Number.isFinite(debit) && debit !== 0) amount = -Math.abs(debit);
    else if (Number.isFinite(credit) && credit !== 0) amount = Math.abs(credit);
    else if (Number.isFinite(singleAmount) && singleAmount !== 0) {
      const isCredit = /\b(?:cr|credit|refund|reversal)\b/i.test(`${direction} ${rawAmount} ${merchant}`);
      amount = isCredit ? Math.abs(singleAmount) : -Math.abs(singleAmount);
    }
    if (cardPaymentPattern.test(merchant)) return;
    if (!date || !merchant || !Number.isFinite(amount) || amount === 0) {
      rejected++;
      if (issues.length < 8) {
        const missing = [!date && "date", !merchant && "description", (!Number.isFinite(amount) || amount === 0) && "amount"].filter(Boolean).join(", ");
        issues.push(`Row ${index + 2}: missing or invalid ${missing}`);
      }
      return;
    }
    const sourceCategory = pick(row, ["category", "spend category", "transaction category"]);
    transactions.push({ date, merchant: merchant.slice(0, 120), amount, ...(sourceCategory ? { sourceCategory } : {}) });
  });

  if (!transactions.length) {
    const headers = Object.keys(rows[0] ?? {}).filter(Boolean).join(", ");
    throw new Error(`No purchase rows were recognised. Found columns: ${headers || "none"}. Expected a date, description and amount (or debit/credit) column.`);
  }

  const summaryRow = rows.find(row => pick(row, ["statement balance", "new balance", "outstanding balance"]));
  const statementBalance = summaryRow ? statementMoney(pick(summaryRow, ["statement balance", "new balance", "outstanding balance"])) : Number.NaN;
  const transactionDates = transactions.map(transaction => transaction.date).sort();
  const explicitStatementDate = summaryRow ? normaliseDate(pick(summaryRow, ["statement date", "issued on", "date issued"])) : "";
  const statementDate = explicitStatementDate || transactionDates.at(-1) || "";
  const summary = summaryRow && Number.isFinite(statementBalance) && statementBalance !== 0 && statementDate ? {
    statementDate,
    balance: Math.abs(statementBalance),
    minimumPayment: Math.abs(statementMoney(pick(summaryRow, ["minimum payment", "minimum amount due"]))) || 0,
    dueDate: normaliseDate(pick(summaryRow, ["payment due date", "due date", "pay by"])),
    creditLimit: Math.abs(statementMoney(pick(summaryRow, ["credit limit", "current credit limit"]))) || 0,
    fileName,
  } : undefined;
  return { transactions, summary, format: "CSV", rejected, issues };
}

export async function parseBarclaycardFile(file: File): Promise<ParsedCardFile> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) return parseBarclaycardCsv(await file.text(), file.name);
  if (!lowerName.endsWith(".pdf")) throw new Error("Choose a PDF or CSV statement.");
  let text = "";
  let localReaderError = "";
  try { text = await extractPdfTextLocally(file); } catch (error) {
    localReaderError = error instanceof Error ? error.message : "The private PDF reader failed.";
    text = await extractPdfText(file);
  }
  const compact = text.replace(/\s+/g, " ");
  const result: Omit<Tx, "id" | "category" | "account">[] = [];
  const statementRaw = compact.match(/issued\s+on\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)?.[1] || compact.match(/\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/)?.[1] || "";
  const dueRaw = compact.match(/Please\s+pay\s+by:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)?.[1] || "";
  const balance = pdfMoney(compact, /Your\s+new\s+balance:\s*£\s*([\d,]+\.\d{2})/i);
  const statementDate = normaliseDate(statementRaw);
  const summary = balance && statementDate ? { statementDate, balance, minimumPayment: pdfMoney(compact, /Minimum\s+payment:\s*£\s*([\d,]+\.\d{2})/i), dueDate: normaliseDate(dueRaw), creditLimit: pdfMoney(compact, /current\s+credit\s+limit:\s*£\s*([\d,]+\.\d{2})/i), fileName: file.name } : undefined;
  const statementYear = Number(statementDate.slice(0, 4)) || new Date().getFullYear();
  const statementMonth = Number(statementDate.slice(5, 7)) || 12;
  const monthIndex: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  let pending: { day: string; month: string; merchant: string } | null = null;
  const addTransaction = (day: string, month: string, merchant: string, money: string, credit = false) => { if (/payment,?\s*thank you|previous balance|payments towards/i.test(merchant)) return; const monthNumber = monthIndex[month.toLowerCase().slice(0, 3)]; if (!monthNumber) return; const year = monthNumber > statementMonth ? statementYear - 1 : statementYear; const date = normaliseDate(`${day} ${month} ${year}`); const value = Math.abs(Number(money.replace(/,/g, ""))); if (!date || !merchant || !value) return; const cleaned = merchant.replace(/\s+[eE]$/, "").trim().slice(0, 120); result.push({ date, merchant: cleaned, amount: credit || /refund|credit/i.test(cleaned) ? value : -value }); };
  for (const line of lines) {
    const start = line.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(.+)$/i);
    if (start) { pending = null; const inline = start[3].match(/^(.*?)\s+(?:[eE]\s+)?£([\d,]+\.\d{2})(?:\s*(CR))?$/i); if (inline) addTransaction(start[1], start[2], inline[1], inline[2], Boolean(inline[3])); else pending = { day: start[1], month: start[2], merchant: start[3] }; continue; }
    if (pending && !/Non Sterling Trans Fee/i.test(line)) { const trailing = line.match(/^(?:[eE]\s+)?£([\d,]+\.\d{2})(?:\s*(CR))?$/i) || line.match(/(?:^|\s)[eE]?\s*£([\d,]+\.\d{2})(?:\s*(CR))?$/i); if (trailing) { addTransaction(pending.day, pending.month, pending.merchant, trailing[1], Boolean(trailing[2])); pending = null; } }
  }
  if (!result.length) {
    if (localReaderError) throw new Error(`Private PDF reader failed: ${localReaderError}`);
    if (!text.trim()) throw new Error("No readable text was found in the PDF.");
    throw new Error("The PDF was readable, but no Barclaycard purchase rows matched the statement layout.");
  }
  return { transactions: result, summary, format: "PDF", rejected: 0, issues: [] };
}

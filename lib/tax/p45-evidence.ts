import { extractPdfTextFromFile, normaliseDate, statementMoney } from "../imports.ts";

export type P45DraftEvidence = {
  employer?: string;
  leavingDate?: string;
  taxablePay?: number;
  taxPaid?: number;
  taxCode?: string;
  payeReference?: string;
  fileName: string;
  warnings: string[];
};

const compact = (text: string) => text.replace(/\s+/g, " ").trim();
type LocatedLabel = { index: number; end: number };
type P45PayAndTax = { pay?: number; tax?: number };

const locate = (text: string, expression: RegExp): LocatedLabel | undefined => {
  const match = expression.exec(text);
  return match ? { index: match.index, end: match.index + match[0].length } : undefined;
};

/** HMRC may extract `£`, `p` and the filled fields on separate lines. */
const moneyCandidates = (text: string) => {
  const candidates: number[] = [];
  const expression = /(?:£\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2}|\d{3,})(?!\d)/g;
  for (const match of text.matchAll(expression)) {
    let source = match[1];
    if (!source.includes(".") && match.index !== undefined) {
      const following = text.slice(match.index + match[0].length);
      const pence = following.match(/^\s*(?:p\s*)?(\d{2})(?!\d)/i)?.[1];
      if (pence) source = `${source}.${pence}`;
    }
    const amount = statementMoney(source);
    if (Number.isFinite(amount)) candidates.push(Math.abs(amount));
  }
  return candidates;
};

const firstMoney = (text: string) => moneyCandidates(text)[0];

function payAndTaxBox(text: string, payLabel: RegExp, taxLabel: RegExp, competingBoxStart?: number): P45PayAndTax | undefined {
  const pay = locate(text, payLabel);
  const tax = locate(text, taxLabel);
  if (!pay || !tax) return undefined;
  const boxStart = Math.min(pay.index, tax.index);
  const naturalEnd = Math.max(pay.end, tax.end) + 500;
  const boxEnd = competingBoxStart !== undefined && competingBoxStart > boxStart ? Math.min(competingBoxStart, naturalEnd) : Math.min(text.length, naturalEnd);

  if (pay.index < tax.index) {
    const payBetweenLabels = firstMoney(text.slice(pay.end, tax.index));
    const taxAfterLabel = firstMoney(text.slice(tax.end, boxEnd));
    if (payBetweenLabels !== undefined && taxAfterLabel !== undefined) return { pay: payBetweenLabels, tax: taxAfterLabel };
  } else {
    const taxBetweenLabels = firstMoney(text.slice(tax.end, pay.index));
    const payAfterLabel = firstMoney(text.slice(pay.end, boxEnd));
    if (payAfterLabel !== undefined && taxBetweenLabels !== undefined) return { pay: payAfterLabel, tax: taxBetweenLabels };
  }

  // The real HMRC extraction can place both labels before both filled values.
  const ordered = moneyCandidates(text.slice(Math.max(pay.end, tax.end), boxEnd));
  return { pay: ordered[0], tax: ordered[1] };
}

const normaliseP45Date = (value: string) => {
  const joined = value.trim().replace(/\s*([/.\-])\s*/g, "$1");
  const spaced = joined.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})$/);
  return normaliseDate(spaced ? `${spaced[1]}/${spaced[2]}/${spaced[3]}` : joined);
};

/** Extracts only the small, reviewable set of P45 fields used by Tax V1. */
export function parseP45Text(raw: string, fileName = "P45.pdf"): P45DraftEvidence {
  const orderedText = raw.replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n");
  const text = compact(orderedText);
  const leavingRaw = text.match(/(?:date\s+(?:of\s+)?leaving|leaving\s+date|date\s+you\s+left)(?:\s+DD\s+MM\s+YYYY)?\s*[:\-]?\s*(\d{1,2}(?:\s*[/.\-]\s*|\s+)\d{1,2}(?:\s*[/.\-]\s*|\s+)\d{2,4})/i)?.[1];
  const employer = text.match(/(?:employer(?:'s)?\s+name)\s*[:\-]?\s*(.+?)(?=\s+(?:employer(?:'s)?\s+PAYE|PAYE\s+reference|date\s+(?:of\s+)?leaving|tax\s+code)\b|$)/i)?.[1]?.trim();
  const taxCode = text.match(/(?:tax\s+code)(?:\s+(?:at\s+leaving\s+date|at\s+date\s+of\s+leaving))?\s*[:\-]?\s*([0-9]{1,4}[A-Z][A-Z0-9/\-]*|[A-Z][0-9]{1,4}[A-Z0-9/\-]*)/i)?.[1];
  const payeReference = text.match(/(?:employer(?:'s)?\s+PAYE\s+reference|PAYE\s+reference)\s*[:\-]?\s*([A-Z0-9/\- ]{3,}?)(?=\s+(?:date\s+(?:of\s+)?leaving|tax\s+code|total\s+(?:taxable\s+)?pay|total\s+tax)\b|$)/i)?.[1]?.trim();
  const box7Pay = locate(orderedText, /total\s+(?:taxable\s+)?pay\s+to\s+date/i);
  const box8Pay = locate(orderedText, /total\s+pay\s+in\s+this\s+employment/i);
  const box7 = payAndTaxBox(orderedText, /total\s+(?:taxable\s+)?pay\s+to\s+date/i, /total\s+tax\s+(?:deducted|to\s+date)/i, box8Pay?.index);
  const box8 = payAndTaxBox(orderedText, /total\s+pay\s+in\s+this\s+employment/i, /total\s+tax\s+in\s+this\s+employment/i, box7Pay?.index);
  const employmentBox = box8 && (box8.pay !== undefined || box8.tax !== undefined) ? box8 : box7;
  const taxablePay = employmentBox?.pay;
  const taxPaid = employmentBox?.tax;
  const warnings: string[] = [];
  if (!leavingRaw || !normaliseP45Date(leavingRaw)) warnings.push("Leaving date was not recognised.");
  if (taxablePay === undefined) warnings.push("Total taxable pay was not recognised.");
  if (taxPaid === undefined) warnings.push("Total PAYE deducted was not recognised.");
  return { employer, leavingDate: leavingRaw ? normaliseP45Date(leavingRaw) || undefined : undefined, taxablePay, taxPaid, taxCode, payeReference, fileName, warnings };
}

export async function parseP45File(file: File) {
  if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("Choose the original P45 PDF.");
  return parseP45Text(await extractPdfTextFromFile(file), file.name);
}

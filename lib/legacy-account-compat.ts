import type { ImportRecord, Tx } from "./types.ts";

// Old imports used display labels instead of canonical account IDs. New imports
// always carry accountId; these aliases exist solely for pre-migration history.
const legacyAccounts:Record<string,string>={Monzo:"monzo-current",Barclaycard:"barclaycard-debt"};
export const legacyAccountId=(value?:string)=>value?legacyAccounts[value]:undefined;
export const legacyTransactionAccountId=(row:Tx)=>legacyAccountId(row.account);
export const legacyImportAccountId=(batch:ImportRecord)=>legacyAccountId(batch.source);
export const legacyCardCoverageAccountId="barclaycard-debt";

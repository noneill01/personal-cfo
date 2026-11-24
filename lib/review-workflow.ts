import type { Store } from './types.ts';
import {accountKind} from './balances.ts';
import {shiftIsoDate} from './pay-cycles.ts';

/** Use the same date boundary for the control and the confirmation guard. */
export function accountReviewAvailability(end:string,today:string) {
  return {canConfirm:end<today.slice(0,10),availableFrom:shiftIsoDate(end,1)};
}

/** A reviewed interval is evidence only; preserve transactions and other confirmations. */
export function confirmAccountReview(store:Store,cycle:string,accountId:string,bounds:{start:string;end:string},confirmedAt:string):Store {
  const legacy=store.balances.find(item=>item.id===accountId);
  const account=store.profile?.accounts.find(item=>item.id===accountId)??(legacy?{id:legacy.id,kind:accountKind(legacy)}:undefined);
  if(!account||!['current','credit-card'].includes(account.kind))throw new Error('Choose a current or credit-card account to review.');
  if(!accountReviewAvailability(bounds.end,confirmedAt).canConfirm)throw new Error('Review the full account activity after this cycle ends.');
  return {...store,accountCoverageConfirmations:{...store.accountCoverageConfirmations,[cycle]:{...store.accountCoverageConfirmations?.[cycle],[accountId]:{from:bounds.start,through:bounds.end,confirmedAt}}},updatedAt:confirmedAt.slice(0,10)};
}

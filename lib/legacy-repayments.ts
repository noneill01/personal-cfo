/** Compatibility for pre-profile records whose repayment role was encoded only in a provider description. */
export function legacyCardRepaymentDescription(merchant: string, account: string) {
  return account.toLowerCase() !== "barclaycard" && /barclaycard|barclays.*card|credit card payment/i.test(merchant);
}

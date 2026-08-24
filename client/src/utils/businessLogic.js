// Client-side PREVIEW ONLY - mirrors server/src/services/businessLogic.js.
// The server recalculates authoritatively on submit; never trust this for
// anything but responsive UI feedback.

export const BUNDLE_VALUES = { 10: 1000, 50: 5000, 100: 10000 };

export function calculateBundleValue({ bundles_10 = 0, bundles_50 = 0, bundles_100 = 0 }) {
  return bundles_10 * BUNDLE_VALUES[10] + bundles_50 * BUNDLE_VALUES[50] + bundles_100 * BUNDLE_VALUES[100];
}

export function calculateCommissionRate({ bundles_10 = 0, bundles_50 = 0, bundles_100 = 0 }) {
  if (bundles_10 > 0 && bundles_50 === 0 && bundles_100 === 0) return 0.03;
  return 0.015;
}

export function calculateProfit(totalChangeValue, commissionRate) {
  return Math.round((totalChangeValue * commissionRate + Number.EPSILON) * 100) / 100;
}

export function calculateAmountCollected(totalChangeValue, profit) {
  return Math.round((totalChangeValue + profit + Number.EPSILON) * 100) / 100;
}

// Centralized financial business logic (MASTER CONTEXT section 41).
// These are the ONLY functions permitted to compute change value, commission,
// profit, and amount collected. Do not duplicate this math elsewhere.
//
// Non-negotiable business rules (MASTER CONTEXT section 37) - do not change
// without explicit discussion:
//   Rs. 10 bundle  = Rs. 1,000
//   Rs. 50 bundle  = Rs. 5,000
//   Rs. 100 bundle = Rs. 10,000
//   Standard commission = 1.5%
//   ONLY Rs. 10 bundles = 3%
//   Rs. 10 + Rs. 50/100 = 1.5%
//   Profit ending in 5 rounds up to the next 10 (Rs. 75 -> Rs. 80), because
//   5-rupee coins are rarely used
//   Rs. 6,000 at the standard rate = fixed Rs. 100 profit

const BUNDLE_VALUES = Object.freeze({ 10: 1000, 50: 5000, 100: 10000 });
const NOTES_PER_BUNDLE = 100;

const STANDARD_COMMISSION_RATE = 0.015;
const RS10_ONLY_COMMISSION_RATE = 0.03;

// Change values charged a set profit instead of the percentage, keyed by value.
const STANDARD_RATE_FIXED_PROFITS = Object.freeze({ 6000: 100 });

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateBundleValue({ bundles_10 = 0, bundles_50 = 0, bundles_100 = 0 }) {
  const value =
    bundles_10 * BUNDLE_VALUES[10] +
    bundles_50 * BUNDLE_VALUES[50] +
    bundles_100 * BUNDLE_VALUES[100];
  return round2(value);
}

function calculateCommissionRate({ bundles_10 = 0, bundles_50 = 0, bundles_100 = 0 }) {
  if (bundles_10 > 0 && bundles_50 === 0 && bundles_100 === 0) {
    return RS10_ONLY_COMMISSION_RATE;
  }
  return STANDARD_COMMISSION_RATE;
}

function calculateProfit(totalChangeValue, commissionRate) {
  const fixedProfit = STANDARD_RATE_FIXED_PROFITS[totalChangeValue];
  if (commissionRate === STANDARD_COMMISSION_RATE && fixedProfit !== undefined) {
    return fixedProfit;
  }

  const profit = round2(totalChangeValue * commissionRate);
  return profit % 10 === 5 ? profit + 5 : profit;
}

function calculateAmountCollected(totalChangeValue, profit) {
  return round2(totalChangeValue + profit);
}

module.exports = {
  BUNDLE_VALUES,
  NOTES_PER_BUNDLE,
  STANDARD_COMMISSION_RATE,
  RS10_ONLY_COMMISSION_RATE,
  calculateBundleValue,
  calculateCommissionRate,
  calculateProfit,
  calculateAmountCollected,
};

const {
  calculateBundleValue,
  calculateCommissionRate,
  calculateProfit,
  calculateAmountCollected,
} = require('../src/services/businessLogic');

describe('calculateBundleValue', () => {
  test('Rs. 10,000 example from master context (10 bundles of Rs. 100)', () => {
    expect(calculateBundleValue({ bundles_10: 0, bundles_50: 0, bundles_100: 1 })).toBe(10000);
  });

  test('mixed bundle example: 2x Rs.10 + 1x Rs.50 = Rs. 7,000', () => {
    expect(calculateBundleValue({ bundles_10: 2, bundles_50: 1, bundles_100: 0 })).toBe(7000);
  });

  test('only Rs.10 example: 3x Rs.10 = Rs. 3,000', () => {
    expect(calculateBundleValue({ bundles_10: 3, bundles_50: 0, bundles_100: 0 })).toBe(3000);
  });

  test('all three denominations combined', () => {
    expect(calculateBundleValue({ bundles_10: 1, bundles_50: 1, bundles_100: 1 })).toBe(16000);
  });
});

describe('calculateCommissionRate', () => {
  test('ONLY Rs. 10 bundles -> 3%', () => {
    expect(calculateCommissionRate({ bundles_10: 3, bundles_50: 0, bundles_100: 0 })).toBe(0.03);
  });

  test('Rs. 10 + Rs. 50 -> 1.5% (mixed rule)', () => {
    expect(calculateCommissionRate({ bundles_10: 2, bundles_50: 1, bundles_100: 0 })).toBe(0.015);
  });

  test('Rs. 10 + Rs. 100 -> 1.5% (mixed rule)', () => {
    expect(calculateCommissionRate({ bundles_10: 1, bundles_50: 0, bundles_100: 1 })).toBe(0.015);
  });

  test('only Rs. 50 -> 1.5% (special rule must not apply)', () => {
    expect(calculateCommissionRate({ bundles_10: 0, bundles_50: 4, bundles_100: 0 })).toBe(0.015);
  });

  test('only Rs. 100 -> 1.5% (special rule must not apply)', () => {
    expect(calculateCommissionRate({ bundles_10: 0, bundles_50: 0, bundles_100: 2 })).toBe(0.015);
  });

  test('all three denominations -> 1.5%', () => {
    expect(calculateCommissionRate({ bundles_10: 1, bundles_50: 1, bundles_100: 1 })).toBe(0.015);
  });
});

describe('calculateProfit', () => {
  test('Rs. 10,000 -> 1.5% -> Rs. 150 (master context example)', () => {
    expect(calculateProfit(10000, 0.015)).toBe(150);
  });

  test('Rs. 3,000 only Rs.10 -> 3% -> Rs. 90 (master context example)', () => {
    expect(calculateProfit(3000, 0.03)).toBe(90);
  });

  test.each([
    [5000, 80], // 75
    [7000, 110], // 105
    [11000, 170], // 165
    [1000, 20], // 15
  ])('Rs. %i at 1.5%% ending in 5 rounds up to Rs. %i', (changeValue, expected) => {
    expect(calculateProfit(changeValue, 0.015)).toBe(expected);
  });

  test.each([
    [2000, 30],
    [4000, 60],
    [12000, 180],
  ])('Rs. %i at 1.5%% already ending in 0 stays Rs. %i', (changeValue, expected) => {
    expect(calculateProfit(changeValue, 0.015)).toBe(expected);
  });

  test('Rs. 2,500 only Rs.10 -> 3% -> Rs. 75 rounds up to Rs. 80', () => {
    expect(calculateProfit(2500, 0.03)).toBe(80);
  });

  test('a non-whole-rupee profit is not rounded (Rs. 5,500 -> Rs. 82.50)', () => {
    expect(calculateProfit(5500, 0.015)).toBe(82.5);
  });

  test('Rs. 6,000 at 1.5% -> fixed Rs. 100', () => {
    expect(calculateProfit(6000, 0.015)).toBe(100);
  });

  test('Rs. 6,000 only Rs.10 keeps the 3% profit of Rs. 180', () => {
    expect(calculateProfit(6000, 0.03)).toBe(180);
  });
});

describe('calculateAmountCollected', () => {
  test('Rs. 10,000 + Rs. 150 profit -> Rs. 10,150 (master context example)', () => {
    expect(calculateAmountCollected(10000, 150)).toBe(10150);
  });

  test('Rs. 3,000 + Rs. 90 profit -> Rs. 3,090 (master context example)', () => {
    expect(calculateAmountCollected(3000, 90)).toBe(3090);
  });
});

describe('end-to-end calculation chains stay whole-rupee (no float drift)', () => {
  const cases = [
    { bundles_10: 1, bundles_50: 0, bundles_100: 0 },
    { bundles_10: 7, bundles_50: 0, bundles_100: 0 },
    { bundles_10: 13, bundles_50: 9, bundles_100: 17 },
    { bundles_10: 0, bundles_50: 1, bundles_100: 0 },
    { bundles_10: 0, bundles_50: 0, bundles_100: 1 },
  ];

  test.each(cases)('bundles %o produce integer profit and amount_collected', (bundles) => {
    const changeValue = calculateBundleValue(bundles);
    const rate = calculateCommissionRate(bundles);
    const profit = calculateProfit(changeValue, rate);
    const amountCollected = calculateAmountCollected(changeValue, profit);

    expect(Number.isInteger(profit)).toBe(true);
    expect(Number.isInteger(amountCollected)).toBe(true);
    expect(amountCollected).toBe(changeValue + profit);
  });
});

import { decimalTransformer } from './health-unit.entity.js';

describe('decimalTransformer', () => {
  it('converts numeric database values to numbers', () => {
    expect(decimalTransformer.from('-23.550000')).toBe(-23.55);
    expect(decimalTransformer.from(null)).toBeNull();
  });

  it('keeps numeric values when writing', () => {
    expect(decimalTransformer.to(-46.63)).toBe(-46.63);
    expect(decimalTransformer.to(null)).toBeNull();
  });
});

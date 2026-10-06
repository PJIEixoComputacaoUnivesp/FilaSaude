import {
  isSameAddress,
  normalizeNumber,
  normalizeStreet,
} from './address-match.js';

describe('address matching', () => {
  it('ignores case, accents and punctuation in the street', () => {
    expect(normalizeStreet('Rua João Pedro  Sobrinho.')).toBe(
      'RUA JOAO PEDRO SOBRINHO',
    );
    expect(normalizeStreet(null)).toBe('');
  });

  it('treats the variants of "no number" alike', () => {
    for (const value of ['S/N', 's n', 'SN', '', '  ', null, 'Sem número']) {
      expect(normalizeNumber(value)).toBe('SN');
    }
  });

  it('ignores leading zeros in numbers', () => {
    expect(normalizeNumber('01')).toBe('1');
    expect(normalizeNumber('0')).toBe('0');
    expect(normalizeNumber('100-A')).toBe('100A');
  });

  it('matches the same street and number', () => {
    expect(
      isSameAddress(
        { street: 'RUA SERRA AGULHAS NEGRAS', number: '100' },
        { street: 'Rua Serra Agulhas Negras', number: '100' },
      ),
    ).toBe(true);
  });

  it('does not match a different number on the same street', () => {
    // PA Carlito Gonçalves moved from number 13 to 72 on the same street.
    expect(
      isSameAddress(
        { street: 'RUA JOAO PEDRO SOBRINHO', number: '72' },
        { street: 'RUA JOAO PEDRO SOBRINHO', number: '13' },
      ),
    ).toBe(false);
  });

  it('does not match a different street', () => {
    expect(
      isSameAddress(
        { street: 'AVENIDA PREFEITO DR ROQUE VERNALHA', number: '39' },
        { street: 'AVENIDA DOMINGOS PENEDA', number: '39' },
      ),
    ).toBe(false);
  });

  it('never matches when the street is missing', () => {
    expect(
      isSameAddress(
        { street: null, number: '1' },
        { street: null, number: '1' },
      ),
    ).toBe(false);
    expect(
      isSameAddress(
        { street: 'RUA A', number: '1' },
        { street: null, number: '1' },
      ),
    ).toBe(false);
  });

  it('matches two records without a number on the same street', () => {
    expect(
      isSameAddress(
        { street: 'RODOVIA RJ 155', number: 'S/N' },
        { street: 'Rodovia RJ 155', number: null },
      ),
    ).toBe(true);
  });
});

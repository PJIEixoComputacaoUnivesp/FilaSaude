export interface StreetAddress {
  street: string | null;
  number: string | null;
}

function normalizeText(value: string | null): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Compares street names ignoring case, accents and punctuation. */
export function normalizeStreet(value: string | null): string {
  return normalizeText(value);
}

/** Treats "S/N", "SN", blank and "sem número" alike; "01" equals "1". */
export function normalizeNumber(value: string | null): string {
  const text = normalizeText(value).replace(/ /g, '');
  if (text === '' || text === 'SN' || text === 'SEMNUMERO') return 'SN';
  return text.replace(/^0+(?=\d)/, '');
}

/**
 * True when both records name the same street and number. The postal code is
 * ignored because CNES refines it over time without the unit moving. A missing
 * street never matches, since nothing then ties the two records together.
 */
export function isSameAddress(
  current: StreetAddress,
  past: StreetAddress,
): boolean {
  const street = normalizeStreet(current.street);
  if (street === '' || street !== normalizeStreet(past.street)) return false;
  return normalizeNumber(current.number) === normalizeNumber(past.number);
}

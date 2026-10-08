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

/**
 * Treats "S/N", "SN", blank, "sem número" and "0" alike, since CNES uses all
 * of them for a building without a number; "01" equals "1".
 */
export function normalizeNumber(value: string | null): string {
  const text = normalizeText(value).replace(/ /g, '');
  if (text === '' || /^0+$/.test(text) || text === 'SN' || text === 'SEMNUMERO')
    return 'SN';
  return text.replace(/^0+(?=\d)/, '');
}

/**
 * True when both records have the same street and number, a missing street
 * included. Used to check that a unit still sits where a manual correction
 * was made, which is a weaker claim than the history match below: the unit
 * is the same one, so a street missing on both sides is not a mismatch.
 */
export function isSameRecordedAddress(
  left: StreetAddress,
  right: StreetAddress,
): boolean {
  return (
    normalizeStreet(left.street) === normalizeStreet(right.street) &&
    normalizeNumber(left.number) === normalizeNumber(right.number)
  );
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

/** A CNES establishment code: up to 7 digits, padded with zeros to 7. */
export const CNES_CODE_PATTERN = /^\d{1,7}$/;

export function padCnesCode(code: string): string {
  return code.padStart(7, '0');
}

import { BadRequestException } from '@nestjs/common';
import { CNES_CODE_PATTERN, padCnesCode } from './cnes-code.js';

export interface CorrectionInput {
  latitude: number;
  longitude: number;
  method: string;
}

// Brazil, with a margin: catches swapped or mistyped coordinates early.
const LATITUDE_RANGE = [-34, 6] as const;
const LONGITUDE_RANGE = [-75, -28] as const;
const METHOD_MAX_LENGTH = 500;

/** Line breaks and tabs are text; every other control character is not. */
function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 0x20 && code !== 0x0a && code !== 0x09) || code === 0x7f;
  });
}

function coordinate(
  value: unknown,
  name: string,
  [min, max]: readonly [number, number],
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${name} must be a number`);
  }
  if (value < min || value > max) {
    throw new BadRequestException(`${name} must be inside Brazil`);
  }
  // The column keeps 6 decimals, about 10 cm.
  return Math.round(value * 1e6) / 1e6;
}

function text(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${name} must be a string`);
  }
  // The field is a multi-line text area; Windows line breaks count as one.
  const trimmed = value.replace(/\r\n?/g, '\n').trim();
  if (trimmed === '' || trimmed.length > maxLength) {
    throw new BadRequestException(
      `${name} must have between 1 and ${maxLength} characters`,
    );
  }
  if (hasControlCharacters(trimmed)) {
    throw new BadRequestException(
      `${name} must not have control characters other than line breaks`,
    );
  }
  return trimmed;
}

/** The 7-digit CNES code, from the code with or without leading zeros. */
export function parseCnesCode(value: string): string {
  if (!CNES_CODE_PATTERN.test(value)) {
    throw new BadRequestException('Invalid CNES code');
  }
  return padCnesCode(value);
}

export function parseCorrectionInput(body: unknown): CorrectionInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('A JSON object is required');
  }
  const input = body as Record<string, unknown>;
  return {
    latitude: coordinate(input.latitude, 'latitude', LATITUDE_RANGE),
    longitude: coordinate(input.longitude, 'longitude', LONGITUDE_RANGE),
    method: text(input.method, 'method', METHOD_MAX_LENGTH),
  };
}

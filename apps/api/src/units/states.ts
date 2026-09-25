import { BadRequestException } from '@nestjs/common';

export interface BrazilianState {
  abbreviation: string;
  ibgeCode: string;
}

const stateCodes: Record<string, string> = {
  AC: '12',
  AL: '27',
  AP: '16',
  AM: '13',
  BA: '29',
  CE: '23',
  DF: '53',
  ES: '32',
  GO: '52',
  MA: '21',
  MT: '51',
  MS: '50',
  MG: '31',
  PA: '15',
  PB: '25',
  PR: '41',
  PE: '26',
  PI: '22',
  RJ: '33',
  RN: '24',
  RS: '43',
  RO: '11',
  RR: '14',
  SC: '42',
  SP: '35',
  SE: '28',
  TO: '17',
};

const abbreviationsByIbgeCode = new Map(
  Object.entries(stateCodes).map(([abbreviation, ibgeCode]) => [
    ibgeCode,
    abbreviation,
  ]),
);

export function stateAbbreviation(ibgeCode: string): string | undefined {
  return abbreviationsByIbgeCode.get(ibgeCode);
}

export function parseState(value: string): BrazilianState {
  const abbreviation = value.trim().toUpperCase();
  const ibgeCode = stateCodes[abbreviation];

  if (!ibgeCode) {
    throw new BadRequestException('Invalid Brazilian state abbreviation');
  }

  return { abbreviation, ibgeCode };
}

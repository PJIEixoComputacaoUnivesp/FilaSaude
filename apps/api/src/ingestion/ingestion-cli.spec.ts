import { parseIngestionArguments } from './ingestion-cli.js';

describe('parseIngestionArguments', () => {
  it('selects all Brazilian states by default', () => {
    const result = parseIngestionArguments([]);

    expect(result.help).toBe(false);
    expect(result.states).toHaveLength(27);
    expect(result.states).toContainEqual({
      abbreviation: 'SP',
      ibgeCode: '35',
    });
  });

  it('selects a single normalized state', () => {
    expect(parseIngestionArguments(['--state', 'sp']).states).toEqual([
      { abbreviation: 'SP', ibgeCode: '35' },
    ]);
    expect(parseIngestionArguments(['--state=RJ']).states).toEqual([
      { abbreviation: 'RJ', ibgeCode: '33' },
    ]);
  });

  it('treats BR as an explicit national run', () => {
    expect(parseIngestionArguments(['--state=BR']).states).toHaveLength(27);
  });

  it('rejects invalid and unknown arguments', () => {
    expect(() => parseIngestionArguments(['--state'])).toThrow(
      '--state precisa de uma UF',
    );
    expect(() => parseIngestionArguments(['--state=XX'])).toThrow(
      'Invalid Brazilian state abbreviation',
    );
    expect(() => parseIngestionArguments(['--wat'])).toThrow(
      'Argumento desconhecido',
    );
  });
});

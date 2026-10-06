import { BadRequestException } from '@nestjs/common';
import {
  parseCnesCode,
  parseCorrectionInput,
} from './location-correction.input.js';

const valid = {
  latitude: -23.535249,
  longitude: -46.841459,
  verifiedBy: 'Maria Souza',
  method: 'Conferido no mapa oficial da prefeitura',
};

describe('parseCnesCode', () => {
  it.each([
    ['5563704', '5563704'],
    ['113360', '0113360'],
    ['0113360', '0113360'],
    ['1', '0000001'],
  ])('accepts %s as %s', (value, expected) => {
    expect(parseCnesCode(value)).toBe(expected);
  });

  it.each(['', 'abc', '12345678', '-1', '1.5', '../health', '5563704 ', '١٢٣'])(
    'rejects %j',
    (value) => {
      expect(() => parseCnesCode(value)).toThrow(BadRequestException);
    },
  );
});

describe('parseCorrectionInput', () => {
  it('accepts a valid body', () => {
    expect(parseCorrectionInput(valid)).toEqual(valid);
  });

  it('trims the text and rounds the coordinates to 6 decimals', () => {
    expect(
      parseCorrectionInput({
        ...valid,
        latitude: -23.5352491234,
        longitude: -46.8414591234,
        verifiedBy: '  Maria Souza  ',
        method: '\tConferido  ',
      }),
    ).toMatchObject({
      latitude: -23.535249,
      longitude: -46.841459,
      verifiedBy: 'Maria Souza',
    });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'x'],
    ['a number', 1],
  ])('rejects a body that is %s', (_label, body) => {
    expect(() => parseCorrectionInput(body)).toThrow(BadRequestException);
  });

  it.each([
    ['latitude as text', { latitude: '-23.5' }],
    ['a missing latitude', { latitude: undefined }],
    ['an infinite latitude', { latitude: Infinity }],
    ['a NaN longitude', { longitude: NaN }],
    ['a latitude outside Brazil', { latitude: 48.85 }],
    ['a longitude outside Brazil', { longitude: 2.35 }],
    ['swapped coordinates', { latitude: -46.84, longitude: -23.53 }],
    ['no verifier', { verifiedBy: undefined }],
    ['a blank verifier', { verifiedBy: '   ' }],
    ['a verifier that is too long', { verifiedBy: 'x'.repeat(81) }],
    ['a verifier that is not text', { verifiedBy: 42 }],
    ['no method', { method: undefined }],
    ['a method that is too long', { method: 'x'.repeat(501) }],
    ['a method with a line break', { method: 'a\nb' }],
    ['a verifier with a null byte', { verifiedBy: 'a\u0000b' }],
  ])('rejects %s', (_label, override) => {
    expect(() => parseCorrectionInput({ ...valid, ...override })).toThrow(
      BadRequestException,
    );
  });

  it('accepts the limits of the text', () => {
    expect(() =>
      parseCorrectionInput({
        ...valid,
        verifiedBy: 'x'.repeat(80),
        method: 'y'.repeat(500),
      }),
    ).not.toThrow();
  });

  it('ignores fields it does not know', () => {
    expect(
      parseCorrectionInput({ ...valid, cnesCode: '1', extra: true }),
    ).toEqual(valid);
  });
});

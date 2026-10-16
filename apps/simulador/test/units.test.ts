import assert from 'node:assert/strict';
import test from 'node:test';
import { selectUnits, type SimulatorUnit } from '../src/units.ts';

const units: SimulatorUnit[] = [
  { id: '2222222', name: 'Unidade B', municipalityCode: '3550308', city: 'São Paulo', state: 'SP', latitude: -23.55, longitude: -46.63 },
  { id: '1111111', name: 'Unidade A', municipalityCode: '3550308', city: 'São Paulo', state: 'SP', latitude: -23.56, longitude: -46.64 },
  { id: '3333333', name: 'Unidade C', municipalityCode: '3550308', city: 'São Paulo', state: 'SP', latitude: null, longitude: null },
  { id: '4444444', name: 'Unidade D', municipalityCode: '3304557', city: 'Rio de Janeiro', state: 'RJ', latitude: -22.9, longitude: -43.2 },
];

test('seleciona por município e ordena por CNES de forma determinística', () => {
  const selected = selectUnits(units, {
    unitCnes: [],
    municipalityCode: '3550308',
    city: null,
    latitude: null,
    longitude: null,
    radiusKm: 25,
    maxUnits: 10,
  });

  assert.deepEqual(selected.map((unit) => unit.id), ['1111111', '2222222', '3333333']);
});

test('seleciona por cidade sem diferenciar acentos ou maiúsculas', () => {
  const selected = selectUnits(units, {
    unitCnes: [],
    municipalityCode: null,
    city: 'SAO PAULO',
    latitude: null,
    longitude: null,
    radiusKm: 25,
    maxUnits: 2,
  });

  assert.deepEqual(selected.map((unit) => unit.id), ['1111111', '2222222']);
});

test('prioriza distância e respeita o raio', () => {
  const selected = selectUnits(units, {
    unitCnes: [],
    municipalityCode: null,
    city: null,
    latitude: -23.551,
    longitude: -46.631,
    radiusKm: 1,
    maxUnits: 10,
  });

  assert.deepEqual(selected.map((unit) => unit.id), ['2222222']);
});

test('permite selecionar CNES explicitamente e informa códigos ausentes', () => {
  const selected = selectUnits(units, {
    unitCnes: ['2222222', '1111111'],
    municipalityCode: null,
    city: null,
    latitude: null,
    longitude: null,
    radiusKm: 25,
    maxUnits: 10,
  });
  assert.deepEqual(selected.map((unit) => unit.id), ['1111111', '2222222']);

  assert.throws(
    () => selectUnits(units, {
      unitCnes: ['9999999'],
      municipalityCode: null,
      city: null,
      latitude: null,
      longitude: null,
      radiusKm: 25,
      maxUnits: 10,
    }),
    /CNES não encontrado/,
  );
});

test('exige um critério explícito de seleção', () => {
  assert.throws(
    () => selectUnits(units, {
      unitCnes: [],
      municipalityCode: null,
      city: null,
      latitude: null,
      longitude: null,
      radiusKm: 25,
      maxUnits: 10,
    }),
    /Informe CNES/,
  );
});

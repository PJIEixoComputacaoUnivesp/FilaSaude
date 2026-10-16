import assert from 'node:assert/strict';
import test from 'node:test';
import { signSnapshot } from '../src/signing.ts';
import {
  sendSnapshot,
  SnapshotTransportNetworkError,
} from '../src/transport.ts';
import type { OccupancySnapshot } from '../src/simulation.ts';

const snapshot: OccupancySnapshot = {
  eventId: '01K5T2S6C4TZ1K9TR6F89A2M7X',
  type: 'occupancy.snapshot.v1',
  unitCnes: '1234567',
  occurredAt: '2026-10-15T12:00:00.000Z',
  observedAt: '2026-10-15T12:00:01.000Z',
  categories: [{ code: 'observation', capacity: 20, occupied: 13 }],
};

test('assina o corpo bruto conforme o contrato', () => {
  assert.equal(
    signSnapshot(
      'test-secret-for-occupancy-vector-2026',
      '1790000000',
      '{"eventId":"01K5T2S6C4TZ1K9TR6F89A2M7X","type":"occupancy.snapshot.v1","unitCnes":"1234567","occurredAt":"2026-09-25T14:30:00Z","observedAt":"2026-09-25T14:30:05Z","categories":[{"code":"observation","capacity":20,"occupied":13}]}',
    ),
    'da56c33183345cfa94a63775704a2b52655350b77dae47c84a836db888cc62e5',
  );
});

test('envia o mesmo corpo e repete com novo timestamp após 429', async () => {
  const requests: RequestInit[] = [];
  const timestamps: string[] = [];
  const waits: number[] = [];
  let calls = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls += 1;
    requests.push(init!);
    timestamps.push(new Headers(init?.headers).get('X-Webhook-Timestamp')!);
    if (calls === 1) return new Response(null, { status: 429, headers: { 'Retry-After': '2' } });
    return new Response(null, { status: 202 });
  };

  const result = await sendSnapshot(snapshot, {
    apiUrl: 'http://localhost:3000',
    sourceId: 'occupancy-feed',
    sourceSecret: 'test-secret',
    now: () => new Date('2026-10-15T12:00:00.000Z'),
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
    fetchImpl,
  });

  assert.deepEqual(result, { attempts: 2, status: 202 });
  assert.equal(requests[0].body, requests[1].body);
  assert.notEqual(timestamps[0], timestamps[1]);
  assert.deepEqual(waits, [2000]);
});

test('respeita Retry-After mesmo acima do limite do backoff', async () => {
  const waits: number[] = [];
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response(null, { status: 429, headers: { 'Retry-After': '60' } })
      : new Response(null, { status: 202 });
  };

  await sendSnapshot(snapshot, {
    apiUrl: 'http://localhost:3000',
    sourceId: 'occupancy-feed',
    sourceSecret: 'test-secret',
    maxDelayMs: 30_000,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
    fetchImpl,
  });

  assert.deepEqual(waits, [60_000]);
});

test('interrompe o envio quando o sinal é abortado', async () => {
  const controller = new AbortController();
  let calls = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new Error('fetch cancelado')),
        { once: true },
      );
      queueMicrotask(() => controller.abort());
    });
  };

  await assert.rejects(
    sendSnapshot(snapshot, {
      apiUrl: 'http://localhost:3000',
      sourceId: 'occupancy-feed',
      sourceSecret: 'test-secret',
      signal: controller.signal,
      fetchImpl,
    }),
    /fetch cancelado/,
  );
  assert.equal(calls, 1);
});

test('repete falhas transitórias com backoff e não repete erros 4xx', async () => {
  let calls = 0;
  const waits: number[] = [];
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(null, { status: 503 });
  };

  await assert.rejects(
    sendSnapshot(snapshot, {
      apiUrl: 'http://localhost:3000',
      sourceId: 'occupancy-feed',
      sourceSecret: 'test-secret',
      maxAttempts: 3,
      baseDelayMs: 10,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
      fetchImpl,
    }),
    /não aceito após 3 tentativas/,
  );
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);

  calls = 0;
  await assert.rejects(
    sendSnapshot(snapshot, {
      apiUrl: 'http://localhost:3000',
      sourceId: 'occupancy-feed',
      sourceSecret: 'test-secret',
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, { status: 422 });
      },
    }),
    /status 422/,
  );
  assert.equal(calls, 1);
});

test('preserva tentativas ao esgotar falhas de rede', async () => {
  await assert.rejects(
    sendSnapshot(snapshot, {
      apiUrl: 'http://localhost:3000',
      sourceId: 'occupancy-feed',
      sourceSecret: 'test-secret',
      maxAttempts: 3,
      sleep: async () => undefined,
      fetchImpl: async () => {
        throw new Error('timeout');
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof SnapshotTransportNetworkError);
      assert.equal(error.attempts, 3);
      return /Não foi possível enviar o webhook após 3 tentativas/.test(
        error.message,
      );
    },
  );
});

test('exige o segredo da fonte antes de enviar', async () => {
  await assert.rejects(
    sendSnapshot(snapshot, {
      apiUrl: 'http://localhost:3000',
      sourceId: 'occupancy-feed',
      sourceSecret: null,
    }),
    /SIMULATOR_SOURCE_SECRET é obrigatória/,
  );
});

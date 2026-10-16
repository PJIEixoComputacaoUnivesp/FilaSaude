import { EventEmitter } from 'node:events';
import type { MessageEvent } from '@nestjs/common';
import { OccupancyStreamService } from './occupancy-stream.service.js';
import { loadOccupancySettings } from './occupancy-settings.js';

function fixture(enabled = true) {
  const clients: EventEmitter[] = [];
  const runners: {
    connect: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
    isReleased: boolean;
  }[] = [];
  const database = {
    createQueryRunner: vi.fn(() => {
      const client = new EventEmitter();
      clients.push(client);
      const runner = {
        connect: vi.fn().mockResolvedValue(client),
        query: vi.fn().mockResolvedValue([]),
        release: vi.fn().mockResolvedValue(undefined),
        isReleased: false,
      };
      runners.push(runner);
      return runner;
    }),
  };
  const occupancy = {
    findCurrentForUnits: vi
      .fn()
      .mockResolvedValue({ data: [], metadata: { simulated: true } }),
  };
  const service = new OccupancyStreamService(
    database as never,
    occupancy as never,
    loadOccupancySettings({ OCCUPANCY_SIMULATION_ENABLED: String(enabled) }),
  );
  return { service, database, clients, runners, occupancy };
}

describe('OccupancyStreamService', () => {
  afterEach(() => vi.useRealTimers());

  it('shares one listener and coalesces committed notifications for every client', async () => {
    vi.useFakeTimers();
    const { service, database, clients, runners, occupancy } = fixture();
    await service.onApplicationBootstrap();
    const first: MessageEvent[] = [];
    const second: MessageEvent[] = [];
    const a = service.stream().subscribe((event) => first.push(event));
    const b = service.stream().subscribe((event) => second.push(event));
    try {
      expect(database.createQueryRunner).toHaveBeenCalledTimes(1);
      expect(runners[0].query).toHaveBeenCalledWith(
        'LISTEN filasaude_occupancy',
      );
      expect(first[0].type).toBe('ready');
      clients[0].emit('notification', { channel: 'different_channel' });
      await vi.advanceTimersByTimeAsync(101);
      expect(first).toHaveLength(1);
      for (let index = 0; index < 5; index++)
        clients[0].emit('notification', {
          channel: 'filasaude_occupancy',
          payload: '1234567',
        });
      await vi.advanceTimersByTimeAsync(101);
      expect(occupancy.findCurrentForUnits).toHaveBeenCalledOnce();
      expect(occupancy.findCurrentForUnits).toHaveBeenCalledWith(['1234567']);
      expect(first.map((event) => event.type)).toEqual([
        'ready',
        'occupancy.updated',
      ]);
      expect(second.map((event) => event.type)).toEqual([
        'ready',
        'occupancy.updated',
      ]);
      expect(BigInt(first[1].id!)).toBeGreaterThan(BigInt(first[0].id!));
      expect(first[1].data).toMatchObject({ metadata: { simulated: true } });
      await vi.advanceTimersByTimeAsync(15_000);
      expect(first.some((event) => event.type === 'heartbeat')).toBe(true);
    } finally {
      a.unsubscribe();
      b.unsubscribe();
      await service.onModuleDestroy();
    }
    expect(runners[0].query).toHaveBeenCalledWith(
      'UNLISTEN filasaude_occupancy',
    );
    expect(runners[0].release).toHaveBeenCalledTimes(1);
    expect(clients[0].listenerCount('notification')).toBe(0);
  });

  it('resynchronizes clients after the PostgreSQL connection is restored', async () => {
    vi.useFakeTimers();
    const { service, database, clients } = fixture();
    await service.onApplicationBootstrap();
    const events: MessageEvent[] = [];
    const subscription = service
      .stream()
      .subscribe((event) => events.push(event));
    try {
      clients[0].emit('error', new Error('connection lost'));
      expect(events.at(-1)?.type).toBe('unavailable');
      await vi.advanceTimersByTimeAsync(2_200);
      expect(database.createQueryRunner).toHaveBeenCalledTimes(2);
      expect(events.at(-1)?.type).toBe('resync');
      expect(clients[0].listenerCount('notification')).toBe(0);
    } finally {
      subscription.unsubscribe();
      await service.onModuleDestroy();
    }
  });

  it('closes SSE subscribers and releases the listener on shutdown', async () => {
    const { service } = fixture();
    await service.onApplicationBootstrap();
    const complete = vi.fn();
    service.stream().subscribe({ complete });
    await service.onModuleDestroy();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('does not reserve a database connection while public occupancy is disabled', async () => {
    const { service, database } = fixture(false);
    await service.onApplicationBootstrap();
    await service.onModuleDestroy();
    expect(database.createQueryRunner).not.toHaveBeenCalled();
  });
});

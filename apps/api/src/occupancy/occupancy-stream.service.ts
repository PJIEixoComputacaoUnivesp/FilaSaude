import {
  Inject,
  Injectable,
  Logger,
  type MessageEvent,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { EventEmitter } from 'node:events';
import { DataSource, type QueryRunner } from 'typeorm';
import { interval, map, merge, Observable, of, Subject, takeUntil } from 'rxjs';
import {
  OCCUPANCY_SETTINGS,
  type OccupancySettings,
} from './occupancy-settings.js';

import {
  OccupancyService,
  type OccupancyResponse,
} from './occupancy.service.js';

const CHANNEL = 'filasaude_occupancy';
const HEARTBEAT_MS = 15_000;
const RECONNECT_MS = 2_000;

/**
 * One PostgreSQL listener per API, shared by all SSE connections. NOTIFY is
 * delivered after commit, including batches processed by other API instances.
 * Committed notifications load only the affected units; a reconnect requests a fresh
 * snapshot, so no retained event log or replay cursor is needed (#78, #79).
 */
@Injectable()
export class OccupancyStreamService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(OccupancyStreamService.name);
  private readonly updates = new Subject<OccupancyResponse>();
  private readonly resynchronized = new Subject<void>();
  private readonly pendingUnits = new Set<string>();
  private flushTimer: NodeJS.Timeout | undefined;
  private flushing: Promise<void> | null = null;
  private subscribers = 0;
  private readonly unavailable = new Subject<void>();
  private readonly destroyed = new Subject<void>();
  private listener: { runner: QueryRunner; client: EventEmitter } | null = null;
  private retry: NodeJS.Timeout | undefined;
  private connecting: Promise<void> | null = null;
  private stopped = false;
  private connected = false;
  // Increasing IDs within this API process; reconnects resync via REST rather
  // than assuming that a cursor survives a restart or a different replica.
  private sequence = Date.now() * 1000;

  constructor(
    private readonly database: DataSource,
    private readonly occupancy: OccupancyService,
    @Inject(OCCUPANCY_SETTINGS) private readonly settings: OccupancySettings,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.settings.publicEnabled) await this.connect();
  }

  stream(): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      this.subscribers++;
      const signal = (type: string) => ({
        type,
        data: { simulated: true, serverTime: new Date().toISOString() },
      });
      const subscription = merge(
        of(signal(this.connected ? 'ready' : 'unavailable')),
        this.updates.pipe(map((data) => ({ type: 'occupancy.updated', data }))),
        this.resynchronized.pipe(map(() => signal('resync'))),
        this.unavailable.pipe(map(() => signal('unavailable'))),
        interval(HEARTBEAT_MS).pipe(map(() => signal('heartbeat'))),
      )
        .pipe(
          map((frame) => ({
            ...frame,
            id: String(++this.sequence),
            retry: RECONNECT_MS,
          })),
          takeUntil(this.destroyed),
        )
        .subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        this.subscribers--;
        if (this.subscribers === 0) {
          clearTimeout(this.flushTimer);
          this.flushTimer = undefined;
          this.pendingUnits.clear();
        }
      };
    });
  }

  private readonly notification = (message: {
    channel?: string;
    payload?: string;
  }): void => {
    if (
      message.channel !== CHANNEL ||
      !message.payload ||
      !/^\d{7}$/.test(message.payload) ||
      this.subscribers === 0
    )
      return;
    this.pendingUnits.add(message.payload);
    this.scheduleFlush();
  };

  private scheduleFlush(delayMs = 100): void {
    if (
      this.flushTimer ||
      this.flushing ||
      this.stopped ||
      this.subscribers === 0
    )
      return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flushing = this.flush().finally(() => {
        this.flushing = null;
        if (this.pendingUnits.size > 0) this.scheduleFlush(RECONNECT_MS);
      });
    }, delayMs);
    this.flushTimer.unref();
  }

  private async flush(): Promise<void> {
    const unitCnes = [...this.pendingUnits];
    this.pendingUnits.clear();
    if (unitCnes.length === 0 || this.subscribers === 0) return;
    try {
      const delta = await this.occupancy.findCurrentForUnits(unitCnes);
      if (!this.stopped) this.updates.next(delta);
    } catch {
      for (const id of unitCnes) this.pendingUnits.add(id);
      this.unavailable.next();
    }
  }

  private readonly disconnected = (): void => {
    this.connected = false;
    this.unavailable.next();
    void this.release().finally(() => this.scheduleReconnect());
  };

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting) return;
    this.connecting = this.openListener();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async openListener(): Promise<void> {
    const runner = this.database.createQueryRunner();
    try {
      const client = (await runner.connect()) as EventEmitter;
      this.listener = { runner, client };
      client.on('notification', this.notification);
      client.on('error', this.disconnected);
      client.on('end', this.disconnected);
      await runner.query(`LISTEN ${CHANNEL}`);
      if (this.stopped) return;
      this.connected = true;
      // Covers every update committed while LISTEN was disconnected.
      this.resynchronized.next();
    } catch {
      this.logger.warn('Occupancy notifications disconnected; reconnecting.');
      this.connected = false;
      this.unavailable.next();
      if (!this.listener) await runner.release().catch(() => undefined);
      await this.release();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = undefined;
      void this.connect();
    }, RECONNECT_MS);
    this.retry.unref();
  }

  private async release(): Promise<void> {
    const listener = this.listener;
    this.listener = null;
    if (!listener) return;
    listener.client.removeListener('notification', this.notification);
    listener.client.removeListener('error', this.disconnected);
    listener.client.removeListener('end', this.disconnected);
    try {
      if (!listener.runner.isReleased)
        await listener.runner.query(`UNLISTEN ${CHANNEL}`);
    } catch {
      // A lost connection is already unusable; release still has to run.
    } finally {
      await listener.runner.release().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.retry);
    clearTimeout(this.flushTimer);
    this.destroyed.next();
    this.destroyed.complete();
    await this.connecting;
    await this.release();
    await this.flushing;
    this.updates.complete();
    this.resynchronized.complete();
    this.unavailable.complete();
  }
}

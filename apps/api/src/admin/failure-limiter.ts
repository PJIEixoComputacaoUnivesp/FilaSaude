import { Injectable } from '@nestjs/common';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 20;

/**
 * Counts failed admin sign-ins in one window shared by all callers. It is
 * global on purpose: it needs no client address, which behind a proxy is
 * either unavailable or spoofable, and a valid token is never counted or
 * blocked, so it cannot lock an administrator out.
 *
 * What it does and does not do: invalid attempts beyond the limit get a
 * different status (429) and the log says so once, but a correct token still
 * works while it is blocked, so it does not stop someone from guessing. The
 * protection against guessing is the length and randomness of the tokens.
 */
@Injectable()
export class FailureLimiter {
  private failures: number[] = [];
  private blockAnnounced = false;
  private readonly seen = new Set<string>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Whether invalid attempts are being refused right now. */
  isBlocked(): boolean {
    this.prune();
    return this.failures.length >= MAX_FAILURES;
  }

  /**
   * Records a failure and returns how many are in the window. Nothing is kept
   * beyond the limit, so a flood of bad tokens cannot grow memory or make each
   * request slower.
   */
  record(): number {
    this.prune();
    if (this.failures.length < MAX_FAILURES) this.failures.push(this.now());
    return this.failures.length;
  }

  /** True once per window, when the block has just started. */
  announceBlock(): boolean {
    if (!this.isBlocked() || this.blockAnnounced) return false;
    this.blockAnnounced = true;
    return true;
  }

  /** True the first time a key is seen, so one warning is logged, not one per guard. */
  firstTime(key: string): boolean {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  get limit(): number {
    return MAX_FAILURES;
  }

  /** How many failures are being kept. */
  get size(): number {
    return this.failures.length;
  }

  private prune(): void {
    const oldest = this.now() - WINDOW_MS;
    this.failures = this.failures.filter((time) => time > oldest);
    if (this.failures.length === 0) this.blockAnnounced = false;
  }
}

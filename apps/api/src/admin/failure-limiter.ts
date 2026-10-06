import { Injectable } from '@nestjs/common';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 20;

/**
 * Counts failed admin sign-ins in one window shared by all callers. It is
 * global on purpose: it needs no client address, which behind a proxy is
 * either unavailable or spoofable, and a valid token is never counted or
 * blocked, so it cannot lock an administrator out. Only invalid attempts
 * beyond the limit are refused.
 */
@Injectable()
export class FailureLimiter {
  private failures: number[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  /** Whether invalid attempts are being refused right now. */
  isBlocked(): boolean {
    this.prune();
    return this.failures.length >= MAX_FAILURES;
  }

  /** Records a failure and returns how many are in the window. */
  record(): number {
    this.prune();
    this.failures.push(this.now());
    return this.failures.length;
  }

  get limit(): number {
    return MAX_FAILURES;
  }

  private prune(): void {
    const oldest = this.now() - WINDOW_MS;
    this.failures = this.failures.filter((time) => time > oldest);
  }
}

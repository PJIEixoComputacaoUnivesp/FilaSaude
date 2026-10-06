import { FailureLimiter } from './failure-limiter.js';

describe('FailureLimiter', () => {
  const clock = { now: 1_000_000 };
  const limiter = () => new FailureLimiter(() => clock.now);

  beforeEach(() => {
    clock.now = 1_000_000;
  });

  it('does not block until the limit is reached', () => {
    const instance = limiter();

    for (let i = 0; i < instance.limit - 1; i++) instance.record();

    expect(instance.isBlocked()).toBe(false);
    instance.record();
    expect(instance.isBlocked()).toBe(true);
  });

  it('counts the failures in the window', () => {
    const instance = limiter();

    expect(instance.record()).toBe(1);
    expect(instance.record()).toBe(2);
  });

  it('forgets failures after the window, so a block lifts by itself', () => {
    const instance = limiter();
    for (let i = 0; i < instance.limit; i++) instance.record();
    expect(instance.isBlocked()).toBe(true);

    clock.now += 10 * 60 * 1000 + 1;

    expect(instance.isBlocked()).toBe(false);
    expect(instance.record()).toBe(1);
  });

  it('forgets only the failures that left the window', () => {
    const instance = limiter();
    instance.record();
    clock.now += 6 * 60 * 1000;
    instance.record();
    clock.now += 6 * 60 * 1000;

    expect(instance.record()).toBe(2);
  });

  it('keeps no more than the limit, so a flood cannot grow memory', () => {
    const instance = limiter();

    for (let i = 0; i < 100_000; i++) instance.record();

    expect(instance.size).toBe(instance.limit);
    expect(instance.isBlocked()).toBe(true);
  });

  it('unblocks when the window passes, even after a flood', () => {
    const instance = limiter();
    for (let i = 0; i < 1000; i++) instance.record();

    clock.now += 10 * 60 * 1000 + 1;

    expect(instance.isBlocked()).toBe(false);
    expect(instance.size).toBe(0);
  });

  it('announces the start of a block once per window', () => {
    const instance = limiter();
    for (let i = 0; i < instance.limit; i++) instance.record();

    expect(instance.announceBlock()).toBe(true);
    expect(instance.announceBlock()).toBe(false);

    clock.now += 10 * 60 * 1000 + 1;
    for (let i = 0; i < instance.limit; i++) instance.record();

    expect(instance.announceBlock()).toBe(true);
  });

  it('does not announce a block that has not started', () => {
    expect(limiter().announceBlock()).toBe(false);
  });

  it('says a key is new only the first time', () => {
    const instance = limiter();

    expect(instance.firstTime('config')).toBe(true);
    expect(instance.firstTime('config')).toBe(false);
    expect(instance.firstTime('other')).toBe(true);
  });
});

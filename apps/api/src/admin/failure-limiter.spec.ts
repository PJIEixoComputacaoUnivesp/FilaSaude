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
});

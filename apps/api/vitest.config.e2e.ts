import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // The inbox processor runs on a timer; e2e tests use a fake database.
    env: { OCCUPANCY_PROCESSOR_ENABLED: 'false' },
  },
});

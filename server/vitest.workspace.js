export default [
  {
    test: {
      name: 'unit',
      include: ['tests/**/*.test.js'],
      exclude: ['tests/**/*.db.test.js'],
    },
  },
  {
    test: {
      name: 'db',
      include: ['tests/**/*.db.test.js'],
      // These suites share one container on one fixed port and reset the
      // schema between tests, so two of them at once would corrupt each other.
      // A single fork runs every database file in one process, one after the
      // other, which is the only arrangement that actually holds.
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      fileParallelism: false,
      globalSetup: ['./tests/support/globalDb.js'],
      testTimeout: 60_000,
      hookTimeout: 180_000,
    },
  },
];

import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    server: {
      deps: {
        inline: ['@verdaccio/core'],
      },
    },
    coverage: {
      exclude: ['node_modules', '_storage', 'fixtures'],
    },
  },
});

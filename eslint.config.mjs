import verdaccio from '@verdaccio/eslint-config';

export default [
  {
    ignores: ['generators/**', 'src/app/templates/**', 'docs/**', '**/dist/**', '**/node_modules/**', 'new_structure/**', 'coverage/**', 'cypress/**', '*.config.ts', '*.config.mjs'],
  },
  ...verdaccio,
];

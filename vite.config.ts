import {resolve} from 'path';
import {defineConfig} from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      rollupTypes: true,
      tsconfigPath: './tsconfig.json',
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      output: {
        exports: 'named',
      },
      external: [
        // Node builtins
        /^node:/,
        'stream',
        'path',
        'crypto',
        // Google Cloud SDK
        /^@google-cloud\//,
        // Verdaccio
        /^@verdaccio\//,
        // Other deps
        'debug',
        'http-errors',
      ],
    },
    outDir: 'lib',
    sourcemap: true,
    minify: false,
  },
});

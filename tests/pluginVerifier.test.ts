import {join} from 'node:path';

import {describe, expect, test} from 'vitest';

import {verifyPlugin} from '@verdaccio/plugin-verifier';

describe('Plugin loading verification', () => {
  test('should be loadable by verdaccio as a storage plugin', async () => {
    const result = await verifyPlugin({
      pluginPath: 'google-cloud',
      category: 'storage',
      pluginsFolder: join(import.meta.dirname, '..', '..'),
      pluginConfig: {
        bucket: 'test-bucket',
        projectId: 'test-project',
      },
    });

    expect(result.success).toBe(true);
    expect(result.pluginsLoaded).toBe(1);
  });
});

import StorageHelper from '../src/storage-helper';
import type {GoogleCloudConfig} from '../types';

import {describe, expect, test} from 'vitest';

const KEY = Symbol('KEY');

const createDatastore = (rows: object[]): any => ({
  KEY,
  createQuery: (kind: string) => ({kind}),
  runQuery: () => Promise.resolve([rows, {}]),
});

const config = {bucket: 'test-bucket', projectId: 'test-project'} as unknown as GoogleCloudConfig;

describe('StorageHelper', () => {
  describe('getEntities', () => {
    // Regression: packages are stored under a NAME key, so the key carries `name` and
    // `id` is undefined. Returning only the id left remove() rebuilding the key with
    // datastore.int(undefined), which threw and made unpublish impossible.
    test('returns the entity key for name-based keys', async () => {
      const nameKey = {kind: 'Package', name: '@scope/pkg'};
      const datastore = createDatastore([{name: '@scope/pkg', [KEY]: nameKey}]);
      const helper = new StorageHelper(datastore, {} as any, config);

      const entities = await helper.getEntities('Package');

      expect(entities).toHaveLength(1);
      expect(entities[0].name).toBe('@scope/pkg');
      expect(entities[0].key).toBe(nameKey);
    });

    test('skips rows without a name', async () => {
      const datastore = createDatastore([{[KEY]: {kind: 'Package', name: 'x'}}]);
      const helper = new StorageHelper(datastore, {} as any, config);

      expect(await helper.getEntities('Package')).toHaveLength(0);
    });
  });
});

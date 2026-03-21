import {beforeEach, describe, expect, test, vi} from 'vitest';

import type {Logger} from '@verdaccio/types';

import GoogleCloudDatabase, {ERROR_MISSING_CONFIG} from '../src/data-storage';
import storageConfig from './partials/config';

// Mock Google Cloud SDK with proper class constructors
vi.mock('@google-cloud/datastore', () => {
  return {
    Datastore: class MockDatastore {
      KEY = Symbol('KEY');
      key(...args: any[]) {
        return args;
      }
      save() {
        return Promise.resolve([]);
      }
      get() {
        return Promise.resolve([{secret: 'test-secret'}]);
      }
      upsert() {
        return Promise.resolve(undefined);
      }
      delete() {
        return Promise.resolve(undefined);
      }
      int(v: any) {
        return v;
      }
      createQuery() {
        const query = {filter: () => query};
        return query;
      }
      runQuery() {
        return Promise.resolve([[], {}]);
      }
    },
  };
});

vi.mock('@google-cloud/storage', () => {
  return {
    Storage: class MockStorage {
      bucket() {
        return {
          file() {
            return {
              exists: () => Promise.resolve([false]),
              save: () => Promise.resolve(undefined),
              download: () => Promise.resolve([Buffer.from('{}')]),
              delete: () => Promise.resolve(undefined),
            };
          },
        };
      }
    },
  };
});

const createLogger = (): Logger => ({
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
  warn: vi.fn(),
  http: vi.fn(),
  trace: vi.fn(),
});

describe('Google Cloud Database', () => {
  let logger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createLogger();
  });

  const getCloudDatabase = (config = storageConfig, log = logger) => {
    return new GoogleCloudDatabase(config as any, {logger: log, config: config as any});
  };

  describe('instance creation', () => {
    test('should create an instance', () => {
      const cloudDatabase = getCloudDatabase();
      expect(cloudDatabase).toBeDefined();
    });

    test('should fail when config is missing', () => {
      expect(() => {
        new GoogleCloudDatabase(undefined as any, {logger, config: undefined as any});
      }).toThrow(ERROR_MISSING_CONFIG);
    });

    test('should fail when bucket name is missing', () => {
      const badConfig = {...storageConfig, bucket: ''} as any;
      expect(() => {
        getCloudDatabase(badConfig);
      }).toThrow('Google Cloud Storage requires a bucket name, please define one.');
    });
  });

  describe('getSecret / setSecret', () => {
    test('should get a secret', async () => {
      const cloudDatabase = getCloudDatabase();
      const secret = await cloudDatabase.getSecret();
      expect(secret).toBe('test-secret');
    });

    test('should set a secret', async () => {
      const cloudDatabase = getCloudDatabase();
      await cloudDatabase.setSecret('new-secret');
    });
  });

  describe('add / remove / get', () => {
    test('should add a package', async () => {
      const cloudDatabase = getCloudDatabase();
      await new Promise<void>((resolve, reject) => {
        cloudDatabase.add('test-pkg', (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    test('should get a package storage instance', () => {
      const cloudDatabase = getCloudDatabase();
      const store = cloudDatabase.getPackageStorage('newInstance');
      expect(store).not.toBeNull();
      expect(store).toBeDefined();
    });
  });

  describe('token methods', () => {
    test('should save a token', async () => {
      const cloudDatabase = getCloudDatabase();
      await cloudDatabase.saveToken({
        user: 'testuser',
        key: 'abc123',
        token: 'token-value',
        readonly: false,
        created: '2026-01-01',
      } as any);
    });

    test('should delete a token', async () => {
      const cloudDatabase = getCloudDatabase();
      await cloudDatabase.deleteToken('testuser', 'abc123');
    });

    test('should read tokens', async () => {
      const cloudDatabase = getCloudDatabase();
      const tokens = await cloudDatabase.readTokens({user: 'testuser'} as any);
      expect(tokens).toEqual([]);
    });
  });

  describe('search', () => {
    test('should handle promise pattern search', async () => {
      const cloudDatabase = getCloudDatabase();
      const results = await cloudDatabase.search({text: 'test'});
      expect(results).toEqual([]);
    });
  });

  describe('init', () => {
    test('should verify connectivity', async () => {
      const cloudDatabase = getCloudDatabase();
      await cloudDatabase.init();
    });
  });
});

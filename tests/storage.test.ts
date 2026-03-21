import {beforeEach, describe, expect, test, vi} from 'vitest';

import type {Logger} from '@verdaccio/types';

import type {GoogleCloudConfig} from '../types';
import GoogleCloudStorageHandler from '../src/storage';
import type {IStorageHelper} from '../src/storage-helper';
import {generatePackage} from './partials/utils.helpers';

const createLogger = (): Logger => ({
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
  warn: vi.fn(),
  http: vi.fn(),
  trace: vi.fn(),
});

const createMockHelper = (fileExists = false): IStorageHelper => {
  const mockFile = {
    name: 'mock-file',
    exists: vi.fn().mockResolvedValue([fileExists]),
    save: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue([Buffer.from(JSON.stringify({name: 'test-pkg'}))]),
    delete: vi.fn().mockResolvedValue([{statusCode: 200}]),
    createWriteStream: vi.fn(),
    createReadStream: vi.fn(),
  };

  return {
    datastore: {} as any,
    createQuery: vi.fn(),
    runQuery: vi.fn(),
    getEntities: vi.fn(),
    getBucket: vi.fn().mockReturnValue({
      file: vi.fn().mockReturnValue(mockFile),
    }),
    buildFilePath: vi.fn().mockReturnValue(mockFile),
  };
};

const createConfig = (): GoogleCloudConfig =>
  ({
    bucket: 'test-bucket',
    projectId: 'test-project',
  }) as unknown as GoogleCloudConfig;

describe('GoogleCloudStorageHandler', () => {
  let logger: Logger;
  let config: GoogleCloudConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createLogger();
    config = createConfig();
  });

  describe('createPackage', () => {
    test('should create a package when it does not exist', async () => {
      const helper = createMockHelper(false);
      const store = new GoogleCloudStorageHandler('test-pkg', helper, config, logger);
      const pkg = generatePackage('test-pkg');

      const err = await new Promise<any>((resolve) => {
        store.createPackage('test-pkg', pkg, resolve);
      });
      expect(err).toBeNull();
    });

    test('should fail when package already exists', async () => {
      const helper = createMockHelper(true);
      const store = new GoogleCloudStorageHandler('test-pkg', helper, config, logger);
      const pkg = generatePackage('test-pkg');

      const err = await new Promise<any>((resolve) => {
        store.createPackage('test-pkg', pkg, resolve);
      });
      expect(err).not.toBeNull();
      expect(err.code).toBe(409);
    });
  });

  describe('savePackage', () => {
    test('should save a package', async () => {
      const helper = createMockHelper();
      const store = new GoogleCloudStorageHandler('test-pkg', helper, config, logger);
      const pkg = generatePackage('test-pkg');

      const err = await new Promise<any>((resolve) => {
        store.savePackage('test-pkg', pkg, resolve);
      });
      expect(err).toBeNull();
    });
  });

  describe('readPackage', () => {
    test('should read a package', async () => {
      const helper = createMockHelper();
      const store = new GoogleCloudStorageHandler('test-pkg', helper, config, logger);

      const {err, data} = await new Promise<any>((resolve) => {
        store.readPackage('test-pkg', (e: any, d: any) => resolve({err: e, data: d}));
      });
      expect(err).toBeNull();
      expect(data).toBeDefined();
      expect(data.name).toBe('test-pkg');
    });
  });

  describe('deletePackage', () => {
    test('should delete a package file', async () => {
      const helper = createMockHelper();
      const store = new GoogleCloudStorageHandler('test-pkg', helper, config, logger);

      const err = await new Promise<any>((resolve) => {
        store.deletePackage('package.json', resolve);
      });
      expect(err).toBeNull();
    });

    test('should fail on delete error', async () => {
      const helper = createMockHelper();
      const mockFile = {
        name: 'mock-file',
        delete: vi.fn().mockRejectedValue(new Error('delete failed')),
      };
      (helper.buildFilePath as any).mockReturnValue(mockFile);

      const store = new GoogleCloudStorageHandler('test-pkg', helper, config, logger);

      const err = await new Promise<any>((resolve) => {
        store.deletePackage('package.json', resolve);
      });
      expect(err).not.toBeNull();
      expect(err.code).toBe(500);
    });
  });

  describe('removePackage', () => {
    test('should remove an entire package', async () => {
      const helper = createMockHelper();
      const mockFile = {
        name: 'test-pkg',
        delete: vi.fn().mockResolvedValue(undefined),
      };
      (helper.getBucket as any).mockReturnValue({
        file: vi.fn().mockReturnValue(mockFile),
      });

      const store = new GoogleCloudStorageHandler('test-pkg', helper, config, logger);

      const err = await new Promise<any>((resolve) => {
        store.removePackage(resolve);
      });
      expect(err).toBeNull();
    });
  });
});

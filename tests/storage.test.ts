import type {Logger} from '@verdaccio/types';

import GoogleCloudStorageHandler from '../src/storage';
import type {IStorageHelper} from '../src/storage-helper';
import type {GoogleCloudConfig} from '../types';
import {generatePackage} from './partials/utils.helpers';

import {PassThrough} from 'stream';
import {beforeEach, describe, expect, test, vi} from 'vitest';

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
    // Regression: `${name}` is not an object in GCS, the files live under `${name}/`.
    // Deleting the bare name 404s, so unpublish answered 422 and every object leaked.
    test('should remove an entire package by prefix', async () => {
      const helper = createMockHelper();
      const deleteFiles = vi.fn().mockResolvedValue([[]]);
      (helper.getBucket as any).mockReturnValue({deleteFiles});

      const store = new GoogleCloudStorageHandler('test-pkg', helper, config, logger);

      const err = await new Promise<any>((resolve) => {
        store.removePackage(resolve);
      });
      expect(err).toBeNull();
      expect(deleteFiles).toHaveBeenCalledWith({prefix: 'test-pkg/'});
    });
  });

  describe('readTarball', () => {
    // Regression: GCS reports a missing object through BOTH 'response' (404) and 'error'.
    // Emitting twice throws once verdaccio has dropped its listener, and the uncaught
    // exception takes the whole registry process down.
    test('emits a single error when the object is missing', async () => {
      const bucketStream = new PassThrough();
      const helper = createMockHelper();
      (helper.getBucket as any).mockReturnValue({
        file: vi.fn().mockReturnValue({
          name: 'test-pkg/missing.tgz',
          createReadStream: vi.fn().mockReturnValue(bucketStream),
        }),
      });

      const store = new GoogleCloudStorageHandler('test-pkg', helper, config, logger);
      const stream = store.readTarball('missing.tgz');

      const errors: any[] = [];
      stream.on('error', (err) => errors.push(err));

      // both paths fire for the same missing object
      bucketStream.emit('response', {statusCode: 404, headers: {}});
      bucketStream.emit('error', Object.assign(new Error('Not Found'), {code: 404}));
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe(404);
    });
  });
});

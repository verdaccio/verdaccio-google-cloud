import type {DatastoreOptions} from '@google-cloud/datastore';
import {Datastore} from '@google-cloud/datastore';
import type {entity} from '@google-cloud/datastore/build/src/entity';
import type {RunQueryResponse} from '@google-cloud/datastore/build/src/query';
import type {StorageOptions} from '@google-cloud/storage';
import {Storage} from '@google-cloud/storage';
import debugCore from 'debug';

import {errorUtils} from '@verdaccio/core';
import type {searchUtils} from '@verdaccio/core';
import type {Callback, Config, Logger, Token, TokenFilter} from '@verdaccio/types';

import type {GoogleCloudConfig} from '../types';
import setConfigValue from './setConfigValue';
import type {IStorageHelper} from './storage-helper';
import StorageHelper from './storage-helper';
import GoogleCloudStorageHandler from './storage';

type Key = entity.Key;

const debug = debugCore('verdaccio:plugin:google-cloud');

export const ERROR_MISSING_CONFIG =
  'google cloud storage missing config. Add `store.google-cloud` to your config file';

export default class GoogleCloudDatabase {
  private helper: IStorageHelper;
  public logger: Logger;
  public config: GoogleCloudConfig;
  private kind: string;
  private bucketName: string;

  public constructor(config: Config, options: {logger: Logger; config: Config}) {
    if (!config) {
      throw new Error(ERROR_MISSING_CONFIG);
    }

    this.logger = options.logger;

    // verdaccio 7+ passes plugin config directly, older versions nest it under config.store
    const pluginConfig = config.store?.['google-cloud'] ?? {};
    this.config = Object.assign({}, config, pluginConfig) as GoogleCloudConfig;

    // Resolve config values from environment variables
    this.config.bucket = setConfigValue(this.config.bucket);
    this.config.projectId = setConfigValue(this.config.projectId);
    this.config.keyFilename = setConfigValue(this.config.keyFilename);
    this.config.apiEndpoint = setConfigValue(this.config.apiEndpoint);
    this.config.datastoreEndpoint = setConfigValue(this.config.datastoreEndpoint);

    this.kind = this.config.kind || 'VerdaccioDataStore';

    if (!this.config.bucket) {
      throw new Error('Google Cloud Storage requires a bucket name, please define one.');
    }
    this.bucketName = this.config.bucket;

    const {datastore, storage} = this._createClients();
    this.helper = new StorageHelper(datastore, storage, this.config);

    debug(
      'initialized bucket=%o projectId=%o kind=%o',
      this.bucketName,
      this.config.projectId,
      this.kind
    );
    this.logger.trace(
      {bucket: this.bucketName, projectId: this.config.projectId, kind: this.kind},
      'google-cloud: plugin initialized bucket=@{bucket} projectId=@{projectId} kind=@{kind}'
    );
  }

  public async init(): Promise<void> {
    debug('init: verifying connectivity');
    this.logger.trace('google-cloud: [init] verifying connectivity');
    await this.getSecret();
    debug('init: connectivity verified');
    this.logger.trace('google-cloud: [init] connectivity verified');
  }

  private _getGoogleOptions(): DatastoreOptions {
    const options: DatastoreOptions = {};

    if (this.config.projectId) {
      options.projectId = this.config.projectId;
    } else if (process.env.GOOGLE_CLOUD_VERDACCIO_PROJECT_ID) {
      options.projectId = process.env.GOOGLE_CLOUD_VERDACCIO_PROJECT_ID;
    }

    const keyFileName = this.config.keyFilename || process.env.GOOGLE_CLOUD_VERDACCIO_KEY;
    if (keyFileName) {
      options.keyFilename = keyFileName;
      this.logger.warn(
        'google-cloud: using credentials file — only recommended for local development'
      );
    }

    if (this.config.datastoreEndpoint) {
      options.apiEndpoint = this.config.datastoreEndpoint;
    }

    debug('google options: %o', options);
    return options;
  }

  private _getStorageOptions(): StorageOptions {
    const options: StorageOptions = {};

    if (this.config.projectId) {
      options.projectId = this.config.projectId;
    } else if (process.env.GOOGLE_CLOUD_VERDACCIO_PROJECT_ID) {
      options.projectId = process.env.GOOGLE_CLOUD_VERDACCIO_PROJECT_ID;
    }

    const keyFileName = this.config.keyFilename || process.env.GOOGLE_CLOUD_VERDACCIO_KEY;
    if (keyFileName) {
      options.keyFilename = keyFileName;
    }

    if (this.config.apiEndpoint) {
      options.apiEndpoint = this.config.apiEndpoint;
    }

    return options;
  }

  public search(...args: any[]): any {
    // Callback pattern: search(onPackage, onEnd)
    if (typeof args[0] === 'function') {
      const onPackage = args[0] as (item: any, cb: any) => void;
      const onEnd = args[1] as () => void;
      debug('search (callback): iterating packages from Datastore');
      this.logger.trace('google-cloud: [search] callback pattern, iterating packages');
      void (async (): Promise<void> => {
        try {
          const entities = await this.helper.getEntities(this.kind);
          debug('search: found %d packages', entities.length);
          for (const item of entities) {
            await new Promise<void>((resolve): void => {
              onPackage(
                {
                  name: item.name,
                  path: item.name,
                  time: Date.now(),
                },
                resolve
              );
            });
          }
          onEnd();
        } catch (err) {
          debug('search error: %o', err);
          this.logger.trace({err}, 'google-cloud: [search] error during iteration');
          onEnd();
        }
      })();
      return;
    }

    // Promise pattern: search(query): Promise<SearchItem[]>
    debug('search (promise): returning empty results');
    this.logger.trace('google-cloud: [search] promise pattern, returning empty results');
    return Promise.resolve([]);
  }

  public async filterByQuery(
    results: searchUtils.SearchItemPkg[],
    _query: searchUtils.SearchQuery
  ): Promise<searchUtils.SearchItemPkg[]> {
    return results;
  }

  public async getScore(_pkg: searchUtils.SearchItemPkg): Promise<searchUtils.Score> {
    return {
      final: 1,
      detail: {
        quality: 1,
        popularity: 1,
        maintenance: 1,
      },
    };
  }

  public async saveToken(token: Token): Promise<void> {
    debug('saveToken user=%o key=%o', token.user, token.key);
    this.logger.trace(
      {user: token.user, tokenKey: token.key},
      'google-cloud: [saveToken] saving token for user=@{user} key=@{tokenKey}'
    );
    const datastore = this.helper.datastore;
    const key = datastore.key(['Token', `${token.user}:${token.key}`]);
    await datastore.upsert({
      key,
      data: {
        user: token.user,
        key: token.key,
        token: token.token,
        readonly: token.readonly,
        created: token.created,
      },
    });
    debug('saveToken user=%o key=%o stored', token.user, token.key);
    this.logger.trace(
      {user: token.user, tokenKey: token.key},
      'google-cloud: [saveToken] stored user=@{user} key=@{tokenKey}'
    );
  }

  public async deleteToken(user: string, tokenKey: string): Promise<void> {
    debug('deleteToken user=%o key=%o', user, tokenKey);
    this.logger.trace(
      {user, tokenKey},
      'google-cloud: [deleteToken] deleting token user=@{user} key=@{tokenKey}'
    );
    const datastore = this.helper.datastore;
    const key = datastore.key(['Token', `${user}:${tokenKey}`]);
    await datastore.delete(key);
    debug('deleteToken user=%o key=%o deleted', user, tokenKey);
    this.logger.trace(
      {user, tokenKey},
      'google-cloud: [deleteToken] deleted user=@{user} key=@{tokenKey}'
    );
  }

  public async readTokens(filter: TokenFilter): Promise<Token[]> {
    debug('readTokens user=%o', filter.user);
    this.logger.trace(
      {user: filter.user},
      'google-cloud: [readTokens] querying tokens for user=@{user}'
    );
    const datastore = this.helper.datastore;
    const query = datastore.createQuery('Token').filter('user', filter.user);
    const [entities] = await datastore.runQuery(query);

    const tokens: Token[] = entities.map((entity: any) => ({
      user: entity.user as string,
      key: entity.key as string,
      token: entity.token as string,
      readonly: entity.readonly as boolean,
      created: entity.created as string,
    }));
    debug('readTokens user=%o found=%d', filter.user, tokens.length);
    this.logger.trace(
      {user: filter.user, count: tokens.length},
      'google-cloud: [readTokens] found @{count} tokens for user=@{user}'
    );
    return tokens;
  }

  public async getSecret(): Promise<string> {
    const key: Key = this.helper.datastore.key(['Secret', 'secret']);
    debug('getSecret');
    this.logger.trace('google-cloud: [datastore getSecret] init');

    try {
      const data = await this.helper.datastore.get(key);
      const entities = data[0];
      debug('getSecret found=%o', !!entities);
      this.logger.trace({data}, 'google-cloud: [datastore getSecret] response @{data}');
      if (!entities) {
        return '';
      }
      return entities.secret;
    } catch (err) {
      debug('getSecret failed: %o', err);
      this.logger.trace({err}, 'google-cloud: [getSecret] error, returning empty secret');
      return '';
    }
  }

  public async setSecret(secret: string): Promise<void> {
    const key = this.helper.datastore.key(['Secret', 'secret']);
    const entity = {
      key,
      data: {secret},
    };
    debug('setSecret');
    this.logger.trace('google-cloud: [datastore setSecret] added');
    await this.helper.datastore.upsert(entity);
  }

  public add(name: string, cb: Callback): void {
    const datastore = this.helper.datastore;
    const key = datastore.key([this.kind, name]);
    const data = {name};
    debug('add package=%o', name);
    this.logger.trace({name}, 'google-cloud: [datastore add] @{name} init');

    void (async (): Promise<void> => {
      try {
        await datastore.save({key, data});
        debug('add package=%o success', name);
        this.logger.trace({name}, 'google-cloud: [datastore add] @{name} has been added');
        cb(null);
      } catch (err: any) {
        debug('add package=%o failed: %o', name, err);
        this.logger.trace(
          {name, err: err.message},
          'google-cloud: [datastore add] @{name} error @{err}'
        );
        cb(errorUtils.getInternalError(err.message));
      }
    })();
  }

  public remove(name: string, cb: Callback): void {
    debug('remove package=%o', name);
    this.logger.trace({name}, 'google-cloud: [datastore remove] @{name} init');

    void (async (): Promise<void> => {
      try {
        const entities = await this.helper.getEntities(this.kind);
        for (const item of entities) {
          if (item.name === name) {
            const datastore = this.helper.datastore;
            const key = datastore.key([this.kind, datastore.int(item.id)]);
            await datastore.delete(key);
          }
        }
        debug('remove package=%o success', name);
        cb(null);
      } catch (err: any) {
        debug('remove package=%o failed: %o', name, err);
        cb(errorUtils.getInternalError(err.message));
      }
    })();
  }

  public get(cb: Callback): void {
    debug('get all packages');
    this.logger.trace('google-cloud: [datastore get] init');

    void (async (): Promise<void> => {
      try {
        const query = this.helper.datastore.createQuery(this.kind);
        const data: RunQueryResponse = await this.helper.runQuery(query);
        const response: object[] = data[0];

        const names = response.reduce((accumulator: string[], task: any): string[] => {
          accumulator.push(task.name);
          return accumulator;
        }, []);

        debug('get packages count=%d', names.length);
        this.logger.trace({names}, 'google-cloud: [datastore get] names @{names}');
        cb(null, names);
      } catch (err: any) {
        debug('get packages failed: %o', err);
        cb(errorUtils.getInternalError(err.message));
      }
    })();
  }

  public getPackageStorage(packageInfo: string): GoogleCloudStorageHandler {
    const {helper, config, logger} = this;
    debug('getPackageStorage package=%o', packageInfo);
    return new GoogleCloudStorageHandler(packageInfo, helper, config, logger);
  }

  private _createClients(): {datastore: Datastore; storage: Storage} {
    const datastoreOptions = this._getGoogleOptions();
    const storageOptions = this._getStorageOptions();
    const datastore = new Datastore(datastoreOptions);
    const storage = new Storage(storageOptions);
    return {datastore, storage};
  }
}

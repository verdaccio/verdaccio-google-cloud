import type {Datastore, Query} from '@google-cloud/datastore';
import type {RunQueryResponse} from '@google-cloud/datastore/build/src/query';
import type {Bucket, File, Storage} from '@google-cloud/storage';

import type {GoogleCloudConfig} from '../types';

export interface IStorageHelper {
  datastore: Datastore;
  createQuery(key: string, valueQuery: string): Query;
  runQuery(query: Query): Promise<RunQueryResponse>;
  getEntities(key: string): Promise<Entity[]>;
  getBucket(): Bucket;
  buildFilePath(name: string, fileName: string): File;
}

export default class StorageHelper implements IStorageHelper {
  public datastore: Datastore;
  private storage: Storage;
  private config: GoogleCloudConfig;

  public constructor(datastore: Datastore, storage: Storage, config: GoogleCloudConfig) {
    this.datastore = datastore;
    this.config = config;
    this.storage = storage;
  }

  public createQuery(key: string, valueQuery: string): Query {
    const query = this.datastore.createQuery(key).filter('name', valueQuery);
    return query;
  }

  public buildFilePath(name: string, fileName: string): File {
    return this.getBucket().file(`${name}/${fileName}`);
  }

  public getBucket(): Bucket {
    return this.storage.bucket(this.config.bucket);
  }

  public async runQuery(query: Query): Promise<RunQueryResponse> {
    const result = await this.datastore.runQuery(query);
    return result;
  }

  public async getEntities(key: string): Promise<Entity[]> {
    const datastore = this.datastore;
    const query = datastore.createQuery(key);
    const dataQuery: RunQueryResponse = await datastore.runQuery(query);
    const response: object[] = dataQuery[0];

    const data = response.reduce((accumulator: Entity[], task: any): Entity[] => {
      const taskKey = task[datastore.KEY];
      if (task.name) {
        accumulator.push({
          id: taskKey.id,
          name: task.name,
        });
      }
      return accumulator;
    }, []);
    return data;
  }
}

export interface Entity {
  name: string;
  id: number;
}

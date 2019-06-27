import Datastore from '@google-cloud/datastore';
import { Storage } from '@google-cloud/storage';
import { Query } from '@google-cloud/datastore/query';

export interface IStorageHelper {
  datastore: Datastore;
  createQuery(key: string, valueQuery: string): Query;
  runQuery(query: Query): Promise<any>;
  updateEntity(key: string, excludeFromIndexes: any, data: any): Promise<any>;
  getFile(bucketName: string, path: string): Promise<void>;
  deleteEntity(key: string, itemId: any): Promise<any>;
  getEntities(key: string): Promise<any>;
}

export default class StorageHelper implements IStorageHelper {
  public datastore: Datastore;
  private storage: Storage;

  public constructor(datastore: Datastore, storage: Storage) {
    this.datastore = datastore;
    this.storage = storage;
  }

  public createQuery(key: string, valueQuery: string): Query {
    const query = this.datastore.createQuery(key).filter('name', valueQuery);

    return query;
  }

  public async runQuery(query: Query): Promise<any> {
    const result = await this.datastore.runQuery(query);

    return result;
  }

  public async updateEntity(key: string, excludeFromIndexes: any, data: any): Promise<any> {
    const entity = {
      key,
      excludeFromIndexes,
      data
    };

    const result = await this.datastore.update(entity);

    return result;
  }

  // FIXME: not sure whether we need this
  public async getFile(bucketName: string, path: string): Promise<void> {
    // const myBucket = this.storage.bucket(bucketName);
    // const file = myBucket.file(path);
    // const data = await file.get();
    // const fileData = data[0];
    // const apiResponse = data[1];
    // // console.log('fileData', fileData);
    // // console.log('apiResponse', apiResponse);
  }

  public async deleteEntity(key: string, itemId: any): Promise<any> {
    const keyToDelete = this.datastore.key([key, this.datastore.int(itemId)]);
    const deleted = await this.datastore.delete(keyToDelete);

    return deleted;
  }

  public async getEntities(key: string): Promise<any> {
    const datastore = this.datastore;
    const query = datastore.createQuery(key);
    const dataQuery = await datastore.runQuery(query);
    const data = dataQuery[0].reduce((accumulator: any, task: any): any => {
      const taskKey = task[datastore.KEY];
      if (task.name) {
        accumulator.push({
          id: taskKey.id,
          name: task.name
        });
      }
      return accumulator;
    }, []);
    return data;
  }
}

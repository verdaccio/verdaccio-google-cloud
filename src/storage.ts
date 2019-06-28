import { UploadTarball, ReadTarball } from '@verdaccio/streams';
import { Package, Callback, Logger, IPackageStorageManager } from '@verdaccio/types';
import { VerdaccioConfigGoogleStorage } from './types';
import { Bucket, File, DownloadResponse } from '@google-cloud/storage';
import StorageHelper from './storage-helper';
import { VerdaccioError, getInternalError, getBadRequest, getNotFound, getConflict } from '@verdaccio/commons-api';
import { Response } from 'request';

export const noSuchFile = 'ENOENT';
export const fileExist = 'EEXISTS';
export const pkgFileName = 'package.json';
export const defaultValidation = 'crc32c';

declare type StorageType = Package | void;

const packageAlreadyExist = function(name: string): VerdaccioError {
  return getConflict(`${name} package already exist`);
};

class GoogleCloudStorageHandler implements IPackageStorageManager {
  public config: VerdaccioConfigGoogleStorage;
  public logger: Logger;
  private key: string;
  private helper: StorageHelper;
  private name: string;
  private storage: any;

  public constructor(name: string, storage: any, datastore: any, helper: any, config: VerdaccioConfigGoogleStorage, logger: Logger) {
    this.name = name;
    this.storage = storage;
    this.logger = logger;
    this.helper = helper;
    this.config = config;
    this.key = 'VerdaccioMetadataStore';
  }

  public updatePackage(name: string, updateHandler: Callback, onWrite: Callback, transformPackage: Function, onEnd: Callback): void {
    this._readPackage(name)
      .then(
        (metadata: Package): void => {
          updateHandler(
            metadata,
            (err: VerdaccioError): void => {
              if (err) {
                this.logger.error({ name: name, err: err.message }, 'gcloud: on write update @{name} package has failed err: @{err}');
                return onEnd(err);
              }
              try {
                onWrite(name, transformPackage(metadata), onEnd);
              } catch (err) {
                this.logger.error({ name: name, err: err.message }, 'gcloud: on write update @{name} package has failed err: @{err}');
                return onEnd(getInternalError(err.message));
              }
            }
          );
        },
        (err: Error): void => {
          this.logger.error({ name: name, err: err.message }, 'gcloud: update @{name} package has failed err: @{err}');
          onEnd(getInternalError(err.message));
        }
      )
      .catch(
        (err: Error): Callback => {
          this.logger.error({ name, error: err }, 'gcloud: trying to update @{name} and was not found on storage err: @{error}');
          return onEnd(getNotFound());
        }
      );
  }

  public deletePackage(fileName: string, cb: Callback): void {
    const file = this._buildFilePath(this.name, fileName);
    this.logger.debug({ name: file.name }, 'gcloud: deleting @{name} from storage');
    try {
      file
        .delete()
        .then(
          (data: [Response]): void => {
            const apiResponse = data[0];
            this.logger.debug({ name: file.name }, 'gcloud: @{name} was deleted successfully from storage');
            cb(null, apiResponse);
          }
        )
        .catch(
          (err: Error): void => {
            this.logger.error({ name: file.name, err: err.message }, 'gcloud: delete @{name} file has failed err: @{err}');
            cb(getInternalError(err.message));
          }
        );
    } catch (err) {
      this.logger.error({ name: file.name, err: err.message }, 'gcloud: delete @{name} file has failed err: @{err}');
      cb(getInternalError('something went wrong'));
    }
  }

  public removePackage(callback: Callback): void {
    // remove all files from storage
    const file = this._getBucket().file(`${this.name}`);
    this.logger.debug({ name: file.name }, 'gcloud: removing the package @{name} from storage');
    file.delete().then(
      () => {
        this.logger.debug({ name: file.name }, 'gcloud: package @{name} was deleted successfully from storage');
        callback(null);
      },
      (err: any) => {
        this.logger.error({ name: file.name, err: err.message }, 'gcloud: delete @{name} package has failed err: @{err}');
        callback(getInternalError(err.message));
      }
    );
  }

  public createPackage(name: string, metadata: Object, cb: Function): void {
    this.logger.debug({ name }, 'gcloud: creating new package for @{name}');
    this._fileExist(name, pkgFileName).then(
      (exist: boolean): void => {
        if (exist) {
          this.logger.debug({ name }, 'gcloud: creating @{name} has failed, it already exist');
          cb(packageAlreadyExist(name));
        } else {
          this.logger.debug({ name }, 'gcloud: creating @{name} on storage');
          this.savePackage(name, metadata, cb);
        }
      },
      (err: Error): void => {
        this.logger.error({ name: name, err: err.message }, 'gcloud: create package @{name} has failed err: @{err}');
        cb(getInternalError(err.message));
      }
    );
  }

  public savePackage(name: string, value: Object, cb: Function): void {
    this.logger.debug({ name }, 'gcloud: saving package for @{name}');
    this._savePackage(name, value)
      .then(
        (): void => {
          this.logger.debug({ name }, 'gcloud: @{name} has been saved successfully on storage');
          cb(null);
        }
      )
      .catch(
        (err: Error): void => {
          this.logger.error({ name: name, err: err.message }, 'gcloud: save package @{name} has failed err: @{err}');
          return cb(err);
        }
      );
  }

  private _savePackage(name: string, metadata: Object): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const file = this._buildFilePath(name, pkgFileName);
      try {
        await file.save(this._convertToString(metadata), {
          validation: this.config.validation || defaultValidation,
          /**
           * When resumable is `undefined` - it will default to `true`as per GC Storage documentation:
           * `Resumable uploads are automatically enabled and must be shut off explicitly by setting options.resumable to false`
           * @see https://cloud.google.com/nodejs/docs/reference/storage/2.5.x/File#createWriteStream
           */
          resumable: this.config.resumable
        });
        resolve(null);
      } catch (err) {
        reject(getInternalError(err.message));
      }
    });
  }

  private _convertToString(value: any): string {
    return JSON.stringify(value, null, '\t');
  }

  public readPackage(name: string, cb: Function): void {
    this.logger.debug({ name }, 'gcloud: reading package for @{name}');
    this._readPackage(name)
      .then(json => {
        this.logger.debug({ name }, 'gcloud: package @{name} was fetched from storage');
        cb(null, json);
      })
      .catch(err => {
        this.logger.debug({ name: name, err: err.message }, 'gcloud: read package @{name} has failed err: @{err}');
        cb(err);
      });
  }

  private _buildFilePath(name: string, fileName: string): File {
    return this._getBucket().file(`${name}/${fileName}`);
  }

  private _fileExist(name: string, fileName: string): Promise<boolean> {
    return new Promise(
      async (resolve, reject): Promise<void> => {
        const file: File = this._buildFilePath(name, fileName);
        try {
          const data = await file.exists();
          const exist = data[0];

          resolve(exist);
          this.logger.debug({ name: name, exist }, 'gcloud: check whether @{name} exist successfully: @{exist}');
        } catch (err) {
          this.logger.error({ name: file.name, err: err.message }, 'gcloud: check exist package @{name} has failed, cause: @{err}');

          reject(getInternalError(err.message));
        }
      }
    );
  }

  private async _readPackage(name: string): Promise<Package> {
    return new Promise(
      async (resolve, reject): Promise<void> => {
        const file = this._buildFilePath(name, pkgFileName);

        try {
          const content: DownloadResponse = await file.download();
          this.logger.debug({ name: this.name }, 'gcloud: @{name} was found on storage');
          const response: Package = JSON.parse(content[0].toString('utf8'));

          resolve(response);
        } catch (err) {
          this.logger.debug({ name: this.name }, 'gcloud: @{name} package not found on storage');
          reject(getNotFound());
        }
      }
    );
  }

  public writeTarball(name: string): UploadTarball {
    const uploadStream: UploadTarball = new UploadTarball({});

    try {
      this._fileExist(this.name, name).then(
        exist => {
          if (exist) {
            this.logger.debug({ url: this.name }, 'gcloud:  @{url} package already exist on storage');
            uploadStream.emit('error', packageAlreadyExist(name));
          } else {
            const file = this._getBucket().file(`${this.name}/${name}`);
            this.logger.info({ url: file.name }, 'gcloud: the @{url} is being uploaded to the storage');
            const fileStream = file.createWriteStream({
              validation: this.config.validation || defaultValidation
            });
            uploadStream.done = () => {
              uploadStream.on('end', () => {
                fileStream.on('response', () => {
                  this.logger.debug({ url: file.name }, 'gcloud: @{url} has been successfully uploaded to the storage');
                  uploadStream.emit('success');
                });
              });
            };

            fileStream._destroy = function(err) {
              // this is an error when user is not authenticated
              // [BadRequestError: Could not authenticate request
              //  getaddrinfo ENOTFOUND www.googleapis.com www.googleapis.com:443]
              if (err) {
                uploadStream.emit('error', getBadRequest(err.message));
                fileStream.emit('close');
              }
            };

            fileStream.on('open', () => {
              this.logger.debug({ url: file.name }, 'gcloud: upload streem has been opened for @{url}');
              uploadStream.emit('open');
            });

            fileStream.on('error', (err: any) => {
              this.logger.error({ url: file.name }, 'gcloud: upload stream has failed for @{url}');
              fileStream.end();
              uploadStream.emit('error', getBadRequest(err.message));
            });

            uploadStream.abort = () => {
              this.logger.warn({ url: file.name }, 'gcloud: upload stream has been aborted for @{url}');
              fileStream.destroy(undefined);
            };

            uploadStream.pipe(fileStream);
            uploadStream.emit('open');
          }
        },
        err => {
          uploadStream.emit('error', getInternalError(err.message));
        }
      );
    } catch (err) {
      uploadStream.emit('error', err);
    }
    return uploadStream;
  }

  public readTarball(name: string): ReadTarball {
    const readTarballStream: ReadTarball = new ReadTarball({});
    const file = this._getBucket().file(`${this.name}/${name}`);
    const fileStream = file.createReadStream();
    this.logger.debug({ url: file.name }, 'gcloud: reading tarball from @{url}');

    readTarballStream.abort = function() {
      fileStream.destroy(undefined);
    };

    fileStream
      .on('error', (err: any) => {
        if (err.code === 404) {
          this.logger.debug({ url: file.name }, 'gcloud: tarball @{url} do not found on storage');
          readTarballStream.emit('error', getNotFound());
        } else {
          this.logger.error({ url: file.name }, 'gcloud: tarball @{url} has failed to be retrieved from storage');
          readTarballStream.emit('error', getBadRequest(err.message));
        }
      })
      .on('response', response => {
        const size = response.headers['content-length'];
        const { statusCode } = response;
        if (statusCode !== 404) {
          if (size) {
            readTarballStream.emit('open');
          }

          if (parseInt(size, 10) === 0) {
            this.logger.error({ url: file.name }, 'gcloud: tarball @{url} was fetched from storage and it is empty');
            readTarballStream.emit('error', getInternalError('file content empty'));
          } else if (parseInt(size, 10) > 0 && statusCode === 200) {
            readTarballStream.emit('content-length', response.headers['content-length']);
          }
        } else {
          this.logger.debug({ url: file.name }, 'gcloud: tarball @{url} do not found on storage');
          readTarballStream.emit('error', getNotFound());
        }
      })
      .pipe(readTarballStream);
    return readTarballStream;
  }

  private _getBucket(): Bucket {
    return this.storage.bucket(this.config.bucket);
  }
}

export default GoogleCloudStorageHandler;

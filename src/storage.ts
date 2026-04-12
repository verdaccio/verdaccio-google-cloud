import type {File} from '@google-cloud/storage';
import debugCore from 'debug';
import {PassThrough} from 'stream';
import type {Readable} from 'stream';

import {errorUtils} from '@verdaccio/core';
import type {VerdaccioError} from '@verdaccio/core';
import type {Callback, Logger, Package} from '@verdaccio/types';

import type {GoogleCloudConfig} from '../types';
import type {IStorageHelper} from './storage-helper';

const debug = debugCore('verdaccio:plugin:google-cloud:storage');

export const pkgFileName = 'package.json';
export const defaultValidation = 'crc32c';

const packageAlreadyExist = function (name: string): VerdaccioError {
  return errorUtils.getConflict(`${name} package already exist`);
};

export default class GoogleCloudStorageHandler {
  public config: GoogleCloudConfig;
  public logger: Logger;
  private key: string;
  private helper: IStorageHelper;
  private name: string;

  public constructor(
    name: string,
    helper: IStorageHelper,
    config: GoogleCloudConfig,
    logger: Logger
  ) {
    this.name = name;
    this.logger = logger;
    this.helper = helper;
    this.config = config;
    this.key = 'VerdaccioMetadataStore';
  }

  public updatePackage(
    name: string,
    updateHandler: Callback,
    onWrite: Callback,
    transformPackage: (...args: any[]) => any,
    onEnd: Callback
  ): void {
    this._readPackage(name)
      .then((metadata: Package): void => {
        updateHandler(metadata, (err: VerdaccioError): void => {
          if (err) {
            this.logger.error(
              {name, err: err.message},
              'gcloud: on write update @{name} package has failed err: @{err}'
            );
            return onEnd(err);
          }
          try {
            onWrite(name, transformPackage(metadata), onEnd);
          } catch (writeErr: any) {
            this.logger.error(
              {name, err: writeErr.message},
              'gcloud: on write update @{name} package has failed err: @{err}'
            );
            return onEnd(errorUtils.getInternalError(writeErr.message));
          }
        });
      })
      .catch((err: Error): void => {
        this.logger.error(
          {name, error: err},
          'gcloud: trying to update @{name} and was not found on storage err: @{error}'
        );
        onEnd(errorUtils.getNotFound());
      });
  }

  public deletePackage(fileName: string, cb: Callback): void {
    const file = this.helper.buildFilePath(this.name, fileName);
    debug('deletePackage file=%o', file.name);
    this.logger.trace({name: file.name}, 'gcloud: deleting @{name} from storage');
    file
      .delete()
      .then((): void => {
        debug('deletePackage file=%o success', file.name);
        this.logger.trace(
          {name: file.name},
          'gcloud: @{name} was deleted successfully from storage'
        );
        cb(null);
      })
      .catch((err: Error): void => {
        this.logger.error(
          {name: file.name, err: err.message},
          'gcloud: delete @{name} file has failed err: @{err}'
        );
        cb(errorUtils.getInternalError(err.message));
      });
  }

  public removePackage(callback: Callback): void {
    const file = this.helper.getBucket().file(`${this.name}`);
    debug('removePackage package=%o', file.name);
    this.logger.trace({name: file.name}, 'gcloud: removing the package @{name} from storage');
    file.delete().then(
      (): void => {
        debug('removePackage package=%o success', file.name);
        this.logger.trace(
          {name: file.name},
          'gcloud: package @{name} was deleted successfully from storage'
        );
        callback(null);
      },
      (err: Error): void => {
        this.logger.error(
          {name: file.name, err: err.message},
          'gcloud: delete @{name} package has failed err: @{err}'
        );
        callback(errorUtils.getInternalError(err.message));
      }
    );
  }

  public createPackage(name: string, metadata: Package, cb: Callback): void {
    debug('createPackage name=%o', name);
    this.logger.trace({name}, 'gcloud: creating new package for @{name}');
    this._fileExist(name, pkgFileName).then(
      (exist: boolean): void => {
        if (exist) {
          debug('createPackage name=%o already exists', name);
          this.logger.trace({name}, 'gcloud: creating @{name} has failed, it already exist');
          cb(packageAlreadyExist(name));
        } else {
          debug('createPackage name=%o creating', name);
          this.logger.trace({name}, 'gcloud: creating @{name} on storage');
          this.savePackage(name, metadata, cb);
        }
      },
      (err: Error): void => {
        this.logger.error(
          {name, err: err.message},
          'gcloud: create package @{name} has failed err: @{err}'
        );
        cb(errorUtils.getInternalError(err.message));
      }
    );
  }

  public savePackage(name: string, value: Package, cb: Callback): void {
    debug('savePackage name=%o', name);
    this.logger.trace({name}, 'gcloud: saving package for @{name}');
    this._savePackage(name, value)
      .then((): void => {
        debug('savePackage name=%o success', name);
        this.logger.trace({name}, 'gcloud: @{name} has been saved successfully on storage');
        cb(null);
      })
      .catch((err: Error): void => {
        this.logger.error(
          {name, err: err.message},
          'gcloud: save package @{name} has failed err: @{err}'
        );
        return cb(err);
      });
  }

  private async _savePackage(name: string, metadata: Package): Promise<null | VerdaccioError> {
    const file = this.helper.buildFilePath(name, pkgFileName);
    try {
      await file.save(this._convertToString(metadata), {
        validation: this.config.validation || defaultValidation,
        resumable: this.config.resumable,
      });
      return null;
    } catch (err: any) {
      throw errorUtils.getInternalError(err.message);
    }
  }

  private _convertToString(value: Package): string {
    return JSON.stringify(value, null, '\t');
  }

  public readPackage(name: string, cb: Callback): void {
    debug('readPackage name=%o', name);
    this.logger.trace({name}, 'gcloud: reading package for @{name}');
    this._readPackage(name)
      .then((json: Package): void => {
        debug('readPackage name=%o success', name);
        this.logger.trace({name}, 'gcloud: package @{name} was fetched from storage');
        cb(null, json);
      })
      .catch((err: Error): void => {
        this.logger.trace(
          {name, err: err.message},
          'gcloud: read package @{name} has failed err: @{err}'
        );
        cb(err);
      });
  }

  private async _fileExist(name: string, fileName: string): Promise<boolean> {
    const file: File = this.helper.buildFilePath(name, fileName);
    try {
      const data = await file.exists();
      const exist = data[0];
      debug('fileExist name=%o fileName=%o exists=%o', name, fileName, exist);
      this.logger.trace(
        {name, exist},
        'gcloud: check whether @{name} exist successfully: @{exist}'
      );
      return exist;
    } catch (err: any) {
      this.logger.error(
        {name: file.name, err: err.message},
        'gcloud: check exist package @{name} has failed, cause: @{err}'
      );
      throw errorUtils.getInternalError(err.message);
    }
  }

  private async _readPackage(name: string): Promise<Package> {
    const file = this.helper.buildFilePath(name, pkgFileName);
    try {
      const content = await file.download();
      debug('readPackage name=%o found', this.name);
      this.logger.trace({name: this.name}, 'gcloud: @{name} was found on storage');
      const response: Package = JSON.parse(content[0].toString('utf8'));
      return response;
    } catch {
      debug('readPackage name=%o not found', this.name);
      this.logger.trace({name: this.name}, 'gcloud: @{name} package not found on storage');
      throw errorUtils.getNotFound();
    }
  }

  public writeTarball(name: string): PassThrough & {abort?: () => void; done?: () => void} {
    const uploadStream: PassThrough & {abort?: () => void; done?: () => void} = new PassThrough();

    let streamEnded = 0;
    uploadStream.on('end', () => {
      streamEnded = 1;
    });

    try {
      this._fileExist(this.name, name).then(
        (exist: boolean): void => {
          if (exist) {
            debug('writeTarball name=%o already exists', name);
            this.logger.trace({url: this.name}, 'gcloud: @{url} package already exist on storage');
            uploadStream.emit('error', packageAlreadyExist(name));
          } else {
            const file = this.helper.getBucket().file(`${this.name}/${name}`);
            debug('writeTarball name=%o uploading', file.name);
            this.logger.info(
              {url: file.name},
              'gcloud: the @{url} is being uploaded to the storage'
            );
            const fileStream = file.createWriteStream({
              validation: this.config.validation || defaultValidation,
            });
            uploadStream.done = (): void => {
              const onEnd = (): void => {
                fileStream.on('response', (): void => {
                  debug('writeTarball name=%o success', file.name);
                  this.logger.trace(
                    {url: file.name},
                    'gcloud: @{url} has been successfully uploaded to the storage'
                  );
                  uploadStream.emit('success');
                });
              };
              if (streamEnded) {
                onEnd();
              } else {
                uploadStream.on('end', onEnd);
              }
            };

            fileStream._destroy = function (err: Error): void {
              if (err) {
                uploadStream.emit('error', errorUtils.getBadRequest(err.message));
                fileStream.emit('close');
              }
            };

            fileStream.on('open', (): void => {
              debug('writeTarball stream open for %o', file.name);
              this.logger.trace(
                {url: file.name},
                'gcloud: upload stream has been opened for @{url}'
              );
              uploadStream.emit('open');
            });

            fileStream.on('error', (err: Error): void => {
              this.logger.error({url: file.name}, 'gcloud: upload stream has failed for @{url}');
              fileStream.end();
              uploadStream.emit('error', errorUtils.getBadRequest(err.message));
            });

            uploadStream.abort = (): void => {
              this.logger.warn(
                {url: file.name},
                'gcloud: upload stream has been aborted for @{url}'
              );
              fileStream.destroy(undefined);
            };

            uploadStream.pipe(fileStream);
            uploadStream.emit('open');
          }
        },
        (err: Error): void => {
          uploadStream.emit('error', errorUtils.getInternalError(err.message));
        }
      );
    } catch (err: any) {
      uploadStream.emit('error', err);
    }
    return uploadStream;
  }

  public readTarball(name: string): PassThrough & {abort?: () => void} {
    const localReadStream: PassThrough & {abort?: () => void} = new PassThrough();
    const file: File = this.helper.getBucket().file(`${this.name}/${name}`);
    const bucketStream: Readable = file.createReadStream();
    debug('readTarball name=%o', file.name);
    this.logger.trace({url: file.name}, 'gcloud: reading tarball from @{url}');

    localReadStream.abort = function abortReadTarballCallback(): void {
      bucketStream.destroy(undefined);
    };

    bucketStream
      .on('error', (err: any): void => {
        if (err.code === 404) {
          debug('readTarball name=%o not found', file.name);
          this.logger.trace({url: file.name}, 'gcloud: tarball @{url} not found on storage');
          localReadStream.emit('error', errorUtils.getNotFound());
        } else {
          this.logger.error(
            {url: file.name},
            'gcloud: tarball @{url} has failed to be retrieved from storage'
          );
          localReadStream.emit('error', errorUtils.getBadRequest(err.message));
        }
      })
      .on('response', (response: any): void => {
        const size = response.headers['content-length'];
        const {statusCode} = response;
        if (statusCode !== 404) {
          if (size) {
            localReadStream.emit('open');
          }

          if (parseInt(size, 10) === 0) {
            this.logger.error(
              {url: file.name},
              'gcloud: tarball @{url} was fetched from storage and it is empty'
            );
            localReadStream.emit('error', errorUtils.getInternalError('file content empty'));
          } else if (parseInt(size, 10) > 0 && statusCode === 200) {
            localReadStream.emit('content-length', response.headers['content-length']);
          }
        } else {
          debug('readTarball name=%o not found (404)', file.name);
          this.logger.trace({url: file.name}, 'gcloud: tarball @{url} not found on storage');
          localReadStream.emit('error', errorUtils.getNotFound());
        }
      })
      .pipe(localReadStream);
    return localReadStream;
  }
}

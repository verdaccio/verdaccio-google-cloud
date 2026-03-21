import type {Config} from '@verdaccio/types';

export interface GoogleCloudConfig extends Config {
  bucket: string;
  projectId?: string;
  kind?: string;
  keyFilename?: string;
  validation?: GoogleValidation;
  resumable?: boolean;
  apiEndpoint?: string;
  datastoreEndpoint?: string;
}

export type GoogleValidation = boolean | string;

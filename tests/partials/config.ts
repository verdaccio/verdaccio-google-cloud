import type {GoogleCloudConfig} from '../../types';

const storageConfig = {
  self_path: './test',
  secret: '12345',
  uplinks: {
    npmjs: {
      url: 'http://never_use:0000/',
    },
  },
  server_id: '',
  user_agent: '',
  packages: {},
  logs: [],
  kind: 'partial_test_metadataDatabaseKey',
  bucket: 'verdaccio-plugin',
  projectId: 'verdaccio-01',
  security: {api: {legacy: true}},
  checkSecretKey(): string {
    return '';
  },
  getMatchedPackagesSpec(): void {
    return;
  },
} as unknown as GoogleCloudConfig;

export default storageConfig;

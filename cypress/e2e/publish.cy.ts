import {createRegistryConfig, publishTests} from '@verdaccio/e2e-ui';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';
const config = createRegistryConfig({registryUrl});

publishTests(config);

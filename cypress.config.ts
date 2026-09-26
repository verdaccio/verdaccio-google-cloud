import {setupVerdaccioTasks} from '@verdaccio/e2e-ui';

import {defineConfig} from 'cypress';

const registryUrl = process.env.VERDACCIO_URL || 'http://localhost:4873';

export default defineConfig({
  e2e: {
    baseUrl: registryUrl,
    setupNodeEvents(on) {
      setupVerdaccioTasks(on, {registryUrl});
    },
  },
  env: {
    VERDACCIO_URL: registryUrl,
  },
});

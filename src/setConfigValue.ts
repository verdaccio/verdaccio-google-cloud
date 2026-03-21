import debugCore from 'debug';

const debug = debugCore('verdaccio:plugin:google-cloud:config');

export default (configValue: any): string => {
  const envValue = process.env[configValue];
  if (envValue) {
    debug('resolved %o from env var → %o', configValue, envValue);
    return envValue;
  }
  debug('using literal value for %o', configValue);
  return configValue;
};

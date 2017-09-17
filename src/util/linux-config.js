import merge from 'lodash/merge';
import path from 'path';

import configFn from './config-fn';

function populateConfig(forgeConfig, configKey, targetArch) {
  const config = configFn(forgeConfig[configKey] || {}, targetArch);
  config.options = config.options || {};

  return config;
}

export function populate({ forgeConfig, configKey, targetArch }) {
  return {
    shared: populateConfig(forgeConfig, 'desktopLinuxConfig', targetArch),
    maker: populateConfig(forgeConfig, configKey, targetArch),
  };
}


export default function ({ config, pkgArch, dir, outPath }) {
  return merge({}, config.shared, config.maker, {
    arch: pkgArch,
    dest: path.dirname(outPath),
    src: dir,
  });
}

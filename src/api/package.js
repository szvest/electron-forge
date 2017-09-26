import 'colors';
import debug from 'debug';
import fs from 'fs-extra';
import glob from 'glob';
import path from 'path';
import pify from 'pify';
import packager from 'electron-packager';
import { hostArch } from 'electron-packager/targets';

import getForgeConfig from '../util/forge-config';
import runHook from '../util/hook';
import realOra, { fakeOra } from '../util/ora';
import packagerCompileHook from '../util/compile-hook';
import readPackageJSON from '../util/read-package-json';
import rebuildHook from '../util/rebuild';
import requireSearch from '../util/require-search';
import resolveDir from '../util/resolve-dir';

const d = debug('electron-forge:packager');

/**
 * @typedef {Object} PackageOptions
 * @property {string} [dir=process.cwd()] The path to the app to package
 * @property {boolean} [interactive=false] Whether to use sensible defaults or prompt the user visually
 * @property {string} [arch=process.arch] The target arch
 * @property {string} [platform=process.platform] The target platform.
 * @property {string} [outDir=`${dir}/out`] The path to the output directory for packaged apps
 */

/**
 * Resolves hooks if they are a path to a file (instead of a `Function`).
 */
function resolveHooks(hooks, dir) {
  if (hooks) {
    return hooks.map(hook => (typeof hook === 'string' ? requireSearch(dir, [hook]) : hook));
  }

  return [];
}

/**
 * Package an Electron application into an platform dependent format.
 *
 * @param {PackageOptions} providedOptions - Options for the Package method
 * @return {Promise} Will resolve when the package process is complete
 */
export default async (providedOptions = {}) => {
  // eslint-disable-next-line prefer-const, no-unused-vars
  let { dir, interactive, arch, platform } = Object.assign({
    dir: process.cwd(),
    interactive: false,
    arch: hostArch(),
    platform: process.platform,
  }, providedOptions);

  const ora = interactive ? realOra : fakeOra;

  const outDir = providedOptions.outDir || path.resolve(dir, 'out');
  let prepareSpinner = ora(`Preparing to Package Application for arch: ${(arch === 'all' ? 'ia32' : arch).cyan}`).start();
  let prepareCounter = 0;

  dir = await resolveDir(dir);
  if (!dir) {
    throw 'Failed to locate compilable Electron application';
  }

  const packageJSON = await readPackageJSON(dir);

  if (path.dirname(require.resolve(path.resolve(dir, packageJSON.main))) === dir) {
    console.error(`Entry point: ${packageJSON.main}`.red);
    throw 'The entry point to your application ("packageJSON.main") must be in a subfolder not in the top level directory';
  }

  const forgeConfig = await getForgeConfig(dir);
  let packagerSpinner;

  const packageOpts = Object.assign({
    asar: false,
    overwrite: true,
  }, forgeConfig.electronPackagerConfig, {
    afterCopy: [async (buildPath, electronVersion, pPlatform, pArch, done) => {
      if (packagerSpinner) {
        packagerSpinner.succeed();
        prepareCounter += 1;
        prepareSpinner = ora(`Preparing to Package Application for arch: ${(prepareCounter === 2 ? 'armv7l' : 'x64').cyan}`).start();
      }
      await fs.remove(path.resolve(buildPath, 'node_modules/electron-compile/test'));
      const bins = await pify(glob)(path.join(buildPath, '**/.bin/**/*'));
      for (const bin of bins) {
        await fs.remove(bin);
      }
      done();
    }, async (...args) => {
      prepareSpinner.succeed();
      await packagerCompileHook(dir, ...args);
    }, async (buildPath, electronVersion, pPlatform, pArch, done) => {
      const copiedPackageJSON = await readPackageJSON(buildPath);
      if (copiedPackageJSON.config && copiedPackageJSON.config.forge) {
        delete copiedPackageJSON.config.forge;
      }
      await fs.writeFile(path.resolve(buildPath, 'package.json'), JSON.stringify(copiedPackageJSON, null, 2));
      done();
    }].concat(resolveHooks(forgeConfig.electronPackagerConfig.afterCopy, dir)),
    afterExtract: resolveHooks(forgeConfig.electronPackagerConfig.afterExtract, dir),
    afterPrune: [async (buildPath, electronVersion, pPlatform, pArch, done) => {
      await rebuildHook(buildPath, electronVersion, pPlatform, pArch);
      packagerSpinner = ora('Packaging Application').start();
      done();
    }].concat(resolveHooks(forgeConfig.electronPackagerConfig.afterPrune, dir)),
    dir,
    arch,
    platform,
    out: outDir,
    electronVersion: packageJSON.devDependencies['electron-prebuilt-compile'],
  });
  packageOpts.quiet = true;
  if (typeof packageOpts.asar === 'object' && packageOpts.asar.unpack) {
    packagerSpinner.fail();
    throw new Error('electron-compile does not support asar.unpack yet.  Please use asar.unpackDir');
  }

  await runHook(forgeConfig, 'generateAssets');
  await runHook(forgeConfig, 'prePackage');

  d('packaging with options', packageOpts);

  await packager(packageOpts);

  await runHook(forgeConfig, 'postPackage');

  packagerSpinner.succeed();
};

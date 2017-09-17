import path from 'path';
import pify from 'pify';
import { zip } from 'cross-zip';

import { ensureFile } from '../../util/ensure-output';

export const isSupportedOnCurrentPlatform = async () => true;

export default async ({ dir, appName, targetPlatform, packageJSON }) => {
  const zipDir = targetPlatform === 'darwin' ? path.resolve(dir, `${appName}.app`) : dir;
  const zipPath = path.resolve(dir, '../make', `${path.basename(dir)}-${packageJSON.version}.zip`);

  await ensureFile(zipPath);
  await pify(zip)(zipDir, zipPath);

  return [zipPath];
};

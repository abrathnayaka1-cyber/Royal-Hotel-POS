import fs from 'fs';
import path from 'path';

/**
 * Application root resolution.
 *
 * PRODUCTION BUG THIS FIXES:
 * Both the static `dist/` folder and the JSON database used to be resolved with
 * `process.cwd()`. Process managers (PM2, systemd, cPanel "Node.js App",
 * Docker, cron) frequently start the app with a working directory that is NOT
 * the application folder. When that happened:
 *   - `express.static(cwd + '/dist')` pointed at nothing → every page load 500'd.
 *   - `cwd + '/data/pos_database.json'` pointed at nothing → the server silently
 *     created a BRAND NEW EMPTY DATABASE while the real one (products, bills,
 *     stock, users) sat untouched somewhere else. Staff would log in with the
 *     default password and see an empty shop.
 *
 * Resolving from the module location instead makes the app independent of the
 * working directory it happens to be launched from.
 */

// `__dirname` exists in the esbuild CJS production bundle (<appRoot>/dist) and
// in most dev runners. Guarded with `typeof` so it can never throw under ESM.
const moduleDir: string =
  typeof __dirname !== 'undefined' ? __dirname : process.cwd();

function findAppRoot(startDir: string): string {
  let dir = startDir;
  // Walk up looking for the package.json that marks the application root.
  for (let i = 0; i < 8; i++) {
    try {
      if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    } catch {
      /* unreadable dir – keep walking */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return startDir;
}

/** Absolute path to the application root (the folder holding package.json). */
export const APP_ROOT = findAppRoot(moduleDir);

/** Absolute path to the built frontend assets. */
export const DIST_DIR = path.join(APP_ROOT, 'dist');

/**
 * Resolve the persistent data directory.
 *
 * Priority:
 *   1. `POS_DATA_DIR` env var (recommended for VPS/Hostinger – keep data
 *      outside the deploy folder so redeploys never wipe it).
 *   2. A pre-existing `data/` next to the current working directory. This keeps
 *      EXISTING installs that were started from the app folder pointing at the
 *      exact same database file, so this fix can never orphan live data.
 *   3. `<appRoot>/data` – the cwd-independent default for new installs.
 */
export function resolveDataDir(): string {
  const fromEnv = process.env.POS_DATA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  const appRootData = path.join(APP_ROOT, 'data');
  const cwdData = path.join(process.cwd(), 'data');

  // Legacy-compatibility: an existing database under the cwd wins, so upgrading
  // never silently switches to a different (empty) database file.
  if (cwdData !== appRootData) {
    try {
      if (fs.existsSync(path.join(cwdData, 'pos_database.json'))) return cwdData;
    } catch {
      /* ignore */
    }
  }
  return appRootData;
}

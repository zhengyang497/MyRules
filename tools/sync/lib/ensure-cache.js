const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function ensureCache(cacheDir, manifest) {
  if (fs.existsSync(cacheDir)) {
    return { created: false, cacheDir };
  }

  const parent = path.dirname(cacheDir);
  fs.mkdirSync(parent, { recursive: true });

  try {
    execFileSync('git', ['clone', '--depth', '1', manifest.repo, cacheDir], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch (err) {
    const detail = err.stderr || err.message || String(err);
    throw new Error(`Failed to clone ${manifest.repo} into ${cacheDir}: ${detail}`);
  }

  return { created: true, cacheDir };
}

module.exports = { ensureCache };

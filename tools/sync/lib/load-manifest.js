const fs = require('node:fs');
const path = require('node:path');

const BUNDLED_MANIFEST = path.join(__dirname, '..', '..', '..', 'manifest.js');

function resolveManifestPath(cacheDir) {
  const inCache = path.join(cacheDir, 'manifest.js');
  if (fs.existsSync(inCache)) return inCache;
  if (fs.existsSync(BUNDLED_MANIFEST)) return BUNDLED_MANIFEST;
  return inCache;
}

function loadManifest(cacheDir) {
  const manifestPath = resolveManifestPath(cacheDir);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.js not found at ${manifestPath}`);
  }
  delete require.cache[require.resolve(manifestPath)];
  return require(manifestPath);
}

module.exports = { loadManifest, resolveManifestPath, BUNDLED_MANIFEST };

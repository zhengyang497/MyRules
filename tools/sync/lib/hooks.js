const path = require('node:path');
const fsutil = require('./fsutil');

function loadHookSources(dir) {
  const files = fsutil.listFilesWithExt(dir, '.js');
  return files.map((file) => {
    const name = path.basename(file, '.js');
    const resolved = path.resolve(file);
    delete require.cache[require.resolve(resolved)];
    const mod = require(resolved);
    if (!mod.meta || typeof mod.meta.event !== 'string' || !mod.meta.event) {
      throw new Error(`Hook source missing meta.event: ${file}`);
    }
    if (typeof mod.meta.description !== 'string' || !mod.meta.description) {
      throw new Error(`Hook source missing meta.description: ${file}`);
    }
    if (typeof mod.handle !== 'function') {
      throw new Error(`Hook source missing handle function: ${file}`);
    }
    return { name, file, meta: mod.meta, handle: mod.handle };
  });
}

module.exports = { loadHookSources };

// Process-local compatibility for Windows absolute globs in Expo prebuild.
// Do not patch node_modules or change relative-glob behavior.
const path = require('node:path');
const globby = require(path.resolve(__dirname, '../../mobile/node_modules/tinyglobby'));
for (const name of ['glob', 'globSync']) {
  const original = globby[name];
  globby[name] = (patterns, options) => {
    const items = Array.isArray(patterns) ? patterns : [patterns];
    const windowsAbsolute = items.every(pattern => typeof pattern === 'string' && /^[A-Za-z]:[\\/]/.test(pattern));
    if (!windowsAbsolute) return original(patterns, options);
    const normalized = items.map(pattern => pattern.replaceAll('\\', '/'));
    return original(Array.isArray(patterns) ? normalized : normalized[0], { ...options, absolute: true });
  };
}

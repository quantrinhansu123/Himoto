// Expo's generated route declarations may be absent or stale on a checkout.
// Use the documented CLI entry point before tsc, without starting Metro or
// loading local environment files: https://docs.expo.dev/router/reference/typed-routes/
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const result = spawnSync(process.execPath, [
  require.resolve('expo/bin/cli'), 'customize', 'tsconfig.json',
], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, EXPO_NO_DOTENV: '1' },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

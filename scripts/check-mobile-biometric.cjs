require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
async function main() {
  const values = new Map(), module = { exports: {} }, previousNow = Date.now, file = path.resolve('mobile/src/lib/biometric-lock.ts');
  let now = Date.now(), prompts = 0, enrolled = true, success = true, lastPrompt;
  Date.now = () => now;
  const nativeRequire = name => name === 'react-native' ? { Platform: { OS: 'android' } } : name === 'expo-local-authentication' ? {
    hasHardwareAsync: async () => true, isEnrolledAsync: async () => enrolled,
    authenticateAsync: async options => { prompts++; lastPrompt = options; return success ? { success: true } : { success: false, error: 'user_cancel' }; },
  } : name === 'expo-secure-store' ? {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only', getItemAsync: async key => values.get(key) || null,
    setItemAsync: async (key, value) => values.set(key, value), deleteItemAsync: async key => values.delete(key),
  } : (() => { throw Error('Unexpected native module ' + name); })();
  try {
    new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(nativeRequire, module, module.exports);
    const { biometricLock } = module.exports, origin = 'https://fixture.invalid';
    assert.equal(await biometricLock.enabled(origin, 7), false);
    success = false;
    await assert.rejects(() => biometricLock.set(origin, 7, true, 'session-one'), /Đã hủy/); assert.equal(await biometricLock.enabled(origin, 7), false);
    success = true; await biometricLock.set(origin, 7, true, 'session-one'); assert.equal(await biometricLock.enabled(origin, 7), true);
    assert.equal(lastPrompt.disableDeviceFallback, false); assert.equal(lastPrompt.biometricsSecurityLevel, 'strong');
    assert.equal(await biometricLock.enabled(origin, 8), false); assert.equal(await biometricLock.enabled('https://other.invalid', 7), false);
    biometricLock.notePasswordLogin(origin, 'session-one'); assert(biometricLock.hasPasswordProof(origin, 'session-one')); assert(!biometricLock.hasPasswordProof(origin, 'session-two'));
    const before = prompts; enrolled = false;
    await biometricLock.set(origin, 7, false, 'session-one'); assert.equal(prompts, before); assert.equal(await biometricLock.enabled(origin, 7), false);
    await assert.rejects(() => biometricLock.set(origin, 7, true, 'session-one'), /chưa có Face ID/);
    now += 300001; assert(!biometricLock.hasPasswordProof(origin, 'session-one'));
    await assert.rejects(() => biometricLock.set(origin, 7, false, 'session-one'), /chưa có Face ID/);
    console.log(JSON.stringify({ ok: true, checks: ['Cancellation never enables biometric lock; enabling requires enrolled strong biometrics and allows OS device-code fallback', 'Preference and fresh password proof are bound to origin/account/session, and password proof expires after five minutes', 'Fresh password login can disable an unavailable biometric lock without trapping the user in a login loop'], hardwareAcceptance: false }, null, 2));
  } finally { Date.now = previousNow; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

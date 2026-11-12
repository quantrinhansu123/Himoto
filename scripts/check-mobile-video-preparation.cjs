// Fixture file system and Expo boundary only. No device, codec, network or business writes.
require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, dependencies) {
  const shim = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', compiled)(name => {
    assert(Object.hasOwn(dependencies, name), 'Unexpected dependency: ' + name);
    return dependencies[name];
  }, shim, shim.exports);
  return shim.exports;
}
const id = '00112233-4455-4677-8899-aabbccddeeff';
const original = 'file:///camera/original.mov';
const owned = `file:///cache/himoto-video/${id}/`;
const encoded = owned + 'encoded.mp4';
const files = new Map(), directories = new Set(), deleted = [], calls = [], checks = [];
let listener, nativePrepare, nativeAvailable, cancelled, removed, afterListen, directoryFailure;
const uri = parts => new URL(parts.map(value => typeof value === 'string' ? value : value.uri)
  .reduce((base, part) => base.replace(/\/+$/, '') + '/' + part.replace(/^\/+/, ''))).href;
class File {
  constructor(...parts) { this.uri = parts.length === 1 ? String(parts[0]) : uri(parts); this.name = this.uri.split('/').at(-1); }
  get exists() { return files.has(this.uri); }
  get size() { return files.get(this.uri) || 0; }
  digest(algorithm) { assert.equal(algorithm, 'SHA-256'); return Promise.resolve('a'.repeat(64)); }
  copy(output) { files.set(output.uri, this.size); }
  delete() { deleted.push(this.uri); files.delete(this.uri); }
}
class Directory {
  constructor(...parts) { this.uri = uri(parts).replace(/\/?$/, '/'); }
  get exists() { return directories.has(this.uri); }
  create() { if (directoryFailure) throw Error('QA no disk space'); assert(!this.exists); directories.add(this.uri); }
  delete() { deleted.push(this.uri); directories.delete(this.uri); for (const file of files.keys()) if (file.startsWith(this.uri)) files.delete(file); }
}
const encoder = {
  addListener(name, callback) { assert.equal(name, 'onProgress'); listener = callback; afterListen?.(); return { remove() { removed++; listener = undefined; } }; },
  prepare(...args) { calls.push(args); return nativePrepare(...args); },
  async cancel(request) { assert.equal(request, id); cancelled++; },
};
const deps = {
  expo: { NativeModule: class {}, uuid: { v4: () => id }, requireOptionalNativeModule(name) { assert.equal(name, 'HimotoVideo'); return nativeAvailable ? encoder : null; } },
  'expo-file-system': { File, Directory, Paths: { cache: { uri: 'file:///cache/' } } },
};
const { prepareAndroidVideo } = load('mobile/src/lib/prepare-android-video.ts', deps);
function result(overrides = {}) { return { bytes: 8_000_000, duration: 59.8, width: 1280, height: 720, videoMimeType: 'video/avc', ...overrides }; }
function reset() {
  files.clear(); files.set(original, 80_000_000); directories.clear(); deleted.length = calls.length = 0;
  listener = undefined; cancelled = removed = 0; nativeAvailable = true; afterListen = undefined; directoryFailure = false;
  nativePrepare = async (request, source, destination, seconds) => {
    assert.equal(request, id); assert.equal(source, original); assert.equal(destination, encoded); assert([60, 180].includes(seconds));
    files.set(encoded, 8_000_000); return result();
  };
}
async function main() {
  reset(); const progress = [];
  nativePrepare = async () => {
    listener({ id: 'another-job', progress: 40 }); listener({ id, progress: NaN });
    listener({ id, progress: -2 }); listener({ id, progress: 42.9 }); listener({ id, progress: 160 });
    files.set(encoded, 8_000_000); return result();
  };
  const video = await prepareAndroidVideo(original, new AbortController().signal, 60, value => progress.push(value));
  assert.equal(video.uri, encoded); assert.equal(video.mimeType, 'video/mp4'); assert.equal(video.duration, 59.8);
  assert.equal(video.blob.size, video.size); assert.equal(await video.sha256(), 'a'.repeat(64));
  assert.deepEqual(progress, [0, 0, 42, 99, 100]); assert.equal(removed, 1); assert(files.has(original));
  video.dispose(); video.dispose(); assert.deepEqual(deleted, [owned]); assert.deepEqual([...files.keys()], [original]);
  checks.push('A large local source produces an owned MP4 with measured bytes/hash, scoped progress and idempotent disposal that preserves the original');

  for (const invalid of [result({ bytes: 0 }), result({ bytes: 18 * 1024 * 1024 + 1 }), result({ bytes: 7_999_999 }),
    result({ duration: 60.01 }), result({ duration: NaN }), result({ width: 1920 }), result({ height: 721 }),
    result({ height: 0 }), result({ videoMimeType: 'video/hevc' })]) {
    reset(); nativePrepare = async () => { files.set(encoded, 8_000_000); return invalid; };
    await assert.rejects(() => prepareAndroidVideo(original, new AbortController().signal, 60), /chưa hợp lệ/);
    assert.deepEqual([...files.keys()], [original]); assert.equal(removed, 1); assert(!directories.size);
  }
  reset(); nativePrepare = async () => result();
  await assert.rejects(() => prepareAndroidVideo(original, new AbortController().signal, 60), /chưa hợp lệ/);
  checks.push('Missing output, size mismatch, oversized/wrong-codec/wrong-resolution and invalid/overlong results never become upload-ready and reclaim only owned cache');

  reset(); nativePrepare = async () => { files.set(encoded, 29_000_000); return result({ bytes: 29_000_000, duration: 179.9, width: 720, height: 1280 }); };
  const shift = await prepareAndroidVideo(original, new AbortController().signal, 180); assert.equal(shift.duration, 179.9); shift.dispose();
  checks.push('Portrait and shift videos retain the three-minute/45-MiB business limits; contract output remains below 18 MiB');

  reset(); const pre = new AbortController(); pre.abort(); assert.equal(await prepareAndroidVideo(original, pre.signal, 60), null); assert(!calls.length);
  reset(); const onListen = new AbortController(); afterListen = () => onListen.abort();
  assert.equal(await prepareAndroidVideo(original, onListen.signal, 60), null); assert(!calls.length); assert(!directories.size); assert.equal(removed, 1);
  reset(); const onStart = new AbortController();
  assert.equal(await prepareAndroidVideo(original, onStart.signal, 60, () => onStart.abort()), null); assert(!calls.length); assert(!directories.size);
  reset(); const during = new AbortController(); let complete;
  nativePrepare = () => new Promise(resolve => { complete = resolve; });
  const preparing = prepareAndroidVideo(original, during.signal, 60);
  during.abort(); await Promise.resolve(); assert.equal(cancelled, 1);
  assert(directories.has(owned), 'The encoder may still hold its output; do not delete early');
  files.set(encoded, 8_000_000); complete(result());
  assert.equal(await preparing, null); assert.deepEqual([...files.keys()], [original]); assert.equal(removed, 1);
  reset(); const rejected = new AbortController(); nativePrepare = async () => { files.set(encoded, 1); rejected.abort(); throw Error('QA native cancellation'); };
  assert.equal(await prepareAndroidVideo(original, rejected.signal, 60), null); assert.deepEqual([...files.keys()], [original]);
  checks.push('Cancellation before start, during subscription/progress and during encoding never returns a video; cache survives until native settles, then is removed');

  reset(); nativePrepare = async () => { files.set(encoded, 10); throw Error('QA native timeout/codec failure'); };
  await assert.rejects(() => prepareAndroidVideo(original, new AbortController().signal, 60), /QA native/); assert.deepEqual([...files.keys()], [original]);
  reset(); nativeAvailable = false;
  await assert.rejects(() => prepareAndroidVideo(original, new AbortController().signal, 60), /Cập nhật bản cài/); assert(!directories.size);
  for (const source of ['https://fixture.invalid/private.mp4', 'file:///missing.mp4', original]) {
    reset(); if (source === original) files.set(original, 512 * 1024 * 1024 + 1);
    await assert.rejects(() => prepareAndroidVideo(source, new AbortController().signal, 60)); assert(!calls.length); assert(!directories.size);
  }
  reset(); directoryFailure = true; await assert.rejects(() => prepareAndroidVideo(original, new AbortController().signal, 60), /disk/); assert(!calls.length);
  reset(); files.set(owned + 'original.mp4', 1000);
  await assert.rejects(() => prepareAndroidVideo(owned + 'original.mp4', new AbortController().signal, 60), /video gốc/); assert(!deleted.length);
  checks.push('Missing native support, unreadable/remote/oversized sources, disk errors and source aliases fail without starting encoding or deleting selected files');

  reset(); let platform = 'android', androidCalls = 0, options;
  const asset = { uri: original, fileName: 'original.mov', type: 'video', mimeType: 'video/quicktime', duration: 59_000 };
  const pickerResult = async value => { options = value; return { canceled: false, assets: [asset] }; };
  const picker = { requestCameraPermissionsAsync: async () => ({ granted: true }), launchCameraAsync: pickerResult, launchImageLibraryAsync: pickerResult,
    UIImagePickerControllerQualityType: { Medium: 1 }, VideoExportPreset: { H264_1280x720: 6 } };
  const { selectRecordVideo } = load('mobile/src/lib/record-video.ts', {
    ...deps, 'expo-image-picker': picker, 'expo/fetch': { fetch() { throw Error('Unexpected network'); } },
    'react-native': { Platform: { get OS() { return platform; } } },
    './prepare-android-video': { async prepareAndroidVideo(source, signal, seconds, callback) { androidCalls++; assert.equal(source, original); assert.equal(seconds, 60); callback?.(30); return 'android-result'; } },
    '../../../shared/mobile-video': { MOBILE_MAX_VIDEO_BYTES: 45 * 1024 * 1024, MOBILE_CONTRACT_VIDEO_SECONDS: 60 },
  });
  assert.equal(await selectRecordVideo(false, new AbortController().signal), 'android-result'); assert.equal(androidCalls, 1);
  assert(!Object.hasOwn(options, 'videoQuality')); assert(!Object.hasOwn(options, 'videoExportPreset'));
  files.set(original, 1_000_000); platform = 'ios';
  const ios = await selectRecordVideo(false, new AbortController().signal); assert.equal(options.videoExportPreset, 6); assert.equal(androidCalls, 1); ios.dispose();
  platform = 'web'; asset.file = Object.assign(new Blob(['video']), { name: 'web.mp4' });
  const web = await selectRecordVideo(false, new AbortController().signal); assert.equal(web.size, 5); assert.equal(androidCalls, 1); web.dispose();
  asset.duration = 61_000; await assert.rejects(() => selectRecordVideo(false, new AbortController().signal), /60 giây/);
  checks.push('Picker dispatches large Android sources to the native preparer, preserves iOS presets/web files, and rejects overlong selections before encoding');
  console.log(JSON.stringify({ passed: checks.length, checks, nativeCodec: 'Not executed: APK packaging and device acceptance are deferred by request', operationalWrites: 0 }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
